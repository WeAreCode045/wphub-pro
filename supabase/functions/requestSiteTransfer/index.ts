
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
        const { site_id, user_id } = await req.json();
        if (!site_id || !user_id) {
            return new Response(JSON.stringify({ error: "Missing required parameters" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        // Fetch site and user
        const { data: site, error: siteError } = await supabase.from("Site").select("*").eq("id", site_id).single();
        const { data: user, error: userError } = await supabase.from("User").select("*").eq("id", user_id).single();
        if (siteError || !site || userError || !user) {
            return new Response(JSON.stringify({ error: "Site or user not found" }), {
                status: 404,
                headers: { "Content-Type": "application/json" },
            });
        }

        // Check for existing open transfer request
        const { data: existingRequests } = await supabase
            .from("Message")
            .select("*")
            .eq("recipient_type", "user")
            .eq("recipient_id", site.owner_type === "user" ? site.owner_id : null)
            .eq("category", "site_transfer_request")
            .eq("status", "open");
        const pendingRequest = (existingRequests || []).find(
            (msg) => msg.context?.site_id === site.id && msg.context?.requesting_user_id === user.id
        );
        if (pendingRequest) {
            return new Response(
                JSON.stringify({ error: "Er is al een openstaand overdrachtverzoek voor deze site" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        // Get the owner
        let ownerUser = null;
        if (site.owner_type === "user") {
            const { data: owner } = await supabase.from("User").select("*").eq("id", site.owner_id).single();
            ownerUser = owner;
        } else {
            // Team-owned site
            const { data: team } = await supabase.from("Team").select("*").eq("id", site.owner_id).single();
            if (team) {
                const { data: owner } = await supabase.from("User").select("*").eq("id", team.owner_id).single();
                ownerUser = owner;
            }
        }
        if (!ownerUser) {
            return new Response(
                JSON.stringify({ error: "Eigenaar van de site niet gevonden" }),
                { status: 404, headers: { "Content-Type": "application/json" } }
            );
        }

        // Create the transfer request message
        const { data: message, error: messageError } = await supabase.from("Message").insert([
            {
                subject: `Overdrachtverzoek voor site: ${site.name}`,
                message: `${user.full_name} (${user.email}) verzoekt om overdracht van de site "${site.name}" (${site.url}). Klik op "Accepteren" om de overdracht te starten, of "Weigeren" om het verzoek af te wijzen.`,
                sender_id: user.id,
                sender_email: user.email,
                sender_name: user.full_name,
                recipient_type: "user",
                recipient_id: ownerUser.id,
                recipient_email: ownerUser.email,
                is_read: false,
                priority: "high",
                status: "open",
                category: "site_transfer_request",
                context: {
                    type: "site_transfer_request",
                    site_id: site.id,
                    site_name: site.name,
                    site_url: site.url,
                    requesting_user_id: user.id,
                    requesting_user_name: user.full_name,
                    requesting_user_email: user.email,
                    current_owner_id: site.owner_id,
                    current_owner_type: site.owner_type,
                },
            },
        ]).select().single();
        if (messageError || !message) {
            return new Response(
                JSON.stringify({ error: "Failed to create transfer request message" }),
                { status: 500, headers: { "Content-Type": "application/json" } }
            );
        }

        // Send notification to owner
        await supabase.from("Notification").insert([
            {
                recipient_id: ownerUser.id,
                recipient_email: ownerUser.email,
                title: `Overdrachtverzoek voor site: ${site.name}`,
                message: `${user.full_name} verzoekt om overdracht van je site "${site.name}". Bekijk je berichten voor meer details.`,
                type: "warning",
            },
        ]);

        // Log activity
        await supabase.from("ActivityLog").insert([
            {
                user_email: user.email,
                action: `Overdrachtverzoek ingediend voor site: ${site.name}`,
                entity_type: "site",
                entity_id: site.id,
                details: `Verzoek gericht aan ${ownerUser.full_name}`,
            },
        ]);

        return new Response(
            JSON.stringify({ success: true, message: "Overdrachtverzoek succesvol verzonden", message_id: message.id }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message || "Failed to request site transfer" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
});