
import Stripe from 'https://esm.sh/stripe@14.11.0?target=deno';

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
  try {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY') || '';
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';

    const stripe = new Stripe(stripeKey, { apiVersion: '2022-11-15' });

    const rawBody = await req.text();
    const sig = req.headers.get('stripe-signature') || '';

    let event: any;

    if (webhookSecret && sig) {
      try {
        event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
      } catch (err) {
        console.error('Stripe signature verification failed:', err);
        return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 400, headers: { 'content-type': 'application/json' } });
      }
    } else {
      try {
        event = JSON.parse(rawBody);
      } catch (err) {
        console.error('Failed to parse webhook body:', err);
        return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400, headers: { 'content-type': 'application/json' } });
      }
    }

    console.log('Stripe event received:', event.type);

    // Minimal handling: log and acknowledge. More processing (invoices, subscriptions, checkout) can be added.
    switch (event.type) {
      case 'checkout.session.completed':
        console.log('checkout.session.completed:', event.data?.object);
        break;
      case 'invoice.payment_succeeded':
        console.log('invoice.payment_succeeded:', event.data?.object);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        console.log(event.type, event.data?.object);
        break;
      default:
        console.log('Unhandled event type:', event.type);
    }

    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (err) {
    let errorMessage = 'internal';
    if (err && typeof err === 'object' && 'message' in err) {
      errorMessage = (err as { message?: string }).message || errorMessage;
    }
    console.error('handleStripeWebhook error:', err);
    return new Response(JSON.stringify({ error: errorMessage }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
});