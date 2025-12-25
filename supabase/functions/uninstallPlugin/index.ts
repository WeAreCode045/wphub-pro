import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  try {
    // Require authentication
    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.replace(/^Bearer /i, "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    // Supabase client (service role)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Parse request body
    const body = await req.json();
    const { plugin_id, site_id } = body;
    if (!plugin_id || !site_id) {
      return new Response(JSON.stringify({ error: "Missing required parameters" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Fetch plugin
    const { data: plugin, error: pluginError } = await supabase.from('plugins').select('*').eq('id', plugin_id).single();
    if (pluginError || !plugin) {
      return new Response(JSON.stringify({ error: "Plugin not found" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    // Remove site from installed_on
    const currentInstalledOn = plugin.installed_on || [];
    const updatedInstalledOn = currentInstalledOn.filter((entry: any) => entry.site_id !== site_id);
    await supabase.from('plugins').update({ installed_on: updatedInstalledOn }).eq('id', plugin_id);

    // Optionally: log activity (implement as needed)

    return new Response(
      JSON.stringify({ success: true, message: 'Plugin successfully uninstalled' }),
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    let errorMessage = "Failed to uninstall plugin";
    if (error && typeof error === "object" && "message" in error) {
      errorMessage = (error as { message?: string }).message || errorMessage;
    }
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});