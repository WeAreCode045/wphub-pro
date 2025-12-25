declare const Deno: any;
// @ts-ignore
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createClientFromRequest } from '../base44Shim.js';

function getSupabaseClientOrShim(req: Request) {
  const url = Deno.env.get('SB_URL') || Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SB_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (url && key) {
    return createClient(url, key);
  }
  return createClientFromRequest(req);
}

import { corsHeaders, handleCors } from '../_shared/cors.ts';

serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;
  try {
    const base44 = getSupabaseClientOrShim(req);
    // Require Bearer token auth
    const authHeader = req.headers.get('authorization');
    let user = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      if (base44.auth && base44.auth.getUser) {
        const { data } = await base44.auth.getUser(token);
        user = data?.user ?? null;
      } else if (base44.auth && base44.auth.me) {
        user = await base44.auth.me();
      }
    }
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const { site_id, plugin_id } = await req.json();
    if (!site_id || !plugin_id) {
      return new Response(JSON.stringify({ error: 'Missing required parameters' }), { status: 400, headers: corsHeaders });
    }

    // Load site and plugin
    const sites = await base44.asServiceRole.entities.Site.filter({ id: site_id });
    if (!sites || sites.length === 0) return new Response(JSON.stringify({ error: 'Site not found' }), { status: 404, headers: corsHeaders });
    const site = sites[0];
    const plugins = await base44.asServiceRole.entities.Plugin.filter({ id: plugin_id });
    if (!plugins || plugins.length === 0) return new Response(JSON.stringify({ error: 'Plugin not found' }), { status: 404, headers: corsHeaders });
    const plugin = plugins[0];

    // Call connector endpoint
    const connectorUrl = `${site.url.replace(/\/$/, '')}/wp-json/wphub/v1/deactivatePlugin`;
    const response = await fetch(connectorUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: site.api_key, plugin_slug: plugin.slug })
    });
    if (!response.ok) {
      const errorText = await response.text().catch(()=>'');
      return new Response(JSON.stringify({ success: false, error: `Connector error: ${response.status} - ${errorText}` }), { status: 500 });
    }
    const result = await response.json();
    if (result.success) {
      // Update Site.plugins
      const currentPlugins = site.plugins || [];
      const pluginIndex = currentPlugins.findIndex((p: any) => p.plugin_id === plugin_id);
      if (pluginIndex >= 0) {
        currentPlugins[pluginIndex].is_activated = 0;
      }
      await base44.asServiceRole.entities.Site.update(site_id, {
        plugins: currentPlugins,
        connection_checked_at: new Date().toISOString()
      });
    }
    return new Response(JSON.stringify({ success: result.success, message: result.message }), { headers: { 'content-type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || String(error) }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
});