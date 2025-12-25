import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

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
    const { user_id, plan_id, interval, end_date, custom_amount } = body;
    if (!user_id || !plan_id) {
      return jsonResponse({ error: "Missing required parameters" }, 400);
    }

    // Fetch user and plan
    const { data: user, error: userError } = await supabase.from("users").select("*").eq("id", user_id).single();
    if (userError || !user) return jsonResponse({ error: "User not found" }, 404);
    const { data: plan, error: planError } = await supabase.from("plans").select("*").eq("id", plan_id).single();
    if (planError || !plan) return jsonResponse({ error: "Plan not found" }, 404);

    // Simulate admin (assigner) as the user making the request (in real use, decode JWT for admin info)
    const admin = { email: "admin@system" };

    // Calculate period
    const now = new Date();
    let currentPeriodEnd = null;
    if (interval === "month") {
      currentPeriodEnd = new Date(now);
      currentPeriodEnd.setMonth(now.getMonth() + 1);
    } else if (interval === "year") {
      currentPeriodEnd = new Date(now);
      currentPeriodEnd.setFullYear(now.getFullYear() + 1);
    } else if (end_date) {
      currentPeriodEnd = new Date(end_date);
    }

    // Create subscription payload
    const newSubPayload = {
      user_id,
      plan_id,
      is_manual: true,
      assigned_by: admin.email,
      manual_end_date: end_date || null,
      status: "active",
      current_period_start: now.toISOString(),
      current_period_end: currentPeriodEnd ? currentPeriodEnd.toISOString() : null,
      interval: interval || "lifetime",
      amount: custom_amount || 0,
      currency: plan.currency || "EUR",
      usage_tracking: { plugins_used: 0, sites_used: 0, teams_used: 0, projects_used: 0 },
    };

    // Insert subscription
    const { data: created, error: createError } = await supabase.from("user_subscriptions").insert(newSubPayload).select();
    if (createError || !created) {
      return new Response(JSON.stringify({ success: false, error: `Failed to create subscription: ${createError?.message || "Unknown error"}` }), { status: 500, headers: corsHeaders });
    }

    // Log activity
    await supabase.from("activity_logs").insert({
      user_email: admin.email,
      action: `Handmatig abonnement toegewezen aan ${user.email}`,
      entity_type: "subscription",
      details: `Plan: ${plan.name}, Bedrag: €${(custom_amount || 0) / 100}, Interval: ${interval || "lifetime"}, Einddatum: ${end_date || "onbeperkt"}`,
    });

    return new Response(JSON.stringify({ success: true, subscription: created }), { status: 200, headers: corsHeaders });
  } catch (err: any) {
    console.error("assignManualSubscription error", err);
    const message = err instanceof Error ? err.message : (typeof err === 'string' ? err : 'Unknown error');
    return new Response(JSON.stringify({ success: false, error: message }), { status: 500, headers: corsHeaders });
  }
});
