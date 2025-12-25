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
    add_action('admin_enqueue_scripts', array($this, 'admin_styles'));
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

  public function add_admin_menu() {
    add_menu_page(
      'WP Plugin Hub',
      'Plugin Hub',
      'manage_options',
      'wp-plugin-hub',
      array($this, 'admin_page'),
      'dashicons-cloud',
      65
    );
  }

  public function admin_styles($hook) {
    if ($hook !== 'toplevel_page_wp-plugin-hub') {
      return;
    }
    wp_add_inline_style('wp-admin', '
      .wphub-wrap { max-width: 800px; margin: 20px auto; }
      .wphub-card { background: #fff; border: 1px solid #ccd0d4; border-radius: 8px; padding: 24px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
      .wphub-card h2 { margin-top: 0; color: #1d2327; display: flex; align-items: center; gap: 10px; }
      .wphub-card h2 .dashicons { color: #6366f1; }
      .wphub-status { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 20px; font-size: 13px; font-weight: 500; }
      .wphub-status.connected { background: #d1fae5; color: #065f46; }
      .wphub-status.disconnected { background: #fee2e2; color: #991b1b; }
      .wphub-info { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 6px; padding: 16px; margin: 16px 0; }
      .wphub-info p { margin: 0; color: #0369a1; }
    ');
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
    
  public function register_settings() {
    register_setting('wp_plugin_hub_group', 'wp_plugin_hub_api_key');
    register_setting('wp_plugin_hub_group', 'wp_plugin_hub_site_id');
  }

  public function rest_ping($request) {
    $params = $request->get_json_params();
    $provided_key = isset($params['api_key']) ? $params['api_key'] : '';
    if ($provided_key !== $this->api_key || empty($provided_key)) {
      return new WP_REST_Response(array(
        'ok' => false,
        'message' => 'Invalid or missing API key'
      ), 401);
    }
    return new WP_REST_Response(array(
      'ok' => true,
      'site_id' => $this->site_id,
      'platform_url' => $this->platform_url,
      'message' => 'Connector is active'
    ), 200);
  }

  private function get_admin_page_url($extra = array()) {
    $url = admin_url('admin.php?page=wp-plugin-hub');
    if (!empty($extra) && is_array($extra)) {
      foreach ($extra as $k => $v) {
        $url = add_query_arg($k, $v, $url);
      }
    }
    return $url;
  }

  public function admin_page() {
    // Optional test connection to platform
    if (isset($_GET['test_connection']) && $_GET['test_connection'] === '1') {
      $response = wp_remote_get($this->platform_url, array('timeout' => 10));
      if (is_wp_error($response)) {
        echo '<div class="notice notice-error"><p>Platform verbinding mislukt: ' . esc_html($response->get_error_message()) . '</p></div>';
      } else {
        $code = wp_remote_retrieve_response_code($response);
        echo '<div class="notice notice-success"><p>Platform bereikbaar (HTTP ' . esc_html($code) . ').</p></div>';
      }
    }

    $api_key = get_option('wp_plugin_hub_api_key', '');
    $site_id = get_option('wp_plugin_hub_site_id', '');

    echo '<div class="wrap wphub-wrap">';
    echo '<div class="wphub-card">';
    echo '<h2><span class="dashicons dashicons-cloud"></span> WP Plugin Hub Connector</h2>';
    echo '<p style="color: #64748b;">Beheer je plugins en themes centraal via het WP Plugin Hub dashboard.</p>';
    echo '<div class="wphub-info"><p><strong>Dashboard:</strong> <a href="' . esc_url($this->platform_url) . '" target="_blank">' . esc_html($this->platform_url) . '</a></p></div>';

    // Settings form
    echo '<form method="post" action="' . esc_url(admin_url('options.php')) . '">';
    settings_fields('wp_plugin_hub_group');
    echo '<table class="form-table">';
    echo '<tr><th scope="row"><label for="wp_plugin_hub_api_key">API Key</label></th>';
    echo '<td><input name="wp_plugin_hub_api_key" id="wp_plugin_hub_api_key" type="text" class="regular-text" value="' . esc_attr($api_key) . '" /></td></tr>';
    echo '<tr><th scope="row"><label for="wp_plugin_hub_site_id">Site ID</label></th>';
    echo '<td><input name="wp_plugin_hub_site_id" id="wp_plugin_hub_site_id" type="text" class="regular-text" value="' . esc_attr($site_id) . '" /></td></tr>';
    echo '</table>';
    submit_button('Instellingen opslaan');
    echo '</form>';

    // Actions
    $test_url = esc_url($this->get_admin_page_url(array('test_connection' => '1')));
    echo '<p><a href="' . $test_url . '" class="button button-secondary"><span class="dashicons dashicons-yes"></span> Test verbinding met platform</a></p>';

    echo '</div>'; // card
    echo '</div>'; // wrap
  }
}

// Instantiate the connector to register hooks
new WP_Plugin_Hub_Connector();
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
