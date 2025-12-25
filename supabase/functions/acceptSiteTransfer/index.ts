
function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const { site_id, requester_id, transfer_plugins, non_transfer_action, scheduled_transfer_date } = body;
    if (!site_id || !requester_id || !Array.isArray(transfer_plugins)) {
      return jsonResponse({ error: "Missing required parameters" }, 400);
    }

    // Fetch site and users
    const { data: site, error: siteError } = await supabase.from("sites").select("*").eq("id", site_id).single();
    if (siteError || !site) return jsonResponse({ error: "Site not found" }, 404);

    const { data: requesterUser } = await supabase.from("users").select("*").eq("id", requester_id).single();
    // Assume the sender is the current user (from JWT, not decoded here for brevity)

    // If scheduled transfer, just log and return
    if (scheduled_transfer_date) {
      // Optionally: send notification, log activity, etc.
      return jsonResponse({ success: true, message: "Transfer request accepted and scheduled", scheduled_date: scheduled_transfer_date });
    }

    // Immediate transfer: update plugin ownership and/or uninstall
    const { data: allPlugins } = await supabase.from("plugins").select("*");
    const sitePlugins = (allPlugins || []).filter((p: any) => (p.installed_on || []).some((i: any) => i.site_id === site_id));

    for (const plugin of sitePlugins) {
      const shouldTransfer = transfer_plugins.includes(plugin.id);
      if (shouldTransfer) {
        await supabase.from("plugins").update({ owner_id: requester_id, owner_type: "user" }).eq("id", plugin.id);
      } else {
        const updatedInstalledOn = (plugin.installed_on || []).filter((install: any) => install.site_id !== site_id);
        if (non_transfer_action === "uninstall") {
          // Optionally: call uninstall function endpoint here if needed
        }
        await supabase.from("plugins").update({ installed_on: updatedInstalledOn }).eq("id", plugin.id);
      }
    }

    return jsonResponse({ success: true, message: "Transfer request accepted and processed" });
  } catch (error: any) {
    console.error("[acceptSiteTransfer] ❌ ERROR:", error.message || String(error));
    return jsonResponse({ success: false, error: error.message || String(error) }, 500);
  }
});
