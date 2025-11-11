const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const bcrypt = require('bcrypt');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Consultant Stripe Price IDs - UPDATE THESE WITH YOUR ACTUAL PRICE IDs FROM STRIPE
const CONSULTANT_PRICES = {
  starter: 'price_xxx_starter',      // Replace with actual Stripe Price ID for $99/mo
  professional: 'price_xxx_prof',    // Replace with actual Stripe Price ID for $299/mo
  premium: 'price_xxx_premium'       // Replace with actual Stripe Price ID for $599/mo
};

// Consultant tier limits
const CONSULTANT_TIER_LIMITS = {
  starter: { max_contacts: 10, max_users: 1, max_advisors: 0, monthly_fee: 99 },
  professional: { max_contacts: 50, max_users: 3, max_advisors: 1, monthly_fee: 299 },
  premium: { max_contacts: 200, max_users: 10, max_advisors: 3, monthly_fee: 599 }
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    const { fullName, email, phone, password, tier, paymentMethodId } = req.body;

    console.log('[Signup Consultant] Processing signup for:', email, 'tier:', tier);

    // Validate required fields
    if (!fullName || !email || !password || !tier || !paymentMethodId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    // Validate tier
    if (!CONSULTANT_PRICES[tier]) {
      return res.status(400).json({
        success: false,
        error: 'Invalid consultant tier'
      });
    }

    // Validate password
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters'
      });
    }

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'An account with this email already exists'
      });
    }

    console.log('[Signup Consultant] Creating Stripe customer');

    // Create Stripe customer
    const customer = await stripe.customers.create({
      email: email,
      name: fullName,
      phone: phone || undefined,
      payment_method: paymentMethodId,
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
      metadata: {
        role: 'consultant',
        tier: tier
      }
    });

    console.log('[Signup Consultant] Stripe customer created:', customer.id);

    // Create subscription with 14-day trial
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: CONSULTANT_PRICES[tier] }],
      trial_period_days: 14,
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        role: 'consultant',
        tier: tier,
        email: email
      }
    });

    console.log('[Signup Consultant] Subscription created:', subscription.id);

    // Generate unique subdomain for consultant
    const baseSubdomain = fullName.toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 20);
    const timestamp = Date.now().toString().slice(-6);
    const subdomain = `${baseSubdomain}${timestamp}`;

    console.log('[Signup Consultant] Creating tenant:', subdomain);

    // Create tenant for consultant
    const tierLimits = CONSULTANT_TIER_LIMITS[tier];
    const trialEndsAt = new Date(subscription.trial_end * 1000);

    const { data: newTenant, error: tenantError } = await supabase
      .from('tenants')
      .insert([{
        business_name: `${fullName}'s Practice`,
        subdomain: subdomain,
        owner_name: fullName,
        owner_email: email.toLowerCase().trim(),
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
        features: JSON.stringify({ consultant: true }),
        status: 'active',
        onboarded_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (tenantError) {
      console.error('[Signup Consultant] Error creating tenant:', tenantError);

      // Cleanup Stripe subscription if tenant creation fails
      try {
        await stripe.subscriptions.cancel(subscription.id);
        await stripe.customers.del(customer.id);
      } catch (cleanupError) {
        console.error('[Signup Consultant] Error cleaning up Stripe:', cleanupError);
      }

      return res.status(500).json({
        success: false,
        error: 'Failed to create tenant account'
      });
    }

    console.log('[Signup Consultant] Tenant created:', newTenant.id);

    // Hash password before storing
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    console.log('[Signup Consultant] Password hashed successfully');

    // Create user in database - NOW WITH PROPER TENANT_ID AND HASHED PASSWORD
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert([{
        email: email.toLowerCase().trim(),
        full_name: fullName,
        password_hash: hashedPassword,  // ✅ Store hashed password
        role: 'consultant',
        user_type: 'consultant',
        status: 'active',
        permissions: ['consultant-dashboard.view'], // Consultant permissions
        stripe_customer_id: customer.id,
        stripe_subscription_id: subscription.id,
        subscription_tier: tier,
        subscription_status: subscription.status,
        trial_ends_at: trialEndsAt.toISOString(),
        tenant_id: newTenant.id, // ✅ NOW USING PROPER TENANT ID
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (createError) {
      console.error('[Signup Consultant] Error creating user:', createError);

      // Cleanup tenant and Stripe subscription if user creation fails
      try {
        await supabase.from('tenants').delete().eq('id', newTenant.id);
        await stripe.subscriptions.cancel(subscription.id);
        await stripe.customers.del(customer.id);
      } catch (cleanupError) {
        console.error('[Signup Consultant] Error cleaning up:', cleanupError);
      }

      return res.status(500).json({
        success: false,
        error: 'Failed to create account'
      });
    }

    console.log('[Signup Consultant] ✅ User created successfully:', newUser.id);

    // Create tenant settings
    await supabase
      .from('tenant_settings')
      .insert([{
        tenant_id: newTenant.id,
        timezone: 'America/Vancouver',
        currency: 'USD',
        integrations_enabled: JSON.stringify({}),
        created_at: new Date().toISOString()
      }]);

    // Create subscription history
    await supabase
      .from('subscription_history')
      .insert([{
        tenant_id: newTenant.id,
        event_type: 'trial_started',
        to_tier: tier,
        to_status: 'trial',
        amount: 0,
        notes: '14-day free trial started (consultant)',
        created_at: new Date().toISOString()
      }]);

    console.log('[Signup Consultant] ✅ Tenant settings and history created');

    // Return success
    return res.status(201).json({
      success: true,
      user: {
        id: newUser.id,
        email: newUser.email,
        full_name: newUser.full_name,
        name: newUser.full_name,
        role: 'consultant',
        type: 'consultant',
        status: newUser.status,
        permissions: newUser.permissions,
        tier: tier,
        trialEndsAt: newUser.trial_ends_at,
        redirectTo: 'consultant-dashboard.html'
      },
      token: 'demo-token-' + newUser.id,
      message: 'Account created successfully! Your 14-day free trial starts now.'
    });

  } catch (error) {
    console.error('[Signup Consultant] Server error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
};
