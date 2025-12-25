import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "npm:jszip@3.10.1";
import { corsHeaders, handleCors } from '../_shared/cors.ts';

function sanitizeVersion(raw?: string): string {
  if (raw && raw.trim()) {
    // Use provided version, only sanitize truly unsafe chars
    return raw.trim().replace(/[^a-zA-Z0-9._-]/g, '-');
  }
  // Default to simple incrementing version
  const now = new Date();
  return `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}-${now.getHours()}${now.getMinutes()}`;
}

// Embedded PHP plugin template with placeholders for version/platform URL
const TEMPLATE_CONTENT = `<?php
/**
 * Plugin Name: WP Plugin Hub Connector
 * Plugin URI: https://wphub.pro
 * Description: Connects WordPress site to Plugin Hub for centralized plugin management
 * Version: {{VERSION}}
 * Author: Plugin Hub
 * Author URI: https://wphub.pro
 * Text Domain: wp-plugin-hub-connector
 */

if (!defined('ABSPATH')) {
  exit;
}

define('WP_PLUGIN_HUB_VERSION', '{{VERSION}}');
define('WP_PLUGIN_HUB_PLATFORM_URL', '{{PLATFORM_URL}}');

class WP_Plugin_Hub_Connector {
  private $api_key;
  private $site_id;
  private $platform_url;
    
  public function __construct() {
    $this->platform_url = WP_PLUGIN_HUB_PLATFORM_URL;
    $this->api_key = get_option('wp_plugin_hub_api_key', '');
    $this->site_id = get_option('wp_plugin_hub_site_id', '');
        
    add_action('admin_menu', array($this, 'add_admin_menu'));
    add_action('admin_init', array($this, 'register_settings'));
    add_action('rest_api_init', array($this, 'register_rest_routes'));
        
    // Schedule cron job for syncing
    if (!wp_next_scheduled('wp_plugin_hub_sync')) {
      wp_schedule_event(time(), 'hourly', 'wp_plugin_hub_sync');
    }
    add_action('wp_plugin_hub_sync', array($this, 'sync_with_platform'));
        
    // Check for pending commands every 5 minutes
    if (!wp_next_scheduled('wp_plugin_hub_check_commands')) {
      wp_schedule_event(time(), 'every_5_minutes', 'wp_plugin_hub_check_commands');
    }
    add_action('wp_plugin_hub_check_commands', array($this, 'check_and_execute_commands'));
        
    // Add custom cron schedule
    add_filter('cron_schedules', array($this, 'add_cron_schedules'));
  }
    
  public function add_cron_schedules($schedules) {
    $schedules['every_5_minutes'] = array(
      'interval' => 300,
      'display'  => __('Every 5 Minutes', 'wp-plugin-hub-connector')
    );
    return $schedules;
  }
    
  public function register_rest_routes() {
    register_rest_route('wphub/v1', '/ping', array(
      'methods' => 'POST',
      'callback' => array($this, 'rest_ping'),
      'permission_callback' => array($this, 'verify_api_key'),
    ));
        
    register_rest_route('wphub/v1', '/installPlugin', array(
      'methods' => 'POST',
      'callback' => array($this, 'rest_install_plugin'),
      'permission_callback' => array($this, 'verify_api_key'),
    ));
        
    register_rest_route('wphub/v1', '/activatePlugin', array(
      'methods' => 'POST',
      'callback' => array($this, 'rest_activate_plugin'),
      'permission_callback' => array($this, 'verify_api_key'),
    ));
        
    register_rest_route('wphub/v1', '/deactivatePlugin', array(
      'methods' => 'POST',
      'callback' => array($this, 'rest_deactivate_plugin'),
      'permission_callback' => array($this, 'verify_api_key'),
    ));
        
    register_rest_route('wphub/v1', '/uninstallPlugin', array(
      'methods' => 'POST',
      'callback' => array($this, 'rest_uninstall_plugin'),
      'permission_callback' => array($this, 'verify_api_key'),
    ));
  }
    
  public function verify_api_key($request) {
    $params = $request->get_json_params();
    $provided_key = isset($params['api_key']) ? $params['api_key'] : '';
        
    return $provided_key === $this->api_key;
  }
    
  // (rest omitted)
}
?>
`;

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  // Supabase client (service role) - relies on env vars being set
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json().catch(() => ({}));
    // Default/sanitize version to avoid odd filenames
    const version = sanitizeVersion(body.version);
    const platformUrl = body.platform_url || Deno.env.get('PLATFORM_URL') || Deno.env.get('YOUR_PLATFORM_URL') || 'https://wphub.pro';

    // Build plugin from template with proper folder structure
    const zip = new JSZip();
    const pluginPhp = TEMPLATE_CONTENT
      .replace(/{{VERSION}}/g, version)
      .replace(/{{PLATFORM_URL}}/g, platformUrl);
    // Create folder structure: wp-plugin-hub-connector/wp-plugin-hub-connector.php
    zip.file('wp-plugin-hub-connector/wp-plugin-hub-connector.php', pluginPhp);

    const zipBytes = await zip.generateAsync({ type: 'uint8array' });

    // Upload to Storage bucket "Connectors"
    const objectPath = `wp-plugin-hub-connector-${version}.zip`;
    const uploadRes = await supabase.storage
      .from('Connectors')
      .upload(objectPath, zipBytes, {
        contentType: 'application/zip',
        upsert: true,
      });
    if (uploadRes.error) {
      return new Response(JSON.stringify({ error: 'Failed to upload connector zip: ' + uploadRes.error.message }), { status: 500, headers: corsHeaders });
    }

    const { data: publicData } = supabase.storage.from('Connectors').getPublicUrl(objectPath);
    const fileUrl = publicData?.publicUrl || '';

    // Insert connector record with both plugin_code (PHP source) and file_url (ZIP download)
    const { data: connector, error: connectorError } = await supabase.from('connectors').insert({
      version,
      plugin_code: pluginPhp,
      file_url: fileUrl,
      description: body.description ?? '',
    }).select();
    if (connectorError || !connector) {
      return new Response(JSON.stringify({ error: 'Failed to create connector: ' + (connectorError?.message || 'Unknown error') }), { status: 500, headers: corsHeaders });
    }

    // Update site_settings active_connector_version (best-effort)
    await supabase.from('site_settings').upsert({
      setting_key: 'active_connector_version',
      setting_value: version,
      description: 'Active connector version',
    });

    return new Response(JSON.stringify({ success: true, file_url: fileUrl, version, connector_id: connector[0]?.id || null }), { status: 200, headers: corsHeaders });
  } catch (err: any) {
    console.error("generateConnectorPlugin error", err);
    const message = err instanceof Error ? err.message : (typeof err === 'string' ? err : 'Unknown error');
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders });
  }
});
