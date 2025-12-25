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

    const { site_id } = await req.json();
    if (!site_id) {
      return new Response(JSON.stringify({ error: 'Missing site_id' }), { status: 400, headers: corsHeaders });
    }
    // Get site details
    const sites = await base44.asServiceRole.entities.Site.filter({ id: site_id });
    if (!sites || sites.length === 0) {
      return new Response(JSON.stringify({ error: 'Site not found' }), { status: 404, headers: corsHeaders });
    }
    const site = sites[0];
    // Call WordPress REST API to get all plugins using connector endpoint
    const wpEndpoint = `${site.url}/wp-json/wphub/v1/getInstalledPlugins`;
    const wpResponse = await fetch(wpEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: site.api_key })
    });
    if (!wpResponse.ok) {
      const errorText = await wpResponse.text();
      return new Response(JSON.stringify({ error: 'Failed to connect to WordPress site', details: errorText, status: wpResponse.status }), { status: 502 });
    }
    const result = await wpResponse.json();
    if (!result.success || !result.plugins) {
      return new Response(JSON.stringify({ error: 'Failed to get plugins from WordPress', details: result.message || 'Unknown error' }), { status: 500 });
    }
    // Format plugins data
    const plugins = result.plugins.map((plugin: any) => ({
      name: plugin.name,
      slug: plugin.slug,
      version: plugin.version,
      description: plugin.description || '',
      is_active: plugin.is_active || false
    }));
    return new Response(JSON.stringify({ success: true, plugins, total: plugins.length }), { headers: { 'content-type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || String(error) }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
});