const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const PRICE_IDS = {
  foundations: process.env.STRIPE_PRICE_FOUNDATIONS,
  growth: process.env.STRIPE_PRICE_GROWTH,
  scale: process.env.STRIPE_PRICE_SCALE,
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE
};

const TIER_LIMITS = {
  foundations: { max_contacts: 25, max_users: 2, max_advisors: 1, monthly_fee: 297 },
  growth: { max_contacts: 50, max_users: 3, max_advisors: 2, monthly_fee: 597 },
  scale: { max_contacts: 200, max_users: 10, max_advisors: 5, monthly_fee: 997 },
  enterprise: { max_contacts: 999999, max_users: 999999, max_advisors: 999999, monthly_fee: 2500 }
};

module.exports = async (req, res) => {
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

    if (!businessName || !subdomain || !ownerName || !email || !password || !tier || !paymentMethodId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    if (!TIER_LIMITS[tier]) {
      return res.status(400).json({
        success: false,
        error: 'Invalid subscription tier'
      });
    }

    const subdomainRegex = /^[a-z0-9-]{3,30}$/;
    if (!subdomainRegex.test(subdomain)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid subdomain format'
      });
    }

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

    console.log('[SaaS Signup] Creating Stripe customer');
    const customer = await stripe.customers.create({
      email: email,
      name: ownerName,
      metadata: {
        business_name: businessName,
        subdomain: subdomain,
        tier: tier
      }
    });

    console.log('[SaaS Signup] Stripe customer created:', customer.id);

    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customer.id,
    });

    await stripe.customers.update(customer.id, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    console.log('[SaaS Signup] Creating subscription');
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

    console.log('[SaaS Signup] Subscription created:', subscription.id);

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);

    console.log('[SaaS Signup] Creating tenant');
    const tierLimits = TIER_LIMITS[tier];
    
    const { data: newTenant, error: tenantError } = await supabase
      .from('tenants')
      .insert([{
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
      }])
      .select()
      .single();

    if (tenantError) {
      console.error('[SaaS Signup] Tenant creation error:', tenantError);
      await stripe.subscriptions.cancel(subscription.id);
      throw new Error('Failed to create tenant account');
    }

    console.log('[SaaS Signup] Tenant created:', newTenant.id);

    const { data: newUser, error: userError } = await supabase
      .from('users')
      .insert([{
        tenant_id: newTenant.id,
        email: email,
        full_name: ownerName,
        password: password,
        role: 'owner',
        status: 'active',
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (userError) {
      console.error('[SaaS Signup] User creation error:', userError);
      await supabase.from('tenants').delete().eq('id', newTenant.id);
      await stripe.subscriptions.cancel(subscription.id);
      throw new Error('Failed to create user account');
    }

    console.log('[SaaS Signup] User created:', newUser.id);

    await supabase
      .from('tenant_settings')
      .insert([{
        tenant_id: newTenant.id,
        timezone: 'America/Vancouver',
        currency: 'USD',
        integrations_enabled: JSON.stringify({}),
        created_at: new Date().toISOString()
      }]);

    await supabase
      .from('subscription_history')
      .insert([{
        tenant_id: newTenant.id,
        event_type: 'trial_started',
        to_tier: tier,
        to_status: 'trial',
        amount: 0,
        notes: '14-day free trial started',
        created_at: new Date().toISOString()
      }]);

    console.log('[SaaS Signup] ✅ Account created successfully');

    return res.status(200).json({
      success: true,
      tenantId: newTenant.id,
      userId: newUser.id,
      subdomain: subdomain,
      token: 'demo-token-' + newUser.id,
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
