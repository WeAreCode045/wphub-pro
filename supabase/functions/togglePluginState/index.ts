
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

    // Get current plugin list to determine state
    const listUrl = `${site_url}/wp-json/wp/v2/plugins`;
    const listRes = await fetch(listUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${api_key}`
      }
    });

    let currentPlugins: any[] = [];
    if (listRes.ok) {
      const listText = await listRes.text();
      try {
        currentPlugins = JSON.parse(listText);
      } catch { }
    }

    const currentPlugin = currentPlugins.find((p: any) => 
      p.plugin && (p.plugin.includes(plugin_slug) || p.plugin.startsWith(plugin_slug + '/'))
    );

    const isCurrentlyActive = currentPlugin?.status === 'active';
    const action = isCurrentlyActive ? 'deactivatePlugin' : 'activatePlugin';

    // Try custom connector endpoint first
    let toggleUrl = `${site_url}/wp-json/wphub/v1/${action}`;
    let toggleRes = await fetch(toggleUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key, plugin_slug })
    });

    let toggleText = await toggleRes.text();
    let toggleData: any;
    try { toggleData = JSON.parse(toggleText); } catch { toggleData = { raw: toggleText }; }

    // If custom endpoint not found, try standard WordPress endpoint
    if (toggleRes.status === 404) {
      toggleUrl = `${site_url}/wp-json/wp/v2/plugins/${encodeURIComponent(plugin_slug)}`;
      toggleRes = await fetch(toggleUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${api_key}`
        },
        body: JSON.stringify({ status: isCurrentlyActive ? 'inactive' : 'active' })
      });

      toggleText = await toggleRes.text();
      try { toggleData = JSON.parse(toggleText); } catch { toggleData = { raw: toggleText }; }
    }

    if (!toggleRes.ok) {
      return new Response(JSON.stringify({ error: 'Failed to toggle plugin', status: toggleRes.status, details: toggleData }), { status: 502, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      plugin_slug, 
      action,
      new_status: isCurrentlyActive ? 'inactive' : 'active'
    }), { status: 200, headers: corsHeaders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
  }});