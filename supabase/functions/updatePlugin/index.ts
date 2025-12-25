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
        const { plugin_id, site_id, connector_url, download_url, payload } = body;
        if (!plugin_id || !site_id || !connector_url || !payload) {
            return new Response(JSON.stringify({ error: "Missing required parameters" }), { status: 400, headers: corsHeaders });
        }

        // Optionally add download_url to payload
        if (download_url) {
            payload.file_url = download_url;
        }

        // Call connector
        const response = await fetch(connector_url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[updatePlugin] Connector error:", errorText);
            return new Response(JSON.stringify({ success: false, error: `Connector error: ${response.status} - ${errorText}` }), { status: 500, headers: corsHeaders });
        }

        const result = await response.json();
        console.log("[updatePlugin] Connector response:", result);

        // Update plugin version in installed_on if successful
        if (result.success && result.version) {
            const { data: plugins, error: pluginError } = await supabase.from("plugins").select("*").eq("id", plugin_id);
            if (!pluginError && plugins && plugins.length > 0) {
                const plugin = plugins[0];
                const currentInstalledOn = plugin.installed_on || [];
                const existingEntry = currentInstalledOn.find((entry: any) => entry.site_id === site_id);
                if (existingEntry) {
                    existingEntry.version = result.version;
                    await supabase.from("plugins").update({ installed_on: currentInstalledOn }).eq("id", plugin_id);
                    console.log("[updatePlugin] ✅ Updated version in installed_on to:", result.version);
                }
            }
        }

        console.log("[updatePlugin] === END ===");
        return new Response(JSON.stringify({ success: result.success, message: result.message, version: result.version }), { status: 200, headers: corsHeaders });
    } catch (error: any) {
        console.error("[updatePlugin] ❌ ERROR:", error.message || String(error));
        return new Response(JSON.stringify({ success: false, error: error.message || String(error) }), { status: 500, headers: corsHeaders });
    }
});