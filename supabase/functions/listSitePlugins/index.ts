import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders, handleCors } from '../_shared/cors.ts';

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  try {
    const body = await req.json().catch(() => ({}));
    const site_url = (body.site_url || '').replace(/\/$/, '');
    const api_key = body.api_key || '';

    if (!site_url || !api_key) {
      return new Response(JSON.stringify({ error: 'Missing site_url or api_key' }), { status: 400, headers: corsHeaders });
    }

    // Try custom connector endpoint first
    let url = `${site_url}/wp-json/wphub/v1/getInstalledPlugins`;
    let wpRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key })
    });

    let text = await wpRes.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    // If custom endpoint not found, try standard WordPress plugins endpoint
    if (wpRes.status === 404) {
      url = `${site_url}/wp-json/wp/v2/plugins`;
      wpRes = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${api_key}`
        }
      });
      
      text = await wpRes.text();
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
    }

    if (!wpRes.ok) {
      return new Response(JSON.stringify({ error: 'WordPress returned error', status: wpRes.status, data }), { status: 502, headers: corsHeaders });
    }

    const plugins = Array.isArray(data) ? data : (data.plugins ?? data);
    return new Response(JSON.stringify({ success: true, plugins }), { status: 200, headers: corsHeaders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
  }
});