import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from '../_shared/cors.ts';

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const site_id = body.site_id;
    const plugin_slug = body.plugin_slug;

    if (!site_id || !plugin_slug) {
      return new Response(JSON.stringify({ error: 'Missing site_id or plugin_slug' }), { status: 400, headers: corsHeaders });
    }

    // Get site details
    const { data: site, error: siteError } = await supabase.from('sites').select('url, api_key').eq('id', site_id).single();
    if (siteError || !site) {
      return new Response(JSON.stringify({ error: 'Site not found' }), { status: 404, headers: corsHeaders });
    }

    const site_url = (site.url || '').replace(/\/$/, '');
    const api_key = site.api_key;

    if (!site_url || !api_key) {
      return new Response(JSON.stringify({ error: 'Site missing URL or API key' }), { status: 400, headers: corsHeaders });
    }

    // Check if custom connector endpoints are available
    const pingUrl = `${site_url}/wp-json/wphub/v1/ping`;
    const pingRes = await fetch(pingUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key })
    });

    if (!pingRes.ok) {
      return new Response(JSON.stringify({ 
        error: 'WP Plugin Hub Connector is not properly configured on this site. Please update the connector plugin and try again.',
        details: 'The connector endpoints are not responding correctly'
      }), { status: 502, headers: corsHeaders });
    }

    // Get current plugin status
    const pluginsUrl = `${site_url}/wp-json/wphub/v1/getInstalledPlugins`;
    const pluginsRes = await fetch(pluginsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key })
    });

    let isActive = false;
    if (pluginsRes.ok) {
      const pluginsData = await pluginsRes.json();
      const plugins = pluginsData.plugins || [];
      const plugin = plugins.find((p: any) => p.slug === plugin_slug || p.slug.startsWith(plugin_slug + '/'));
      if (plugin) {
        isActive = plugin.status === 'active';
      }
    }

    // Determine which endpoint to call
    const endpoint = isActive ? 'deactivatePlugin' : 'activatePlugin';
    const toggleUrl = `${site_url}/wp-json/wphub/v1/${endpoint}`;

    // Call toggle endpoint
    const toggleRes = await fetch(toggleUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key, plugin_slug })
    });

    if (!toggleRes.ok) {
      const errorData = await toggleRes.text();
      console.error(`[togglePluginState] ${endpoint} failed:`, toggleRes.status, errorData);
      
      return new Response(JSON.stringify({ 
        error: `Failed to ${endpoint === 'activatePlugin' ? 'activate' : 'deactivate'} plugin. Please ensure the connector plugin is properly installed and configured.`,
        status: toggleRes.status
      }), { status: 502, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ 
      success: true,
      plugin_slug,
      action: endpoint,
      new_status: isActive ? 'inactive' : 'active'
    }), { status: 200, headers: corsHeaders });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[togglePluginState] Error:', msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
  }
});

