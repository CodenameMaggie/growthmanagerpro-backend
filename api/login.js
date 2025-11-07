const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const PERMISSIONS = {
  admin: 'all',
  advisor: ['calls.view', 'deals.view', 'pipeline.view', 'campaigns.view'],
  client: ['dashboard.view', 'contacts.view', 'calls.view', 'deals.view', 'pipeline.view', 'financials.view']
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    // Log everything for debugging
    console.log('[Login] req.body type:', typeof req.body);
    console.log('[Login] req.body:', JSON.stringify(req.body));
    
    let email, password;
    
    // Try different ways to get the data
    if (req.body && typeof req.body === 'object') {
      email = req.body.email;
      password = req.body.password;
      console.log('[Login] Got from object');
    } else if (typeof req.body === 'string') {
      const parsed = JSON.parse(req.body);
      email = parsed.email;
      password = parsed.password;
      console.log('[Login] Got from string');
    } else {
      console.log('[Login] Body is neither object nor string!');
      return res.status(400).json({
        success: false,
        error: 'Cannot parse request body',
        debug: { bodyType: typeof req.body, body: req.body }
      });
    }

    console.log('[Login] Email:', email, 'Password:', password ? '***' : 'MISSING');

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password required' });
    }

    // Check users table
    const { data: user } = await supabase
      .from('users')
      .select('id, email, password, full_name, role, user_type')
      .eq('email', email.toLowerCase())
      .single();

    if (user && user.password === password) {
      const userRole = user.role || 'admin';
      console.log('[Login] ✅ Success');

      return res.status(200).json({
        success: true,
        data: {
          id: user.id,
          name: user.full_name || email.split('@')[0],
          full_name: user.full_name,
          email: user.email,
          role: userRole,
          type: userRole === 'advisor' ? 'advisor' : 'admin',
          permissions: PERMISSIONS[userRole] || PERMISSIONS.admin,
          redirectTo: userRole === 'advisor' ? '/advisor-dashboard.html' : '/dashboard.html'
        }
      });
    }

    // Check contacts
    const { data: contact } = await supabase
      .from('contacts')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (contact && (contact.password === password || contact.temp_password === password)) {
      console.log('[Login] ✅ Client success');
      return res.status(200).json({
        success: true,
        data: {
          id: contact.id,
          name: contact.name || contact.company || email.split('@')[0],
          full_name: contact.name,
          email: contact.email,
          role: 'client',
          type: 'client',
          permissions: PERMISSIONS.client,
          redirectTo: '/client-dashboard.html'
        }
      });
    }

    return res.status(401).json({ success: false, error: 'Invalid email or password' });

  } catch (error) {
    console.error('[Login] ERROR:', error.message);
    console.error('[Login] Stack:', error.stack);
    return res.status(500).json({ success: false, error: error.message });
  }
};
