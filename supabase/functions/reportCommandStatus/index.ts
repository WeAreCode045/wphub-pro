import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
    // Require authentication
    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.replace(/^Bearer /i, "");
    if (!jwt) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
        });
    }

    // Supabase client (service role)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    try {
        const { installation_id, status, version, error_message, site_name, plugin_id, owner_id } = await req.json();
        if (!installation_id || !status) {
            return new Response(JSON.stringify({ error: "Missing required parameters" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        const updateData: any = {};
        switch (status) {
            case "active":
                updateData.status = "active";
                updateData.installed_version = version;
                updateData.is_active = true;
                break;
            case "inactive":
                updateData.status = "inactive";
                updateData.is_active = false;
                break;
            case "uninstalled":
                updateData.status = "available";
                updateData.installed_version = null;
                updateData.is_active = false;
                updateData.is_enabled = true;
                break;
            case "error":
                updateData.status = "error";
                updateData.installed_version = null;
                updateData.is_active = false;
                break;
            default:
                updateData.status = status;
        }

        // Update PluginInstallation
        await supabase.from("PluginInstallation").update(updateData).eq("id", installation_id);

        // Log activity (optional, if plugin_id and site_name are provided)
        if (plugin_id && site_name && owner_id) {
            let action;
            switch (status) {
                case "installed":
                    action = `Plugin geïnstalleerd op ${site_name}`;
                    break;
                case "active":
                    action = `Plugin geactiveerd op ${site_name}`;
                    break;
                case "inactive":
                    action = `Plugin gedeactiveerd op ${site_name}`;
                    break;
                case "uninstalled":
                    action = `Plugin gedeïnstalleerd op ${site_name}`;
                    break;
                case "error":
                    action = `Plugin actie MISLUKT op ${site_name}`;
                    break;
                default:
                    action = `Plugin ${status} op ${site_name}`;
            }
            await supabase.from("ActivityLog").insert([
                {
                    user_email: "system",
                    action,
                    entity_type: "installation",
                    entity_id: installation_id,
                    details: error_message || `Status: ${status}, Version: ${version || "N/A"}`,
                    owner_id,
                    plugin_id,
                },
            ]);
        }

        return new Response(
            JSON.stringify({ success: true, message: "Status updated successfully" }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
});