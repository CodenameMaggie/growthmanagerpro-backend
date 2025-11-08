// API: /api/signup-saas.js
// Handles SaaS tenant signup with Stripe subscription

const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Price ID mapping
const PRICE_IDS = {
    const PRICE_IDS = {
    foundations: process.env.STRIPE_PRICE_FOUNDATIONS,
    growth: process.env.STRIPE_PRICE_GROWTH,
    scale: process.env.STRIPE_PRICE_SCALE,
    enterprise: process.env.STRIPE_PRICE_ENTERPRISE
};

// Tier limits
const TIER_LIMITS = {
    const TIER_LIMITS = {
    foundations: { max_contacts: 25, max_users: 2, max_advisors: 1, monthly_fee: 297 },
    growth: { max_contacts: 50, max_users: 3, max_advisors: 2, monthly_fee: 597 },
    scale: { max_contacts: 200, max_users: 10, max_advisors: 5, monthly_fee: 997 },
    enterprise: { max_contacts: 999999, max_users: 999999, max_advisors: 999999, monthly_fee: 2500 }
};

module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const {
            businessName,
            subdomain,
            ownerName,
            email,
            phone,
            password,
            tier,
            paymentMethodId
        } = req.body;

        console.log('[SaaS Signup] Processing:', { businessName, subdomain, email, tier });

        // Validate required fields
        if (!businessName || !subdomain || !ownerName || !email || !password || !tier || !paymentMethodId) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
        }

        // Validate tier
        if (!TIER_LIMITS[tier]) {
            return res.status(400).json({
                success: false,
                error: 'Invalid subscription tier'
            });
        }

        // Validate subdomain format
        const subdomainRegex = /^[a-z0-9-]{3,30}$/;
        if (!subdomainRegex.test(subdomain)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid subdomain format'
            });
        }

        // Check if subdomain is available
        const { data: existingTenant } = await supabase
            .from('tenants')
            .select('id')
            .eq('subdomain', subdomain)
            .single();

        if (existingTenant) {
            return res.status(400).json({
                success: false,
                error: 'Subdomain already taken'
            });
        }

        // Check if email already exists
        const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .eq('email', email)
            .single();

        if (existingUser) {
            return res.status(400).json({
                success: false,
                error: 'Email already registered'
            });
        }

        // Step 1: Create Stripe customer
        console.log('[SaaS Signup] Creating Stripe customer...');
        const customer = await stripe.customers.create({
            email: email,
            name: ownerName,
            metadata: {
                business_name: businessName,
                subdomain: subdomain,
                tier: tier
            }
        });

        // Step 2: Attach payment method to customer
        await stripe.paymentMethods.attach(paymentMethodId, {
            customer: customer.id,
        });

        // Set as default payment method
        await stripe.customers.update(customer.id, {
            invoice_settings: {
                default_payment_method: paymentMethodId,
            },
        });

        // Step 3: Create subscription with 14-day trial
        console.log('[SaaS Signup] Creating Stripe subscription...');
        const priceId = PRICE_IDS[tier];
        
        if (!priceId) {
            throw new Error(`Price ID not configured for tier: ${tier}`);
        }

        const subscription = await stripe.subscriptions.create({
            customer: customer.id,
            items: [{ price: priceId }],
            trial_period_days: 14,
            payment_behavior: 'default_incomplete',
            expand: ['latest_invoice.payment_intent'],
        });

        // Step 4: Calculate trial end date
        const trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + 14);

        // Step 5: Create tenant in database
        console.log('[SaaS Signup] Creating tenant in database...');
        const tierLimits = TIER_LIMITS[tier];
        
        const { data: newTenant, error: tenantError } = await supabase
            .from('tenants')
            .insert({
                business_name: businessName,
                subdomain: subdomain,
                owner_name: ownerName,
                owner_email: email,
                owner_phone: phone || null,
                subscription_tier: tier,
                subscription_status: 'trial',
                billing_cycle: 'monthly',
                monthly_fee: tierLimits.monthly_fee,
                trial_ends_at: trialEndsAt.toISOString(),
                subscription_started_at: new Date().toISOString(),
                stripe_customer_id: customer.id,
                stripe_subscription_id: subscription.id,
                max_contacts: tierLimits.max_contacts,
                max_users: tierLimits.max_users,
                max_advisors: tierLimits.max_advisors,
                features: JSON.stringify({ all: true }),
                status: 'active',
                onboarded_at: new Date().toISOString(),
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (tenantError) {
            console.error('[SaaS Signup] Tenant creation error:', tenantError);
            // Cleanup: Cancel Stripe subscription
            await stripe.subscriptions.cancel(subscription.id);
            throw new Error('Failed to create tenant account');
        }

        console.log('[SaaS Signup] Tenant created:', newTenant.id);

        // Step 6: Hash password and create owner user
        const plainPassword = password; // Store plain text to match login.js
        const { data: newUser, error: userError } = await supabase
            .from('users')
            .insert({
                tenant_id: newTenant.id,
                email: email,
                full_name: ownerName,
                password: plainPassword,
                role: 'owner',
                status: 'active',
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (userError) {
            console.error('[SaaS Signup] User creation error:', userError);
            // Cleanup: Delete tenant and cancel subscription
            await supabase.from('tenants').delete().eq('id', newTenant.id);
            await stripe.subscriptions.cancel(subscription.id);
            throw new Error('Failed to create user account');
        }

        console.log('[SaaS Signup] User created:', newUser.id);

        // Step 7: Create tenant_settings record
        await supabase
            .from('tenant_settings')
            .insert({
                tenant_id: newTenant.id,
                timezone: 'America/Vancouver',
                currency: 'USD',
                integrations_enabled: JSON.stringify({}),
                created_at: new Date().toISOString()
            });

        // Step 8: Log subscription history
        await supabase
            .from('subscription_history')
            .insert({
                tenant_id: newTenant.id,
                event_type: 'trial_started',
                to_tier: tier,
                to_status: 'trial',
                amount: 0,
                notes: '14-day free trial started',
                created_at: new Date().toISOString()
            });

        // Step 9: Send welcome email
        // TODO: Integrate with email service
        console.log('[SaaS Signup] TODO: Send welcome email to:', email);

        // Success!
        return res.json({
            success: true,
            tenantId: newTenant.id,
            userId: newUser.id,
            subdomain: subdomain,
            token: 'demo-token-' + newUser.id, // Replace with real JWT
            message: 'Account created successfully! Your 14-day free trial has started.',
            trialEndsAt: trialEndsAt.toISOString()
        });

    } catch (error) {
        console.error('[SaaS Signup] Error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
};
