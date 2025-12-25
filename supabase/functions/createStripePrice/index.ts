declare const Deno: any;
// @ts-ignore
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createClientFromRequest } from '../base44Shim.js';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

function getSupabaseClientOrShim(req: Request) {
  const url = Deno.env.get('SB_URL') || Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SB_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (url && key) {
    return createClient(url, key);
  }
  return createClientFromRequest(req);
}

serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;
  try {
    const base44 = getSupabaseClientOrShim(req);
    // Require Bearer token auth
    const authHeader = req.headers.get('authorization');
    let user = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      if (base44.auth && base44.auth.getUser) {
        const { data } = await base44.auth.getUser(token);
        user = data?.user ?? null;
      } else if (base44.auth && base44.auth.me) {
        user = await base44.auth.me();
      }
    }
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const { product_id, amount, currency, interval } = await req.json();
    if (!product_id || !amount || !currency || !interval) {
      return new Response(JSON.stringify({ error: 'Missing required parameters' }), { status: 400, headers: corsHeaders });
    }

    // Here you would call Stripe API to create the price (stubbed for now)
    const price = {
      id: 'mock_price_id',
      product: product_id,
      unit_amount: amount,
      currency,
      recurring: { interval },
      created_by: user.email
    };

    // Log activity
    await base44.asServiceRole.entities.ActivityLog.create({
      user_email: user.email,
      action: `Stripe price aangemaakt voor product ${product_id}`,
      entity_type: 'subscription',
      details: `Price ID: ${price.id}, Amount: ${amount / 100} ${currency}, Interval: ${interval}`
    });

    return new Response(JSON.stringify({ success: true, price_id: price.id, price }), { status: 200, headers: corsHeaders });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || String(error) }), { status: 500, headers: corsHeaders });
  }
});