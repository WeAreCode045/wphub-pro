
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @deno-types="npm:@types/stripe"
import Stripe from "https://esm.sh/stripe@12.6.0?target=deno";
import { corsHeaders, handleCors } from '../_shared/cors.ts';

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

serve(async (req) => {
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

  // Stripe client
  const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeSecret) {
    return new Response(JSON.stringify({ error: "Stripe secret key not configured" }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
  }
  const stripe = new Stripe(stripeSecret, { apiVersion: "2022-11-15" });

  try {
    const body = await req.json();
    const { user_id, action, new_plan_id, billing_interval } = body;
    if (!user_id || !action || !new_plan_id || !billing_interval) {
      return new Response(JSON.stringify({ error: "Missing required parameters" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    // Fetch user and current subscription
    const { data: user, error: userError } = await supabase.from("users").select("*").eq("id", user_id).single();
    if (userError || !user) return jsonResponse({ error: "User not found" }, 404);
    const { data: currentSubscription, error: subError } = await supabase.from("user_subscriptions").select("*").eq("user_id", user_id).single();
    if (subError || !currentSubscription) return jsonResponse({ error: "Subscription not found" }, 404);

    // Fetch current and new plan
    const { data: currentPlan } = await supabase.from("plans").select("*").eq("id", currentSubscription.plan_id).single();
    const { data: newPlan } = await supabase.from("plans").select("*").eq("id", new_plan_id).single();
    if (!currentPlan || !newPlan) return jsonResponse({ error: "Plan not found" }, 404);

    // Determine new Stripe price ID
    const newStripePriceId = billing_interval === "year" ? newPlan.annual_price_id : newPlan.monthly_price_id;
    if (!newStripePriceId) return jsonResponse({ error: `No ${billing_interval}ly price configured for this plan` }, 400);

    // Retrieve Stripe subscription and items
    const stripeSubscription = await stripe.subscriptions.retrieve(currentSubscription.stripe_subscription_id);
    if (!stripeSubscription || stripeSubscription.items.data.length === 0) return jsonResponse({ error: "Invalid Stripe subscription" }, 404);
    const subscriptionItemId = stripeSubscription.items.data[0].id;
    const currentStripePriceId = stripeSubscription.items.data[0].price.id;
    const currentPrice = await stripe.prices.retrieve(currentStripePriceId);
    const newPrice = await stripe.prices.retrieve(newStripePriceId);
    const isChangingInterval = currentPrice.recurring?.interval !== newPrice.recurring?.interval;

    if (action === "downgrade") {
      const usageCheck = await checkDowngradeEligibility(supabaseUrl, serviceKey, user.id, newPlan);
      if (!usageCheck.allowed) return jsonResponse({ success: false, error: "Downgrade not allowed", details: usageCheck.violations }, 400);
      let updatedSubscription;
      if (isChangingInterval) {
        await stripe.subscriptions.update(currentSubscription.stripe_subscription_id, { cancel_at_period_end: true });
        updatedSubscription = await stripe.subscriptions.create({ customer: currentSubscription.stripe_customer_id, items: [{ price: newStripePriceId }], billing_cycle_anchor: stripeSubscription.current_period_end, proration_behavior: "none", backdate_start_date: stripeSubscription.current_period_end });
      } else {
        updatedSubscription = await stripe.subscriptions.update(currentSubscription.stripe_subscription_id, { items: [{ id: subscriptionItemId, price: newStripePriceId }], proration_behavior: "none", billing_cycle_anchor: "unchanged" });
      }
      await supabase.from("user_subscriptions").update({ pending_plan_change: new_plan_id }).eq("id", currentSubscription.id);
      return jsonResponse({ success: true, message: "Downgrade scheduled for end of billing period", effective_date: new Date((stripeSubscription.current_period_end || 0) * 1000).toISOString(), current_plan: currentPlan.name, new_plan: newPlan.name });
    } else if (action === "upgrade") {
      let updatedSubscription;
      if (isChangingInterval) {
        await stripe.subscriptions.cancel(currentSubscription.stripe_subscription_id);
        updatedSubscription = await stripe.subscriptions.create({ customer: currentSubscription.stripe_customer_id, items: [{ price: newStripePriceId }], proration_behavior: "always_invoice" });
      } else {
        updatedSubscription = await stripe.subscriptions.update(currentSubscription.stripe_subscription_id, { items: [{ id: subscriptionItemId, price: newStripePriceId }], proration_behavior: "always_invoice", billing_cycle_anchor: "unchanged" });
      }
      const newAmount = billing_interval === "year" ? newPlan.annual_price_amount : newPlan.monthly_price_amount;
      await supabase.from("user_subscriptions").update({ plan_id: new_plan_id, amount: newAmount, currency: newPlan.currency, vat_percentage: newPlan.vat_rate_percentage, stripe_subscription_id: updatedSubscription.id }).eq("id", currentSubscription.id);
      await supabase.from("activity_logs").insert({ user_email: user.email, action: `Abonnement geüpgraded van ${currentPlan.name} naar ${newPlan.name}`, entity_type: "user", entity_id: user.id });
      return jsonResponse({ success: true, message: "Upgrade successful", prorated_amount: updatedSubscription.latest_invoice?.amount_due || 0, current_plan: newPlan.name, invoice_url: updatedSubscription.latest_invoice?.hosted_invoice_url });
    } else {
      return jsonResponse({ error: 'Invalid action. Must be "upgrade" or "downgrade"' }, 400);
    }
  } catch (err: any) {
    console.error("changeSubscription error", err);
    return jsonResponse({ error: err.message || String(err) }, 500);
  }
});

async function checkDowngradeEligibility(supa: string, serviceKey: string | undefined, userId: any, newPlan: any) {
  const violations: any[] = [];
  // ...existing code for plugin/site/team/project checks...
  // Plugins
  if (newPlan.features?.plugins?.enabled) {
    const res = await fetch(`${supa}/rest/v1/plugins?owner_type=eq.user&owner_id=eq.${encodeURIComponent(String(userId))}`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
    const plugins = res.ok ? await res.json() : [];
    const limit = newPlan.features.plugins.limit;
    if (limit !== -1 && plugins.length > limit) {
      violations.push({ feature: "plugins", current: plugins.length, limit, message: `Je hebt ${plugins.length} plugins, maar het nieuwe plan staat maximaal ${limit} toe` });
    }
  } else if (newPlan.features?.plugins && !newPlan.features.plugins.enabled) {
    const res = await fetch(`${supa}/rest/v1/plugins?owner_type=eq.user&owner_id=eq.${encodeURIComponent(String(userId))}`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
    const plugins = res.ok ? await res.json() : [];
    if (plugins.length > 0) violations.push({ feature: "plugins", current: plugins.length, limit: 0, message: "Het nieuwe plan ondersteunt geen plugins. Verwijder eerst al je plugins." });
  }
  // Sites
  if (newPlan.features?.sites?.enabled) {
    const res = await fetch(`${supa}/rest/v1/sites?owner_type=eq.user&owner_id=eq.${encodeURIComponent(String(userId))}`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
    const sites = res.ok ? await res.json() : [];
    const limit = newPlan.features.sites.limit;
    if (limit !== -1 && sites.length > limit) violations.push({ feature: "sites", current: sites.length, limit, message: `Je hebt ${sites.length} sites, maar het nieuwe plan staat maximaal ${limit} toe` });
  } else if (newPlan.features?.sites && !newPlan.features.sites.enabled) {
    const res = await fetch(`${supa}/rest/v1/sites?owner_type=eq.user&owner_id=eq.${encodeURIComponent(String(userId))}`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
    const sites = res.ok ? await res.json() : [];
    if (sites.length > 0) violations.push({ feature: "sites", current: sites.length, limit: 0, message: "Het nieuwe plan ondersteunt geen sites. Verwijder eerst al je sites." });
  }
  // Teams
  if (newPlan.features?.teams?.enabled) {
    const res = await fetch(`${supa}/rest/v1/teams?owner_id=eq.${encodeURIComponent(String(userId))}`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
    const teams = res.ok ? await res.json() : [];
    const limit = newPlan.features.teams.limit;
    if (limit !== -1 && teams.length > limit) violations.push({ feature: "teams", current: teams.length, limit, message: `Je hebt ${teams.length} teams, maar het nieuwe plan staat maximaal ${limit} toe` });
  } else if (newPlan.features?.teams && !newPlan.features.teams.enabled) {
    const res = await fetch(`${supa}/rest/v1/teams?owner_id=eq.${encodeURIComponent(String(userId))}`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
    const teams = res.ok ? await res.json() : [];
    if (teams.length > 0) violations.push({ feature: "teams", current: teams.length, limit: 0, message: "Het nieuwe plan ondersteunt geen teams. Verwijder eerst al je teams." });
  }
  // Projects
  if (newPlan.features?.projects?.enabled) {
    const teamsRes = await fetch(`${supa}/rest/v1/teams?owner_id=eq.${encodeURIComponent(String(userId))}`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
    const teams = teamsRes.ok ? await teamsRes.json() : [];
    const teamIds = teams.map((t: any) => t.id).filter(Boolean);
    let userProjects: any[] = [];
    if (teamIds.length > 0) {
      const inList = teamIds.map((id: any) => encodeURIComponent(String(id))).join(",");
      const projectsRes = await fetch(`${supa}/rest/v1/projects?team_id=in.(${inList})`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
      const projects = projectsRes.ok ? await projectsRes.json() : [];
      userProjects = projects;
    }
    const limit = newPlan.features.projects.limit;
    if (limit !== -1 && userProjects.length > limit) violations.push({ feature: "projects", current: userProjects.length, limit, message: `Je hebt ${userProjects.length} projecten, maar het nieuwe plan staat maximaal ${limit} toe` });
  } else if (newPlan.features?.projects && !newPlan.features.projects.enabled) {
    const teamsRes = await fetch(`${supa}/rest/v1/teams?owner_id=eq.${encodeURIComponent(String(userId))}`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
    const teams = teamsRes.ok ? await teamsRes.json() : [];
    const teamIds = teams.map((t: any) => t.id).filter(Boolean);
    let userProjects: any[] = [];
    if (teamIds.length > 0) {
      const inList = teamIds.map((id: any) => encodeURIComponent(String(id))).join(",");
      const projectsRes = await fetch(`${supa}/rest/v1/projects?team_id=in.(${inList})`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
      const projects = projectsRes.ok ? await projectsRes.json() : [];
      userProjects = projects;
    }
    if (userProjects.length > 0) violations.push({ feature: "projects", current: userProjects.length, limit: 0, message: "Het nieuwe plan ondersteunt geen projecten. Verwijder eerst al je projecten." });
  }
  return { allowed: violations.length === 0, violations };
}

async function checkDowngradeEligibility(supa: string, serviceKey: string | undefined, userId: any, newPlan: any) {
  const violations: any[] = [];

  // Plugins
  if (newPlan.features?.plugins?.enabled) {
    const res = await fetch(`${supa}/rest/v1/plugins?owner_type=eq.user&owner_id=eq.${encodeURIComponent(String(userId))}`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
    const plugins = res.ok ? await res.json() : [];
    const limit = newPlan.features.plugins.limit;
    if (limit !== -1 && plugins.length > limit) {
      violations.push({ feature: 'plugins', current: plugins.length, limit, message: `Je hebt ${plugins.length} plugins, maar het nieuwe plan staat maximaal ${limit} toe` });
    }
  } else if (newPlan.features?.plugins && !newPlan.features.plugins.enabled) {
    const res = await fetch(`${supa}/rest/v1/plugins?owner_type=eq.user&owner_id=eq.${encodeURIComponent(String(userId))}`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
    const plugins = res.ok ? await res.json() : [];
    if (plugins.length > 0) violations.push({ feature: 'plugins', current: plugins.length, limit: 0, message: 'Het nieuwe plan ondersteunt geen plugins. Verwijder eerst al je plugins.' });
  }

  // Sites
  if (newPlan.features?.sites?.enabled) {
    const res = await fetch(`${supa}/rest/v1/sites?owner_type=eq.user&owner_id=eq.${encodeURIComponent(String(userId))}`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
    const sites = res.ok ? await res.json() : [];
    const limit = newPlan.features.sites.limit;
    if (limit !== -1 && sites.length > limit) violations.push({ feature: 'sites', current: sites.length, limit, message: `Je hebt ${sites.length} sites, maar het nieuwe plan staat maximaal ${limit} toe` });
  } else if (newPlan.features?.sites && !newPlan.features.sites.enabled) {
    const res = await fetch(`${supa}/rest/v1/sites?owner_type=eq.user&owner_id=eq.${encodeURIComponent(String(userId))}`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
    const sites = res.ok ? await res.json() : [];
    if (sites.length > 0) violations.push({ feature: 'sites', current: sites.length, limit: 0, message: 'Het nieuwe plan ondersteunt geen sites. Verwijder eerst al je sites.' });
  }

  // Teams
  if (newPlan.features?.teams?.enabled) {
    const res = await fetch(`${supa}/rest/v1/teams?owner_id=eq.${encodeURIComponent(String(userId))}`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
    const teams = res.ok ? await res.json() : [];
    const limit = newPlan.features.teams.limit;
    if (limit !== -1 && teams.length > limit) violations.push({ feature: 'teams', current: teams.length, limit, message: `Je hebt ${teams.length} teams, maar het nieuwe plan staat maximaal ${limit} toe` });
  } else if (newPlan.features?.teams && !newPlan.features.teams.enabled) {
    const res = await fetch(`${supa}/rest/v1/teams?owner_id=eq.${encodeURIComponent(String(userId))}`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
    const teams = res.ok ? await res.json() : [];
    if (teams.length > 0) violations.push({ feature: 'teams', current: teams.length, limit: 0, message: 'Het nieuwe plan ondersteunt geen teams. Verwijder eerst al je teams.' });
  }

  // Projects
  if (newPlan.features?.projects?.enabled) {
    const teamsRes = await fetch(`${supa}/rest/v1/teams?owner_id=eq.${encodeURIComponent(String(userId))}`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
    const teams = teamsRes.ok ? await teamsRes.json() : [];
    const teamIds = teams.map((t:any) => t.id).filter(Boolean);
    let userProjects: any[] = [];
    if (teamIds.length > 0) {
      const inList = teamIds.map((id:any) => encodeURIComponent(String(id))).join(',');
      const projectsRes = await fetch(`${supa}/rest/v1/projects?team_id=in.(${inList})`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
      const projects = projectsRes.ok ? await projectsRes.json() : [];
      userProjects = projects;
    }
    const limit = newPlan.features.projects.limit;
    if (limit !== -1 && userProjects.length > limit) violations.push({ feature: 'projects', current: userProjects.length, limit, message: `Je hebt ${userProjects.length} projecten, maar het nieuwe plan staat maximaal ${limit} toe` });
  } else if (newPlan.features?.projects && !newPlan.features.projects.enabled) {
    const teamsRes = await fetch(`${supa}/rest/v1/teams?owner_id=eq.${encodeURIComponent(String(userId))}`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
    const teams = teamsRes.ok ? await teamsRes.json() : [];
    const teamIds = teams.map((t:any) => t.id).filter(Boolean);
    let userProjects: any[] = [];
    if (teamIds.length > 0) {
      const inList = teamIds.map((id:any) => encodeURIComponent(String(id))).join(',');
      const projectsRes = await fetch(`${supa}/rest/v1/projects?team_id=in.(${inList})`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
      const projects = projectsRes.ok ? await projectsRes.json() : [];
      userProjects = projects;
    }
    if (userProjects.length > 0) violations.push({ feature: 'projects', current: userProjects.length, limit: 0, message: 'Het nieuwe plan ondersteunt geen projecten. Verwijder eerst al je projecten.' });
  }

  return { allowed: violations.length === 0, violations };
}

export {};
