import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from '../_shared/cors.ts';

function jsonResponse(body: any, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", ...corsHeaders },
    });
}

Deno.serve(async (req: Request) => {
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;
    // Require authentication
    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.replace(/^Bearer /i, "");
    if (!jwt) {
        return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    // Supabase client (service role)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    try {
        const body = await req.json();
        const { team_id } = body;
        if (!team_id) {
            return jsonResponse({ error: "Missing required parameter: team_id" }, 400);
        }

        const defaultRoles = [
            {
                team_id,
                name: "Owner",
                description: "Team eigenaar met volledige controle en alle rechten. Kan niet worden verwijderd of bewerkt.",
                type: "default",
                is_active: true,
                permissions: {
                    sites: { view: true, create: true, edit: true, delete: true, share: true, manage_plugins: true },
                    plugins: { view: true, create: true, edit: true, delete: true, share: true, install: true, uninstall: true, activate: true, deactivate: true, manage_versions: true },
                    members: { view: true, invite: true, edit: true, remove: true, manage_roles: true },
                    team: { view: true, edit_settings: true, manage_roles: true },
                },
            },
            {
                team_id,
                name: "Admin",
                description: "Alle rechten van een Manager, plus het beheren van custom team rollen en team instellingen.",
                type: "default",
                is_active: true,
                permissions: {
                    sites: { view: true, create: true, edit: true, delete: true, share: true, manage_plugins: true },
                    plugins: { view: true, create: true, edit: true, delete: true, share: true, install: true, uninstall: true, activate: true, deactivate: true, manage_versions: true },
                    members: { view: true, invite: true, edit: true, remove: true, manage_roles: true },
                    team: { view: true, edit_settings: true, manage_roles: true },
                },
            },
            {
                team_id,
                name: "Manager",
                description: "Alle rechten van een Member, plus het beheren van team sites en plugins, en teamleden.",
                type: "default",
                is_active: true,
                permissions: {
                    sites: { view: true, create: true, edit: true, delete: true, share: true, manage_plugins: true },
                    plugins: { view: true, create: true, edit: true, delete: true, share: true, install: true, uninstall: true, activate: true, deactivate: true, manage_versions: false },
                    members: { view: true, invite: true, edit: true, remove: true, manage_roles: false },
                    team: { view: true, edit_settings: false, manage_roles: false },
                },
            },
            {
                team_id,
                name: "Member",
                description: "Kan team plugins en sites bekijken, en plugins activeren/deactiveren/updaten op teamsites.",
                type: "default",
                is_active: true,
                permissions: {
                    sites: { view: true, create: false, edit: false, delete: false, share: false, manage_plugins: true },
                    plugins: { view: true, create: false, edit: false, delete: false, share: false, install: false, uninstall: false, activate: true, deactivate: true, manage_versions: false },
                    members: { view: true, invite: false, edit: false, remove: false, manage_roles: false },
                    team: { view: true, edit_settings: false, manage_roles: false },
                },
            },
        ];

        // Insert roles
        const { data: createdRoles, error: insertError } = await supabase.from("team_roles").insert(defaultRoles).select();
        if (insertError || !createdRoles) {
            return new Response(JSON.stringify({ success: false, error: insertError?.message || "Failed to create roles" }), { status: 500, headers: corsHeaders });
        }

        return new Response(JSON.stringify({ success: true, message: "Default team roles created successfully", roles: createdRoles }), { status: 200, headers: corsHeaders });
    } catch (error) {
        let errorMessage = "Failed to create default team roles";
        if (error && typeof error === "object" && "message" in error) {
            errorMessage = (error as { message?: string }).message || errorMessage;
        }
        console.error("[createDefaultTeamRoles] Error:", errorMessage);
        return new Response(JSON.stringify({ success: false, error: errorMessage }), { status: 500, headers: corsHeaders });
    }
});