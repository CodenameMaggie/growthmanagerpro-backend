// /api/login.js - CORRECT ENV VARIABLES
const { createClient } = require('@supabase/supabase-js');

// Use the correct environment variable names
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    // Parse body
    let email, password;
    
    if (req.body && typeof req.body === 'object' && req.body.email) {
      email = req.body.email;
      password = req.body.password;
    } else if (typeof req.body === 'string') {
      const parsed = JSON.parse(req.body);
      email = parsed.email;
      password = parsed.password;
    }

    console.log('LOGIN ATTEMPT:', email || 'no email');

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password required' });
    }

    // Check users table
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (user && !userError && user.password === password) {
      const role = user.role || 'admin';
      const redirectTo = (role === 'advisor' || role === 'consultant') ? '/advisor-dashboard.html' : '/dashboard.html';

      console.log('LOGIN SUCCESS:', email);

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
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (contact && !contactError) {
      const clientPassword = contact.password || contact.temp_password;
      if (clientPassword === password) {
        console.log('CLIENT LOGIN SUCCESS:', email);

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

    console.log('LOGIN FAILED');
    return res.status(401).json({ success: false, error: 'Invalid email or password' });

  } catch (error) {
    console.error('LOGIN ERROR:', error);
    return res.status(500).json({ success: false, error: 'Server error: ' + error.message });
  }
};
