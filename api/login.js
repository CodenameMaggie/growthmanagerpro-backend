const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// PERMISSIONS - Exact roles
const PERMISSIONS = {
  admin: 'all',
  saas: 'all',
  advisor: ['advisor-dashboard.view'],
  consultant: ['advisor-dashboard.view'],
  client: ['client-dashboard.view']
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

    console.log('[Login] Attempting login for:', email);

    // Check users table (admin/saas/advisor/consultant)
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (user && !userError) {
      // User found in users table
      if (user.password === password) {
        const userRole = user.role || 'admin';
        
        // Determine redirect based on role
        let redirectTo;
        let userType;
        
        if (userRole === 'admin' || userRole === 'saas') {
          redirectTo = '/dashboard.html';
          userType = 'admin';
        } else if (userRole === 'advisor' || userRole === 'consultant') {
          redirectTo = '/advisor-dashboard.html';
          userType = 'advisor';
        } else {
          redirectTo = '/dashboard.html';
          userType = 'admin';
        }

        console.log('[Login] ✅ Login successful:', user.email, 'Role:', userRole, 'Redirect:', redirectTo);

        return res.status(200).json({
          success: true,
          user: {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            role: userRole,
            type: userType,
            permissions: PERMISSIONS[userRole] || PERMISSIONS.admin,
            redirectTo: redirectTo
          }
        });
      } else {
        console.log('[Login] ❌ Invalid password for:', email);
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password'
        });
      }
    }

    // Not in users table - check contacts table (clients)
    const { data: client, error: clientError } = await supabase
      .from('contacts')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (clientError || !client) {
      console.log('[Login] ❌ User not found:', email);
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Check client password
    const clientPassword = client.password || client.temp_password;

    if (!clientPassword) {
      return res.status(401).json({
        success: false,
        error: 'Account not fully set up. Please contact support.'
      });
    }

    if (clientPassword !== password) {
      console.log('[Login] ❌ Invalid password for client:', email);
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    console.log('[Login] ✅ Client login successful:', client.email);

    // Client login successful
    return res.status(200).json({
      success: true,
      user: {
        id: client.id,
        email: client.email,
        full_name: client.name || client.full_name,
        company: client.company,
        role: 'client',
        type: 'client',
        permissions: PERMISSIONS.client,
        redirectTo: '/client-dashboard.html'
      }
    });

  } catch (error) {
    console.error('[Login] ❌ Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Login failed. Please try again.'
    });
  }
};
