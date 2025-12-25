import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
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

    // Parse request body
    const body = await req.json();
    const { theme_id, site_id, user_email, theme_slug, site_name } = body;
    if (!theme_id || !site_id || !user_email || !theme_slug || !site_name) {
      return new Response(JSON.stringify({ error: "Missing required parameters" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Fetch theme
    const { data: theme, error: themeError } = await supabase.from('themes').select('*').eq('id', theme_id).single();
    if (themeError || !theme) {
      return new Response(JSON.stringify({ error: "Theme not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Remove site from installed_on
    const installedOn = theme.installed_on || [];
    const updatedInstalledOn = installedOn.filter((i: any) => i.site_id !== site_id);
    await supabase.from('themes').update({ installed_on: updatedInstalledOn }).eq('id', theme_id);

    // Log activity
    await supabase.from('ActivityLog').insert([
      {
        user_email,
        action: `Theme verwijderd van ${site_name}`,
        entity_type: 'site',
        entity_id: site_id,
        details: theme_slug
      }
    ]);

    return new Response(
      JSON.stringify({ success: true, message: 'Theme uninstalled successfully' }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    let errorMessage = "Failed to uninstall theme";
    if (error && typeof error === "object" && "message" in error) {
      errorMessage = (error as { message?: string }).message || errorMessage;
    }
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
