import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from '../_shared/cors.ts';

// Helper function to fetch with timeout
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

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

    // Validate plugin slug format (reject "." and other invalid formats)
    if (plugin_slug === '.' || plugin_slug.startsWith('/') || plugin_slug.includes('..')) {
      return new Response(JSON.stringify({ error: 'Invalid plugin slug format' }), { status: 400, headers: corsHeaders });
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
    let pingRes;
    try {
      pingRes = await fetchWithTimeout(pingUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key })
      }, 5000);
    } catch (err) {
      console.error('[togglePluginState] Ping timeout or error:', err instanceof Error ? err.message : String(err));
      return new Response(JSON.stringify({ 
        error: 'WordPress site is not responding. Please check the site URL and connector configuration.',
        details: 'Connection timeout'
      }), { status: 503, headers: corsHeaders });
    }

    if (!pingRes.ok) {
      const pingText = await pingRes.text();
      console.error('[togglePluginState] Ping failed:', pingRes.status, pingText);
      return new Response(JSON.stringify({ 
        error: 'WP Plugin Hub Connector is not properly configured on this site.',
        details: `Ping failed with status ${pingRes.status}`
      }), { status: 502, headers: corsHeaders });
    }

    // Get current plugin status
    const pluginsUrl = `${site_url}/wp-json/wphub/v1/getInstalledPlugins`;
    let pluginsRes;
    try {
      pluginsRes = await fetchWithTimeout(pluginsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key })
      }, 5000);
    } catch (err) {
      console.error('[togglePluginState] Get plugins timeout:', err instanceof Error ? err.message : String(err));
      return new Response(JSON.stringify({ 
        error: 'Could not fetch plugin list from site. Site may be slow or unreachable.',
        details: 'Connection timeout'
      }), { status: 503, headers: corsHeaders });
    }

    let isActive = false;
    if (pluginsRes.ok) {
      try {
        const pluginsData = await pluginsRes.json();
        const plugins = pluginsData.plugins || [];
        const plugin = plugins.find((p: any) => p.slug === plugin_slug || p.slug.startsWith(plugin_slug + '/'));
        if (plugin) {
          isActive = plugin.status === 'active';
        }
      } catch (err) {
        console.error('[togglePluginState] Error parsing plugins response:', err instanceof Error ? err.message : String(err));
      }
    }

    // Determine which endpoint to call
    const endpoint = isActive ? 'deactivatePlugin' : 'activatePlugin';
    const toggleUrl = `${site_url}/wp-json/wphub/v1/${endpoint}`;

    // Call toggle endpoint
    let toggleRes;
    try {
      toggleRes = await fetchWithTimeout(toggleUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key, plugin_slug })
      }, 10000);
    } catch (err) {
      console.error(`[togglePluginState] ${endpoint} timeout:`, err instanceof Error ? err.message : String(err));
      return new Response(JSON.stringify({ 
        error: `Plugin ${isActive ? 'deactivation' : 'activation'} timed out. The operation may still have succeeded. Please refresh to verify.`,
        details: 'Connection timeout'
      }), { status: 503, headers: corsHeaders });
    }

    if (!toggleRes.ok) {
      const errorData = await toggleRes.text();
      console.error(`[togglePluginState] ${endpoint} failed:`, toggleRes.status, errorData);
      
      return new Response(JSON.stringify({ 
        error: `Failed to ${endpoint === 'activatePlugin' ? 'activate' : 'deactivate'} plugin. The WordPress connector may need to be updated.`,
        details: `HTTP ${toggleRes.status}`
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
    console.error('[togglePluginState] Unexpected error:', msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
  }
});

