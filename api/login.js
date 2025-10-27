const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

// Permission definitions matching permissions.js
const PERMISSIONS = {
  admin: 'all', // Admin has all permissions
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
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    // First, check if this is an admin/advisor login (from users table)
    const { data: adminUser, error: adminError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (adminUser && !adminError) {
      // Admin login - check password (you should hash passwords in production!)
      if (adminUser.password === password) {
        const userRole = adminUser.role || 'admin';
        
        return res.status(200).json({
          success: true,
          data: {
            id: adminUser.id,
            name: adminUser.name,
            email: adminUser.email,
            role: userRole,
            type: 'admin',
            permissions: PERMISSIONS[userRole] || PERMISSIONS.admin,
            redirectTo: '/dashboard.html'
          }
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

    // Successful client login - return their data with UUID and permissions
    return res.status(200).json({
      success: true,
      data: {
        id: clientUser.id, // UUID
        name: clientUser.name,
        email: clientUser.email,
        company: clientUser.company,
        role: 'client',
        type: 'client',
        permissions: PERMISSIONS.client,
        redirectTo: '/client-portal.html'
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
