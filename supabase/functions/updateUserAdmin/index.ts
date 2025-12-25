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
    const { user_id, updates, admin_email } = body;
    if (!user_id || !updates || !admin_email) {
      return new Response(JSON.stringify({ error: "Missing required parameters" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Update user
    const { data: updatedUser, error: updateError } = await supabase.from('User').update(updates).eq('id', user_id).select().single();
    if (updateError || !updatedUser) {
      return new Response(JSON.stringify({ error: `Failed to update user: ${updateError?.message || 'Unknown error'}` }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Log activity
    await supabase.from('ActivityLog').insert([
      {
        user_email: admin_email,
        action: `User updated: ${updatedUser.email}`,
        entity_type: 'user',
        entity_id: user_id,
        details: `Updated fields: ${Object.keys(updates).join(', ')}`
      }
    ]);

    return new Response(
      JSON.stringify({ success: true, user: updatedUser }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    let errorMessage = "Failed to update user";
    if (error && typeof error === "object" && "message" in error) {
      errorMessage = (error as { message?: string }).message || errorMessage;
    }
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});