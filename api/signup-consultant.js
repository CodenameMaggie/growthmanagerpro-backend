const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Consultant Stripe Price IDs - UPDATE THESE WITH YOUR ACTUAL PRICE IDs FROM STRIPE
const CONSULTANT_PRICES = {
  starter: 'price_xxx_starter',      // Replace with actual Stripe Price ID for $99/mo
  professional: 'price_xxx_prof',    // Replace with actual Stripe Price ID for $299/mo
  premium: 'price_xxx_premium'       // Replace with actual Stripe Price ID for $599/mo
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

    // Create user in database
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert([{
        email: email.toLowerCase().trim(),
        full_name: fullName,
        password: password, // Plain text to match your existing auth
        role: 'consultant',
        user_type: 'consultant',
        status: 'active',
        permissions: ['dashboard.view'], // Consultant permissions
        stripe_customer_id: customer.id,
        stripe_subscription_id: subscription.id,
        subscription_tier: tier,
        subscription_status: subscription.status,
        trial_ends_at: new Date(subscription.trial_end * 1000).toISOString(),
        tenant_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', // Default tenant
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (createError) {
      console.error('[Signup Consultant] Error creating user:', createError);
      
      // Cleanup Stripe subscription if user creation fails
      try {
        await stripe.subscriptions.cancel(subscription.id);
        await stripe.customers.del(customer.id);
      } catch (cleanupError) {
        console.error('[Signup Consultant] Error cleaning up Stripe:', cleanupError);
      }
      
      return res.status(500).json({
        success: false,
        error: 'Failed to create account'
      });
    }

    console.log('[Signup Consultant] ✅ User created successfully:', newUser.id);

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
        redirectTo: 'advisor-dashboard.html'
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
