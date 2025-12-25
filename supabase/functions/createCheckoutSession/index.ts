import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @deno-types="npm:@types/stripe"
import Stripe from "https://esm.sh/stripe@12.6.0?target=deno";

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

Deno.serve(async (req: Request) => {
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

  // Stripe client
  const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeSecret) {
    return jsonResponse({ error: "Stripe secret key not configured" }, 500);
  }
  const stripe = new Stripe(stripeSecret, { apiVersion: "2022-11-15" });

  try {
    const body = await req.json();
    const { user_id, plan_id, price_id, billing_cycle, success_url, cancel_url, discount_code } = body;
    if (!user_id || !plan_id || !price_id || !billing_cycle) {
      return jsonResponse({ error: "Missing required parameters" }, 400);
    }

    // Fetch user
    const { data: user, error: userError } = await supabase.from("users").select("*", { count: "exact", head: false }).eq("id", user_id).single();
    if (userError || !user) {
      return jsonResponse({ error: "User not found" }, 404);
    }

    // Fetch plan
    const { data: plan, error: planError } = await supabase.from("plans").select("*").eq("id", plan_id).single();
    if (planError || !plan) {
      return jsonResponse({ error: "Plan not found" }, 404);
    }

    // Get or create Stripe customer
    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.full_name,
        metadata: {
          user_id: user.id,
          platform: "wp-cloud-hub",
        },
      });
      customerId = customer.id;
      // Save customer ID to user
      await supabase.from("users").update({ stripe_customer_id: customerId }).eq("id", user.id);
    }

    // Prepare session parameters
    const sessionParams: any = {
      customer: customerId,
      mode: "subscription",
      line_items: [
        {
          price: price_id,
          quantity: 1,
        },
      ],
      success_url: success_url || `${Deno.env.get("YOUR_PLATFORM_URL")}/subscription-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancel_url || `${Deno.env.get("YOUR_PLATFORM_URL")}/pricing`,
      metadata: {
        user_id: user.id,
        plan_id: plan.id,
        billing_cycle,
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          plan_id: plan.id,
          billing_cycle,
        },
      },
      automatic_tax: { enabled: true },
    };

    // Add trial if configured
    if (plan.trial_days && plan.trial_days > 0) {
      sessionParams.subscription_data.trial_period_days = plan.trial_days;
    }

    // Add discount code if provided
    if (discount_code) {
      const { data: discounts } = await supabase.from("discount_codes").select("*").eq("code", discount_code).eq("is_active", true);
      if (discounts && discounts.length > 0) {
        const discount = discounts[0];
        if (discount.expires_at && new Date(discount.expires_at) < new Date()) {
          return jsonResponse({ error: "Discount code has expired" }, 400);
        }
        if (discount.max_redemptions && discount.times_redeemed >= discount.max_redemptions) {
          return jsonResponse({ error: "Discount code has reached maximum redemptions" }, 400);
        }
        if (discount.applies_to_plans && discount.applies_to_plans.length > 0 && !discount.applies_to_plans.includes(plan.id)) {
          return jsonResponse({ error: "Discount code not valid for this plan" }, 400);
        }
        if (discount.stripe_coupon_id) {
          sessionParams.discounts = [{ coupon: discount.stripe_coupon_id }];
        }
      }
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create(sessionParams);

    // Log activity (optional)
    await supabase.from("activity_logs").insert({
      user_email: user.email,
      action: `Checkout session created for plan: ${plan.name}`,
      entity_type: "subscription",
      details: `Session ID: ${session.id}, Billing: ${billing_cycle}`,
    });

    return jsonResponse({ success: true, session_id: session.id, url: session.url });
  } catch (error) {
    let errorMessage = "Failed to create checkout session";
    if (error && typeof error === "object" && "message" in error) {
      errorMessage = (error as { message?: string }).message || errorMessage;
    }
    console.error("Error creating checkout session:", error);
    return jsonResponse({ success: false, error: errorMessage }, 500);
  }
});