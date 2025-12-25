import { createClientFromRequest } from '../base44Shim.js';
import Stripe from 'npm:stripe@14.11.0';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), {
  apiVersion: '2023-10-16',
});

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    const { name, description } = await req.json();

    if (!name) {
      return new Response(JSON.stringify({ error: 'Name is required' }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    // Create product in Stripe
    const product = await stripe.products.create({
      name,
      description: description || '',
      metadata: {
        created_by: user.email,
        platform: 'wp-cloud-hub'
      }
    });

    await base44.asServiceRole.entities.ActivityLog.create({
      user_email: user.email,
      action: `Stripe product aangemaakt: ${name}`,
      entity_type: 'subscription',
      details: `Product ID: ${product.id}`
    });

    return new Response(JSON.stringify({
      success: true,
      product_id: product.id,
      product
    }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });

  } catch (error) {
    console.error('Error creating Stripe product:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
  }
});