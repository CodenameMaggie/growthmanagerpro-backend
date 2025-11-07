// /api/login.js - VERSION THAT READS BODY CORRECTLY
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const PERMISSIONS = {
  admin: 'all',
  advisor: ['calls.view', 'deals.view', 'pipeline.view', 'campaigns.view'],
  client: ['calls.view', 'deals.view', 'pipeline.view'],
  saas: 'all'
};

// Helper function to read request body
async function getBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

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
    // Read the body manually
    const body = req.body || await getBody(req);
    const { email, password } = body;

    console.log('[Login] Received:', { email: email ? 'present' : 'missing', password: password ? 'present' : 'missing' });

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
        console.log('[Login] ❌ Invalid password for:', email);
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

      console.log('[Login] ✅ Success:', email, 'Role:', userRole);

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
      console.log('[Login] ❌ User not found:', email);
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    const clientPassword = clientUser.password || clientUser.temp_password;
    if (!clientPassword || clientPassword !== password) {
      console.log('[Login] ❌ Invalid client password for:', email);
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
    console.error('[Login] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Login failed: ' + error.message
    });
  }
};
