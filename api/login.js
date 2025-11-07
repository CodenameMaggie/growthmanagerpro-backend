const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
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
    // ✅ FIXED: Parse body properly for Vercel
    let body = req.body;
    
    if (!body) {
      // Read from stream if body is undefined
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const bodyString = Buffer.concat(chunks).toString();
      body = JSON.parse(bodyString);
    } else if (typeof body === 'string') {
      // Parse if body is a string
      body = JSON.parse(body);
    }

    const { email, password } = body;

    console.log('[Login] Received - Email:', email ? '✓' : '✗', 'Password:', password ? '✓' : '✗');

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    // Check users table for admin/advisor
    const { data: adminUser, error: adminError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (adminUser && !adminError) {
      if (adminUser.password !== password) {
        console.log('[Login] ❌ Invalid password');
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password'
        });
      }

      const userRole = adminUser.role || 'admin';
      let redirectTo = '/dashboard.html';
      
      if (userRole === 'advisor' || userRole === 'consultant') {
        redirectTo = '/advisor-dashboard.html';
      }

      console.log('[Login] ✅ Admin success:', email, 'Role:', userRole);

      // ✅ FIXED: Return all user fields including full_name
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
    }

    // Check contacts table for client
    const { data: clientUser, error: clientError } = await supabase
      .from('contacts')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (clientError || !clientUser) {
      console.log('[Login] ❌ User not found');
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    const clientPassword = clientUser.password || clientUser.temp_password;

    if (!clientPassword || clientPassword !== password) {
      console.log('[Login] ❌ Invalid client password');
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    console.log('[Login] ✅ Client success:', email);

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
    console.error('[Login] ERROR:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Login failed: ' + error.message
    });
  }
};
