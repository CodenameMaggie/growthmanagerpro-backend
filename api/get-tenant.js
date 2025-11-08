const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { subdomain } = req.query;

    if (!subdomain) {
      return res.status(400).json({
        success: false,
        error: 'Subdomain is required'
      });
    }

    console.log('[Get Tenant] Looking up subdomain:', subdomain);

    // Get tenant from database
    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('id, subdomain, business_name, subscription_tier, subscription_status, status, max_contacts, max_users, max_advisors')
      .eq('subdomain', subdomain)
      .single();

    if (error || !tenant) {
      console.log('[Get Tenant] Tenant not found:', subdomain);
      return res.status(404).json({
        success: false,
        error: 'Tenant not found'
      });
    }

    // Check if tenant is active
    if (tenant.status !== 'active') {
      return res.status(403).json({
        success: false,
        error: 'Tenant account is inactive',
        status: tenant.status
      });
    }

    console.log('[Get Tenant] Found tenant:', tenant.id, tenant.business_name);

    return res.status(200).json({
      success: true,
      tenant: {
        id: tenant.id,
        subdomain: tenant.subdomain,
        business_name: tenant.business_name,
        subscription_tier: tenant.subscription_tier,
        subscription_status: tenant.subscription_status,
        limits: {
          max_contacts: tenant.max_contacts,
          max_users: tenant.max_users,
          max_advisors: tenant.max_advisors
        }
      }
    });

  } catch (error) {
    console.error('[Get Tenant] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
};
