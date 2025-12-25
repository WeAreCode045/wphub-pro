import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Helper to send JSON responses
function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  // Require authentication
  const authHeader = req.headers.get("authorization") || "";
  const jwt = authHeader.replace(/^Bearer /i, "");
  if (!jwt) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  // Supabase client (service role)
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { user_id } = await req.json();
    if (!user_id) {
      return jsonResponse({ error: "Missing user_id" }, 400);
    }

    // Delete user from auth
    const { error: deleteError } = await supabase.auth.admin.deleteUser(user_id);
    if (deleteError) {
      return jsonResponse({ error: `Failed to delete user: ${deleteError.message}` }, 500);
    }

    // Log activity (optional, adjust table/fields as needed)
    await supabase.from("activity_logs").insert({
      action: `User deleted: ${user_id}`,
      entity_type: "user",
      details: "User completely removed from system",
      // Add more fields as needed
    });

    return jsonResponse({ success: true });
  } catch (err: any) {
    console.error("deleteUserAdmin error", err);
    return jsonResponse({ success: false, error: err.message || String(err) }, 500);
  }
});