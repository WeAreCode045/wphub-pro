import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Content-Type": "application/json"
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  // Require authentication
  const authHeader = req.headers.get("authorization") || "";
  const jwt = authHeader.replace(/^Bearer /i, "");
  if (!jwt) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: CORS_HEADERS });
  }

  // Supabase client (service role)
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json();
    const { version, plugin_code, file_url, description } = body;
    if (!version || !plugin_code || !file_url) {
      return jsonResponse({ error: "Missing required parameters" }, 400);
    }

    // Insert connector plugin
    const { data: connector, error: connectorError } = await supabase.from("connectors").insert({
      version,
      plugin_code,
      file_url,
      description,
    }).select();
    if (connectorError || !connector) {
      return jsonResponse({ error: "Failed to create connector: " + (connectorError?.message || "Unknown error") }, 500);
    }

    // Update site_settings active_connector_version (optional, adjust as needed)
    await supabase.from("site_settings").insert({
      setting_key: "active_connector_version",
      setting_value: version,
      description: "Active connector version",
    });

    return jsonResponse({ success: true, file_url, version, connector_id: connector[0]?.id || null });
  } catch (err: any) {
    console.error("generateConnectorPlugin error", err);
    return jsonResponse({ error: err.message || String(err) }, 500);
  }
});
