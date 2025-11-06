// API: /api/webhooks/stripe.js
// Handle Stripe webhook events for subscription management

const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const sig = req.headers['stripe-signature'];
    let event;

    try {
        // Verify webhook signature
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
        console.error('[Stripe Webhook] Signature verification failed:', err.message);
        return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
    }

    console.log('[Stripe Webhook] Event received:', event.type);

    try {
        switch (event.type) {
            case 'customer.subscription.created':
                await handleSubscriptionCreated(event.data.object);
                break;

            case 'customer.subscription.updated':
                await handleSubscriptionUpdated(event.data.object);
                break;

            case 'customer.subscription.deleted':
                await handleSubscriptionDeleted(event.data.object);
                break;

            case 'customer.subscription.trial_will_end':
                await handleTrialWillEnd(event.data.object);
                break;

            case 'invoice.payment_succeeded':
                await handlePaymentSucceeded(event.data.object);
                break;

            case 'invoice.payment_failed':
                await handlePaymentFailed(event.data.object);
                break;

            default:
                console.log('[Stripe Webhook] Unhandled event type:', event.type);
        }

        return res.json({ received: true });
    } catch (error) {
        console.error('[Stripe Webhook] Error processing event:', error);
        return res.status(500).json({ error: 'Webhook processing failed' });
    }
};

// Handle subscription created
async function handleSubscriptionCreated(subscription) {
    console.log('[Webhook] Subscription created:', subscription.id);
    
    const { data: tenant } = await supabase
        .from('tenants')
        .select('*')
        .eq('stripe_subscription_id', subscription.id)
        .single();

    if (!tenant) {
        console.error('[Webhook] Tenant not found for subscription:', subscription.id);
        return;
    }

    // Log event
    await supabase
        .from('subscription_history')
        .insert({
            tenant_id: tenant.id,
            event_type: 'subscribed',
            to_tier: tenant.subscription_tier,
            to_status: subscription.status,
            amount: subscription.items.data[0].price.unit_amount / 100,
            notes: 'Subscription created',
            created_at: new Date().toISOString()
        });
}

// Handle subscription updated
async function handleSubscriptionUpdated(subscription) {
    console.log('[Webhook] Subscription updated:', subscription.id);
    
    const { data: tenant } = await supabase
        .from('tenants')
        .select('*')
        .eq('stripe_subscription_id', subscription.id)
        .single();

    if (!tenant) {
        console.error('[Webhook] Tenant not found for subscription:', subscription.id);
        return;
    }

    // Update tenant status
    const newStatus = subscription.status === 'active' ? 'active' : 
                      subscription.status === 'trialing' ? 'trial' :
                      subscription.status === 'canceled' ? 'cancelled' : 'paused';

    await supabase
        .from('tenants')
        .update({
            subscription_status: newStatus,
            updated_at: new Date().toISOString()
        })
        .eq('id', tenant.id);

    // Log event
    await supabase
        .from('subscription_history')
        .insert({
            tenant_id: tenant.id,
            event_type: 'updated',
            from_status: tenant.subscription_status,
            to_status: newStatus,
            notes: `Subscription status changed to ${subscription.status}`,
            created_at: new Date().toISOString()
        });

    console.log('[Webhook] Tenant status updated:', { tenant_id: tenant.id, new_status: newStatus });
}

// Handle subscription deleted (cancelled)
async function handleSubscriptionDeleted(subscription) {
    console.log('[Webhook] Subscription cancelled:', subscription.id);
    
    const { data: tenant } = await supabase
        .from('tenants')
        .select('*')
        .eq('stripe_subscription_id', subscription.id)
        .single();

    if (!tenant) {
        console.error('[Webhook] Tenant not found for subscription:', subscription.id);
        return;
    }

    // Update tenant to cancelled
    await supabase
        .from('tenants')
        .update({
            subscription_status: 'cancelled',
            status: 'suspended',
            updated_at: new Date().toISOString()
        })
        .eq('id', tenant.id);

    // Log event
    await supabase
        .from('subscription_history')
        .insert({
            tenant_id: tenant.id,
            event_type: 'cancelled',
            from_status: tenant.subscription_status,
            to_status: 'cancelled',
            notes: 'Subscription cancelled',
            created_at: new Date().toISOString()
        });

    // TODO: Send cancellation email
    console.log('[Webhook] TODO: Send cancellation email to:', tenant.owner_email);
}

// Handle trial will end (3 days before)
async function handleTrialWillEnd(subscription) {
    console.log('[Webhook] Trial ending soon:', subscription.id);
    
    const { data: tenant } = await supabase
        .from('tenants')
        .select('*')
        .eq('stripe_subscription_id', subscription.id)
        .single();

    if (!tenant) {
        console.error('[Webhook] Tenant not found for subscription:', subscription.id);
        return;
    }

    // TODO: Send trial ending reminder email
    console.log('[Webhook] TODO: Send trial reminder email to:', tenant.owner_email);
    
    // Log event
    await supabase
        .from('subscription_history')
        .insert({
            tenant_id: tenant.id,
            event_type: 'trial_ending',
            notes: 'Trial ending in 3 days',
            created_at: new Date().toISOString()
        });
}

// Handle successful payment
async function handlePaymentSucceeded(invoice) {
    console.log('[Webhook] Payment succeeded:', invoice.id);
    
    if (!invoice.subscription) return;

    const { data: tenant } = await supabase
        .from('tenants')
        .select('*')
        .eq('stripe_subscription_id', invoice.subscription)
        .single();

    if (!tenant) {
        console.error('[Webhook] Tenant not found for subscription:', invoice.subscription);
        return;
    }

    // Update tenant to active if trial just ended
    if (tenant.subscription_status === 'trial') {
        await supabase
            .from('tenants')
            .update({
                subscription_status: 'active',
                updated_at: new Date().toISOString()
            })
            .eq('id', tenant.id);
    }

    // Log payment
    await supabase
        .from('subscription_history')
        .insert({
            tenant_id: tenant.id,
            event_type: 'payment_succeeded',
            amount: invoice.amount_paid / 100,
            notes: `Payment of $${invoice.amount_paid / 100} successful`,
            created_at: new Date().toISOString()
        });

    // TODO: Send payment receipt email
    console.log('[Webhook] TODO: Send payment receipt to:', tenant.owner_email);
}

// Handle failed payment
async function handlePaymentFailed(invoice) {
    console.log('[Webhook] Payment failed:', invoice.id);
    
    if (!invoice.subscription) return;

    const { data: tenant } = await supabase
        .from('tenants')
        .select('*')
        .eq('stripe_subscription_id', invoice.subscription)
        .single();

    if (!tenant) {
        console.error('[Webhook] Tenant not found for subscription:', invoice.subscription);
        return;
    }

    // Update tenant status to paused
    await supabase
        .from('tenants')
        .update({
            subscription_status: 'paused',
            status: 'suspended',
            updated_at: new Date().toISOString()
        })
        .eq('id', tenant.id);

    // Log failed payment
    await supabase
        .from('subscription_history')
        .insert({
            tenant_id: tenant.id,
            event_type: 'payment_failed',
            amount: invoice.amount_due / 100,
            notes: `Payment of $${invoice.amount_due / 100} failed`,
            created_at: new Date().toISOString()
        });

    // TODO: Send payment failed email
    console.log('[Webhook] TODO: Send payment failed email to:', tenant.owner_email);
}
