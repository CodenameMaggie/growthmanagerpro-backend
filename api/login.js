// /api/login.js - COMPLETE WORKING VERSION
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const PERMISSIONS = {
  admin: 'all',
  advisor: ['calls.view', 'deals.view', 'pipeline.view', 'campaigns.view'],
  manager: ['dashboard.view', 'dashboard.edit', 'contacts.view', 'contacts.create', 'contacts.edit', 'calls.view', 'calls.create', 'calls.edit', 'deals.view', 'deals.create', 'deals.edit', 'pipeline.view', 'pipeline.edit', 'campaigns.view', 'campaigns.create', 'campaigns.edit', 'financials.view', 'sprints.view', 'sprints.create', 'sprints.edit', 'users.view'],
  client: ['calls.view', 'deals.view', 'pipeline.view'],
  saas: 'all'
};

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

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
    // PARSE BODY (handles both string and object)
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        return res.status(400).json({
          success: false,
          error: 'Invalid JSON in request body'
        });
      }
    }

    const { email, password } = body;

    console.log('[Login] Attempt for:', email);

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    // Check if this is an admin/advisor login (from users table)
    const { data: adminUser, error: adminError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (adminUser && !adminError) {
      // Admin login - check password
      if (adminUser.password === password) {
        const userRole = adminUser.role || 'admin';
        
        // Determine redirect based on role
        let redirectTo = '/dashboard.html';
        if (userRole === 'advisor' || userRole === 'consultant') {
          redirectTo = '/advisor-dashboard.html';
        }

        console.log('[Login] ✅ Admin login successful:', email);

        // Return user data with ALL fields
        return res.status(200).json({
          success: true,
          data: {
            id: adminUser.id,
            name: adminUser.name || adminUser.full_name || email.split('@')[0],
            full_name: adminUser.full_name || adminUser.name,
            email: adminUser.email,
            company_name: adminUser.company_name,
            business_name: adminUser.business_name,
            role: userRole,
            type: userRole === 'advisor' ? 'advisor' : 'admin',
            permissions: PERMISSIONS[userRole] || PERMISSIONS.admin,
            redirectTo: redirectTo
          }
        });
      } else {
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password'
        });
      }
    }

    // If not admin, check if this is a client login (from contacts table)
    const { data: clientUser, error: clientError } = await supabase
      .from('contacts')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (clientError || !clientUser) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // For clients: Check if they have a password field
    const clientPassword = clientUser.password || clientUser.temp_password;

    if (!clientPassword) {
      return res.status(401).json({
        success: false,
        error: 'Account not fully set up. Please contact support.'
      });
    }

    if (clientPassword !== password) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    console.log('[Login] ✅ Client login successful:', email);

    // Successful client login
    return res.status(200).json({
      success: true,
      data: {
        id: clientUser.id,
        name: clientUser.name || clientUser.company || email.split('@')[0],
        full_name: clientUser.name,
        email: clientUser.email,
        company: clientUser.company,
        company_name: clientUser.company,
        role: 'client',
        type: 'client',
        permissions: PERMISSIONS.client,
        redirectTo: '/client-dashboard.html'
      }
    });

  } catch (error) {
    console.error('[Login] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Login failed. Please try again.'
    });
  }
};
