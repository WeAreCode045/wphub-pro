import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from '../_shared/cors.ts';

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  // Require authentication
  const authHeader = req.headers.get("authorization") || "";
  const jwt = authHeader.replace(/^Bearer /i, "");
  if (!jwt) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });
  }

  // Supabase client (service role)
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json();
    const { version, plugin_code, file_url, description } = body;
    if (!version) {
      return new Response(JSON.stringify({ error: "Missing required parameter: version" }), { status: 400, headers: corsHeaders });
    }

    // Allow plugin_code/file_url to be optional; fall back to empty strings so the insert succeeds
    const safePluginCode = plugin_code ?? '';
    const safeFileUrl = file_url ?? '';
    const safeDescription = description ?? '';

    // Insert connector plugin
    const { data: connector, error: connectorError } = await supabase.from("connectors").insert({
      version,
      plugin_code: safePluginCode,
      file_url: safeFileUrl,
      description: safeDescription,
    }).select();
    if (connectorError || !connector) {
      return new Response(JSON.stringify({ error: "Failed to create connector: " + (connectorError?.message || "Unknown error") }), { status: 500, headers: corsHeaders });
    }

    // Update site_settings active_connector_version (optional, adjust as needed)
    await supabase.from("site_settings").insert({
      setting_key: "active_connector_version",
      setting_value: version,
      description: "Active connector version",
    });

    return new Response(JSON.stringify({ success: true, file_url: safeFileUrl, version, connector_id: connector[0]?.id || null }), { status: 200, headers: corsHeaders });
  } catch (err: any) {
    console.error("generateConnectorPlugin error", err);
    const message = err instanceof Error ? err.message : (typeof err === 'string' ? err : 'Unknown error');
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders });
  }
});
