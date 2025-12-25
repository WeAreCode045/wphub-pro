
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
        // Parse request body
        const body = await req.json();
        const { site_id } = body;
        if (!site_id) {
            return new Response(JSON.stringify({ error: "Missing required parameter: site_id" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        // Fetch site data from Supabase
        const { data: site, error: siteError } = await supabase.from("Site").select("*").eq("id", site_id).single();
        if (siteError || !site) {
            return new Response(JSON.stringify({ error: "Site not found" }), {
                status: 404,
                headers: { "Content-Type": "application/json" },
            });
        }

        // Simulate plugin sync (mocked response)
        try {
            // Simulate a successful sync
            return new Response(
                JSON.stringify({
                    success: true,
                    message: "Sync triggered successfully on WordPress site (simulated)",
                    site_name: site.name,
                    wp_response: "Simulated response"
                }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        } catch (wpError) {
            return new Response(
                JSON.stringify({
                    success: true,
                    message: "Changes marked as pending, will sync on next scheduled check (simulated)",
                    site_name: site.name,
                    error: wpError.message
                }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        }
    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message, stack: error.stack }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
});