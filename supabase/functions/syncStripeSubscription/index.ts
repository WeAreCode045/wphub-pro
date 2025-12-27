import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'npm:stripe@14.11.0';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2023-10-16' });

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get auth user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: corsHeaders }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authUser) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: corsHeaders }
      );
    }

    // Check if user is admin
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

    // Get subscription_id from request
    const { subscription_id } = await req.json();

    if (!subscription_id) {
      return new Response(
        JSON.stringify({ error: 'subscription_id is required' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Get the user_subscription record
    const { data: userSub, error: subError } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('id', subscription_id)
      .single();

    if (subError || !userSub) {
      return new Response(
        JSON.stringify({ error: 'Subscription not found' }),
        { status: 404, headers: corsHeaders }
      );
    }

    if (!userSub.stripe_subscription_id) {
      return new Response(
        JSON.stringify({ error: 'No Stripe subscription ID found for this subscription' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Fetch subscription from Stripe
    const stripeSubscription = await stripe.subscriptions.retrieve(userSub.stripe_subscription_id, {
      expand: ['latest_invoice', 'customer', 'default_payment_method']
    });

    // Map Stripe status to our status
    const statusMapping: Record<string, string> = {
      'active': 'active',
      'trialing': 'trialing',
      'past_due': 'past_due',
      'canceled': 'canceled',
      'unpaid': 'past_due',
      'incomplete': 'incomplete',
      'incomplete_expired': 'canceled',
      'paused': 'paused'
    };

    const mappedStatus = statusMapping[stripeSubscription.status] || 'active';

    // Update the subscription record with fresh Stripe data
    const updateData: any = {
      status: mappedStatus,
      stripe_customer_id: stripeSubscription.customer as string,
      current_period_start: new Date(stripeSubscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(stripeSubscription.current_period_end * 1000).toISOString(),
      updated_at: new Date().toISOString()
    };

    // Add optional fields if present
    if (stripeSubscription.canceled_at) {
      updateData.canceled_at = new Date(stripeSubscription.canceled_at * 1000).toISOString();
    }
    if (stripeSubscription.trial_end) {
      updateData.trial_end = new Date(stripeSubscription.trial_end * 1000).toISOString();
    }
    if (stripeSubscription.trial_start) {
      updateData.trial_start = new Date(stripeSubscription.trial_start * 1000).toISOString();
    }

    const { data: updatedSub, error: updateError } = await supabase
      .from('user_subscriptions')
      .update(updateData)
      .eq('id', subscription_id)
      .select()
      .single();

    if (updateError) {
      return new Response(
        JSON.stringify({ error: 'Failed to update subscription', details: updateError.message }),
        { status: 500, headers: corsHeaders }
      );
    }

    // Sync latest invoice if available
    let invoiceData = null;
    if (stripeSubscription.latest_invoice) {
      const invoice = typeof stripeSubscription.latest_invoice === 'string'
        ? await stripe.invoices.retrieve(stripeSubscription.latest_invoice)
        : stripeSubscription.latest_invoice;

      // Check if invoice already exists
      const { data: existingInvoice } = await supabase
        .from('invoices')
        .select('id')
        .eq('stripe_invoice_id', invoice.id)
        .single();

      if (!existingInvoice) {
        // Create new invoice record
        const { data: newInvoice, error: invoiceError } = await supabase
          .from('invoices')
          .insert({
            user_id: userSub.user_id,
            subscription_id: userSub.id,
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
            created_at: new Date(invoice.created * 1000).toISOString()
          })
          .select()
          .single();

        if (!invoiceError) {
          invoiceData = newInvoice;
        }
      } else {
        invoiceData = existingInvoice;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        subscription: updatedSub,
        stripe_data: {
          status: stripeSubscription.status,
          current_period_start: stripeSubscription.current_period_start,
          current_period_end: stripeSubscription.current_period_end,
          trial_end: stripeSubscription.trial_end,
          canceled_at: stripeSubscription.canceled_at
        },
        invoice: invoiceData,
        message: 'Subscription synced successfully from Stripe'
      }),
      { status: 200, headers: corsHeaders }
    );

  } catch (error: any) {
    console.error('Error syncing Stripe subscription:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to sync subscription',
        details: error.message,
        type: error.type
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});
