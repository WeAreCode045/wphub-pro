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

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Content-Type": "application/json"
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
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
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS_HEADERS });
    }

    const { api_key, wp_version, plugins, site_url } = await req.json();
    if (!api_key) {
      return new Response(JSON.stringify({ error: 'API key is required' }), { status: 400, headers: CORS_HEADERS });
    }

    // Find site by API key
    const sites = await base44.asServiceRole.entities.Site.filter({ api_key });
    if (!sites || sites.length === 0) {
      return new Response(JSON.stringify({ error: 'Invalid API key' }), { status: 401, headers: { 'content-type': 'application/json' } });
    }
    const site = sites[0];
    await base44.asServiceRole.entities.Site.update(site.id, {
      last_connection: new Date().toISOString(),
      wp_version: wp_version || site.wp_version,
      status: 'active'
    });

    // Update plugin installations status
    if (plugins && Array.isArray(plugins)) {
      const installations = await base44.asServiceRole.entities.PluginInstallation.filter({ site_id: site.id });
      for (const pluginData of plugins) {
        const installation = installations.find((i: any) => i.plugin_id === pluginData.plugin_id);
        if (installation) {
          let newStatus = installation.status;
          if (pluginData.version) {
            newStatus = pluginData.is_active ? 'active' : 'inactive';
          } else {
            newStatus = installation.is_enabled ? 'available' : 'unavailable';
          }
          await base44.asServiceRole.entities.PluginInstallation.update(installation.id, {
            is_active: pluginData.is_active,
            status: newStatus,
            installed_version: pluginData.version || null,
            last_sync: new Date().toISOString()
          });
        }
      }
    }
    return new Response(JSON.stringify({ success: true, message: 'Site data synchronized successfully', site_id: site.id }), { headers: { 'content-type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || String(error) }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
});