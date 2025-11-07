const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL 
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY 
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

// Read request body
async function getBody(req) {
  if (req.body) {
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  }
  
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => { data += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const body = await getBody(req);
    const email = body.email;
    const password = body.password;

    console.log('[Login] Attempt:', email);

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password required' });
    }

    // Check users table - ONLY select columns that exist!
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, password, full_name, role, user_type')
      .eq('email', email.toLowerCase())
      .single();

    if (user && !userError && user.password === password) {
      const userRole = user.role || 'admin';
      const redirectTo = (userRole === 'advisor' || userRole === 'consultant') 
        ? '/advisor-dashboard.html' 
        : '/dashboard.html';

      console.log('[Login] ✅ Success:', email, 'Role:', userRole);

      // Return data matching YOUR database structure
      return res.status(200).json({
        success: true,
        data: {
          id: user.id,
          name: user.full_name || email.split('@')[0],  // Use full_name, fallback to email
          full_name: user.full_name,  // This is what your dashboards expect
          email: user.email,
          role: userRole,
          type: userRole === 'advisor' ? 'advisor' : 'admin',
          permissions: PERMISSIONS[userRole] || PERMISSIONS.admin,
          redirectTo: redirectTo
        }
      });
    }

    // Check contacts table
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (contact && !contactError) {
      const clientPassword = contact.password || contact.temp_password;
      if (clientPassword === password) {
        console.log('[Login] ✅ Client success:', email);
        return res.status(200).json({
          success: true,
          data: {
            id: contact.id,
            name: contact.name || contact.company || email.split('@')[0],
            full_name: contact.name,
            email: contact.email,
            company: contact.company,
            role: 'client',
            type: 'client',
            permissions: PERMISSIONS.client,
            redirectTo: '/client-dashboard.html'
          }
        });
      }
    }

    console.log('[Login] ❌ Invalid credentials');
    return res.status(401).json({ success: false, error: 'Invalid email or password' });

  } catch (error) {
    console.error('[Login] ERROR:', error);
    return res.status(500).json({ success: false, error: 'Login failed: ' + error.message });
  }
};
