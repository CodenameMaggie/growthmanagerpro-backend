const { createClient } = require('@supabase/supabase-js');

// Use correct env var names
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const PERMISSIONS = {
  admin: 'all',
  advisor: ['calls.view', 'deals.view', 'pipeline.view', 'campaigns.view'],
  manager: [
    'dashboard.view', 'dashboard.edit', 'contacts.view', 'contacts.create',
    'contacts.edit', 'calls.view', 'calls.create', 'calls.edit',
    'deals.view', 'deals.create', 'deals.edit', 'pipeline.view',
    'pipeline.edit', 'campaigns.view', 'campaigns.create', 'campaigns.edit',
    'financials.view', 'sprints.view', 'sprints.create', 'sprints.edit',
    'users.view'
  ],
  client: [
    'dashboard.view', 'contacts.view', 'calls.view', 'deals.view',
    'pipeline.view', 'financials.view'
  ]
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
    // ONLY CHANGE: Better body handling
    let email, password;
    
    if (req.body) {
      if (typeof req.body === 'object') {
        email = req.body.email;
        password = req.body.password;
      } else if (typeof req.body === 'string') {
        const parsed = JSON.parse(req.body);
        email = parsed.email;
        password = parsed.password;
      }
    }

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    // Check users table
    const { data: adminUser, error: adminError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (adminUser && !adminError) {
      if (adminUser.password === password) {
        const userRole = adminUser.role || 'admin';
        
        let redirectTo = '/dashboard.html';
        if (userRole === 'advisor' || userRole === 'consultant') {
          redirectTo = '/advisor-dashboard.html';
        }

        // ONLY CHANGE: Added full_name and other fields
        return res.status(200).json({
          success: true,
          data: {
            id: adminUser.id,
            name: adminUser.full_name || adminUser.name || email.split('@')[0],
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
      }
    }

    // Check contacts table
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

    return res.status(200).json({
      success: true,
      data: {
        id: clientUser.id,
        name: clientUser.name || clientUser.company || email.split('@')[0],
        full_name: clientUser.name,
        email: clientUser.email,
        company: clientUser.company,
        role: 'client',
        type: 'client',
        permissions: PERMISSIONS.client,
        redirectTo: '/client-dashboard.html'
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      error: 'Login failed. Please try again.'
    });
  }
};
