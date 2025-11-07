// /api/login.js - FINAL WORKING VERSION
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

// Helper to parse request body - WORKS ON VERCEL
const parseBody = async (req) => {
  return new Promise((resolve) => {
    if (req.body) {
      // Body already parsed
      if (typeof req.body === 'string') {
        resolve(JSON.parse(req.body));
      } else {
        resolve(req.body);
      }
    } else {
      // Read from stream
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve({});
        }
      });
    }
  });
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const body = await parseBody(req);
    const email = body.email;
    const password = body.password;

    console.log('[Login] Request received for:', email || 'NO EMAIL');

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password required' });
    }

    // Check users table
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (user && user.password === password) {
      const role = user.role || 'admin';
      const redirectTo = (role === 'advisor' || role === 'consultant') 
        ? '/advisor-dashboard.html' 
        : '/dashboard.html';

      console.log('[Login] ✅ Success:', email);

      return res.status(200).json({
        success: true,
        data: {
          id: user.id,
          name: user.full_name || user.name || email.split('@')[0],
          full_name: user.full_name || user.name,
          email: user.email,
          company_name: user.company_name,
          business_name: user.business_name,
          role: role,
          type: role === 'advisor' ? 'advisor' : 'admin',
          permissions: 'all',
          redirectTo: redirectTo
        }
      });
    }

    // Check contacts
    const { data: contact } = await supabase
      .from('contacts')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (contact) {
      const pwd = contact.password || contact.temp_password;
      if (pwd === password) {
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
            permissions: 'basic',
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
