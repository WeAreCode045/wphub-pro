import { authMeWithToken, extractBearerFromReq } from '../_helpers.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;
  try {
    const token = extractBearerFromReq(req);
    const user = await authMeWithToken(token);
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const { site_id, plugin_id } = await req.json();
    if (!site_id || !plugin_id) return new Response(JSON.stringify({ error: 'Missing required parameters' }), { status: 400, headers: corsHeaders });

    const supa = Deno.env.get('SB_URL')?.replace(/\/$/, '') || '';
    const serviceKey = Deno.env.get('SB_SERVICE_ROLE_KEY');

    // Load site
    const siteRes = await fetch(`${supa}/rest/v1/sites?id=eq.${encodeURIComponent(String(site_id))}`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
    if (!siteRes.ok) return new Response(JSON.stringify({ error: 'Failed to load site' }), { status: 500, headers: corsHeaders });
    const sites = await siteRes.json();
    if (!Array.isArray(sites) || sites.length === 0) return new Response(JSON.stringify({ error: 'Site not found' }), { status: 404, headers: corsHeaders });
    const site = sites[0];

    // Load plugin
    const pluginRes = await fetch(`${supa}/rest/v1/plugins?id=eq.${encodeURIComponent(String(plugin_id))}`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
    if (!pluginRes.ok) return new Response(JSON.stringify({ error: 'Failed to load plugin' }), { status: 500, headers: corsHeaders });
    const plugins = await pluginRes.json();
    if (!Array.isArray(plugins) || plugins.length === 0) return new Response(JSON.stringify({ error: 'Plugin not found' }), { status: 404, headers: corsHeaders });
    const plugin = plugins[0];

    // Call connector endpoint
    const connectorUrl = `${site.url.replace(/\/$/, '')}/wp-json/wphub/v1/activatePlugin`;
    const response = await fetch(connectorUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: site.api_key, plugin_slug: plugin.slug }) });
    if (!response.ok) {
      const errorText = await response.text().catch(()=>'');
      return new Response(JSON.stringify({ success: false, error: `Connector error: ${response.status} - ${errorText}` }), { status: 500, headers: corsHeaders });
    }
    const result = await response.json();

    if (result.success) {
      const currentPlugins = site.plugins || [];
      const idx = currentPlugins.findIndex((p:any)=>p.plugin_id === plugin_id);
      if (idx >= 0) {
        currentPlugins[idx].is_activated = 1;
      }
      await fetch(`${supa}/rest/v1/sites?id=eq.${encodeURIComponent(String(site_id))}`, { method: 'PATCH', headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ plugins: currentPlugins, connection_checked_at: new Date().toISOString() }) });
    }

    return new Response(JSON.stringify({ success: result.success, message: result.message }), { status: 200, headers: corsHeaders });
  } catch (err:any) {
    console.error('activatePlugin error', err);
    const message = err instanceof Error ? err.message : (typeof err === 'string' ? err : 'Unknown error');
    return new Response(JSON.stringify({ success: false, error: message }), { status: 500, headers: corsHeaders });
  }
});

export {};
