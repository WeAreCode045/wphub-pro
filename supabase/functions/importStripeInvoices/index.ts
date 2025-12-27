// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'npm:stripe@14.11.0';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY') || '';
const stripe = new Stripe(stripeSecret, { apiVersion: '2023-10-16' });

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      const detail = 'Missing Supabase env vars (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)';
      console.error(detail);
      return new Response(
        JSON.stringify({ error: 'Server misconfigured', details: detail }),
        { status: 500, headers: corsHeaders }
      );
    }

    if (!stripeSecret) {
      const detail = 'Missing STRIPE_SECRET_KEY secret in function environment';
      console.error(detail);
      return new Response(
        JSON.stringify({ error: 'Server misconfigured', details: detail }),
        { status: 500, headers: corsHeaders }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth check (admin)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: corsHeaders }
      );
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authUser) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: corsHeaders }
      );
    }

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', authUser.id)
      .single();

    if (userError || userData?.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: corsHeaders }
      );
    }

    // Parse body
    let user_id: string | undefined;
    try {
      const body = await req.json();
      user_id = body?.user_id;
    } catch (e) {
      console.error('Failed to parse JSON body', e);
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: 'user_id is required' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Get subscriptions for user with stripe customer ids
    const { data: subs, error: subsError } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', user_id)
      .not('stripe_customer_id', 'is', null);

    if (subsError) {
      console.error('Failed to fetch subscriptions', subsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch subscriptions', details: subsError.message }),
        { status: 500, headers: corsHeaders }
      );
    }

    if (!subs || subs.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No subscriptions with Stripe customer IDs found', imported: 0, skipped: 0 }),
        { status: 200, headers: corsHeaders }
      );
    }

    let imported = 0;
    let skipped = 0;

    // Cache existing invoice ids to avoid duplicates
    const { data: existingInvoices, error: invError } = await supabase
      .from('invoices')
      .select('stripe_invoice_id');

    if (invError) {
      console.error('Failed to fetch existing invoices', invError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch existing invoices', details: invError.message }),
        { status: 500, headers: corsHeaders }
      );
    }

    const existingIds = new Set((existingInvoices || []).map((i: any) => i.stripe_invoice_id));

    for (const sub of subs) {
      if (!sub.stripe_customer_id) continue;

      // Fetch invoices for this customer
      const invoices = [];
      const iterator = stripe.invoices.list({ customer: sub.stripe_customer_id, limit: 100 }).autoPagingEach;

      for await (const invoice of iterator()) {
        invoices.push(invoice);
      }

      for (const invoice of invoices) {
        if (existingIds.has(invoice.id)) {
          skipped += 1;
          continue;
        }

        // Map invoice to subscription_id if possible
        let subscriptionId: string | null = null;
        if (invoice.subscription) {
          const match = subs.find((s) => s.stripe_subscription_id === invoice.subscription);
          subscriptionId = match?.id || null;
        }

        const { error: insertError } = await supabase
          .from('invoices')
          .insert({
            user_id,
            subscription_id: subscriptionId,
            stripe_invoice_id: invoice.id,
            stripe_customer_id: invoice.customer as string,
            amount_due: invoice.amount_due,
            amount_paid: invoice.amount_paid,
            currency: invoice.currency,
            status: invoice.status || 'draft',
            invoice_pdf_url: invoice.invoice_pdf,
            hosted_invoice_url: invoice.hosted_invoice_url,
            invoice_number: invoice.number,
            period_start: invoice.period_start ? new Date(invoice.period_start * 1000).toISOString() : null,
            period_end: invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : null,
            created_at: invoice.created ? new Date(invoice.created * 1000).toISOString() : new Date().toISOString()
          });

        if (insertError) {
          console.error('Failed to insert invoice', insertError);
          skipped += 1;
        } else {
          existingIds.add(invoice.id);
          imported += 1;
        }
      }
    }

    return new Response(
      JSON.stringify({
        message: 'Import voltooid',
        imported,
        skipped
      }),
      { status: 200, headers: corsHeaders }
    );

  } catch (error: any) {
    console.error('Error importing Stripe invoices:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to import invoices',
        details: error?.message,
        type: error?.type
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});