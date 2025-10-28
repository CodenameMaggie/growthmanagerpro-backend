const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // Use SERVICE_KEY for admin operations
const supabase = createClient(supabaseUrl, supabaseKey);

// Permission definitions matching permissions.js
const PERMISSIONS = {
  admin: 'all',
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

        // CREATE SUPABASE AUTH SESSION
        // This is the key difference - we create a real Supabase session
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: email.toLowerCase(),
          password: password
        });

        // If Supabase Auth user doesn't exist yet, create it
        if (authError && authError.message.includes('Invalid login credentials')) {
          // Create Supabase Auth user
          const { data: newAuthData, error: signUpError } = await supabase.auth.admin.createUser({
            email: email.toLowerCase(),
            password: password,
            email_confirm: true,
            user_metadata: {
              id: adminUser.id,
              name: adminUser.name,
              role: userRole,
              type: 'admin',
              permissions: PERMISSIONS[userRole] || PERMISSIONS.admin
            }
          });

          if (signUpError) {
            console.error('Error creating Supabase Auth user:', signUpError);
            return res.status(500).json({
              success: false,
              error: 'Failed to create authentication session'
            });
          }

          // Now sign them in
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email: email.toLowerCase(),
            password: password
          });

          if (signInError) {
            console.error('Error signing in after creation:', signInError);
            return res.status(500).json({
              success: false,
              error: 'Authentication failed'
            });
          }

          // Return user data with session
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
            },
            session: signInData.session
          });
        }

        if (authError) {
          console.error('Auth error:', authError);
          return res.status(500).json({
            success: false,
            error: 'Authentication failed'
          });
        }

        // Successful admin login with Supabase session
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
          },
          session: authData.session
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

    // CREATE SUPABASE AUTH SESSION FOR CLIENT
    const { data: clientAuthData, error: clientAuthError } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase(),
      password: password
    });

    // If client doesn't have Supabase Auth account, create it
    if (clientAuthError && clientAuthError.message.includes('Invalid login credentials')) {
      const { data: newClientAuth, error: clientSignUpError } = await supabase.auth.admin.createUser({
        email: email.toLowerCase(),
        password: password,
        email_confirm: true,
        user_metadata: {
          id: clientUser.id,
          name: clientUser.name,
          company: clientUser.company,
          role: 'client',
          type: 'client',
          permissions: PERMISSIONS.client
        }
      });

      if (clientSignUpError) {
        console.error('Error creating client Supabase Auth user:', clientSignUpError);
        return res.status(500).json({
          success: false,
          error: 'Failed to create authentication session'
        });
      }

      // Sign them in
      const { data: clientSignInData, error: clientSignInError } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase(),
        password: password
      });

      if (clientSignInError) {
        console.error('Error signing in client:', clientSignInError);
        return res.status(500).json({
          success: false,
          error: 'Authentication failed'
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          id: clientUser.id,
          name: clientUser.name,
          email: clientUser.email,
          company: clientUser.company,
          role: 'client',
          type: 'client',
          permissions: PERMISSIONS.client,
          redirectTo: '/client-portal.html'
        },
        session: clientSignInData.session
      });
    }

    if (clientAuthError) {
      console.error('Client auth error:', clientAuthError);
      return res.status(500).json({
        success: false,
        error: 'Authentication failed'
      });
    }

    // Successful client login with Supabase session
    return res.status(200).json({
      success: true,
      data: {
        id: clientUser.id,
        name: clientUser.name,
        email: clientUser.email,
        company: clientUser.company,
        role: 'client',
        type: 'client',
        permissions: PERMISSIONS.client,
        redirectTo: '/client-portal.html'
      },
      session: clientAuthData.session
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      error: 'Login failed. Please try again.'
    });
  }
};
