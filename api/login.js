const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

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

// Read request body properly
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
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    // Check users table
    const { data: adminUser, error: adminError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (adminUser && !adminError && adminUser.password === password) {
      const userRole = adminUser.role || 'admin';
      
      console.log('[Login] ✅ Success:', email);

      return res.status(200).json({
        success: true,
        data: {
          id: adminUser.id,
          name: adminUser.full_name || adminUser.name || email.split('@')[0],
          full_name: adminUser.full_name || adminUser.name,
          email: adminUser.email,
          role: userRole,
          type: userRole === 'advisor' ? 'advisor' : 'admin',
          permissions: PERMISSIONS[userRole] || PERMISSIONS.admin,
          redirectTo: userRole === 'advisor' ? '/advisor-dashboard.html' : '/dashboard.html'
        }
      });
    }

    // Check contacts
    const { data: clientUser, error: clientError } = await supabase
      .from('contacts')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (clientUser && !clientError) {
      const clientPassword = clientUser.password || clientUser.temp_password;
      if (clientPassword === password) {
        console.log('[Login] ✅ Client success:', email);
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
      }
    }

    console.log('[Login] ❌ Failed:', email);
    return res.status(401).json({ success: false, error: 'Invalid email or password' });

  } catch (error) {
    console.error('[Login] ERROR:', error);
    return res.status(500).json({ success: false, error: 'Login error: ' + error.message });
  }
};
