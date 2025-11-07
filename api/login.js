// /api/login.js - BULLETPROOF VERSION
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PERMISSIONS = {
  admin: 'all',
  advisor: ['calls.view', 'deals.view', 'pipeline.view', 'campaigns.view'],
  client: ['calls.view', 'deals.view', 'pipeline.view'],
  saas: 'all'
};

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    // DEFENSIVE BODY PARSING - Try everything
    let email, password;

    // Try 1: req.body is already an object
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      email = req.body.email;
      password = req.body.password;
    }
    // Try 2: req.body is a string
    else if (typeof req.body === 'string') {
      const parsed = JSON.parse(req.body);
      email = parsed.email;
      password = parsed.password;
    }
    // Try 3: Read from stream
    else {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const bodyString = Buffer.concat(chunks).toString();
      const parsed = JSON.parse(bodyString);
      email = parsed.email;
      password = parsed.password;
    }

    console.log('[Login] Email:', email ? '✓' : '✗', 'Password:', password ? '✓' : '✗');

    // Validate
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email and password required' 
      });
    }

    // Check users table
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (user) {
      if (user.password !== password) {
        return res.status(401).json({ success: false, error: 'Invalid credentials' });
      }

      const role = user.role || 'admin';
      const redirectTo = (role === 'advisor' || role === 'consultant') 
        ? '/advisor-dashboard.html' 
        : '/dashboard.html';

      console.log('[Login] ✅ User logged in:', email);

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
          permissions: PERMISSIONS[role] || PERMISSIONS.admin,
          redirectTo: redirectTo
        }
      });
    }

    // Check contacts table
    const { data: contact } = await supabase
      .from('contacts')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (!contact) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const clientPassword = contact.password || contact.temp_password;
    if (!clientPassword || clientPassword !== password) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    console.log('[Login] ✅ Client logged in:', email);

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

  } catch (error) {
    console.error('[Login] ERROR:', error.message);
    return res.status(500).json({ 
      success: false, 
      error: 'Server error: ' + error.message 
    });
  }
};
