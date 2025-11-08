const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

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
    const { token, full_name, password } = req.body;

    console.log('[Signup Invited] Processing signup with token');

    // Validate required fields
    if (!token || !full_name || !password) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: token, full_name, and password are required'
      });
    }

    // Validate password length
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters'
      });
    }

    // Find the invitation
    const { data: invitation, error: invError } = await supabase
      .from('invitations')
      .select('*')
      .eq('token', token)
      .eq('status', 'pending')
      .single();

    if (invError || !invitation) {
      console.log('[Signup Invited] Invalid or expired token');
      return res.status(404).json({
        success: false,
        error: 'Invalid or expired invitation token'
      });
    }

    // Check if expired
    const expiresAt = new Date(invitation.expires_at);
    const now = new Date();
    
    if (expiresAt < now) {
      console.log('[Signup Invited] Invitation expired');
      return res.status(400).json({
        success: false,
        error: 'This invitation has expired'
      });
    }

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', invitation.email)
      .single();

    if (existingUser) {
      console.log('[Signup Invited] User already exists');
      return res.status(400).json({
        success: false,
        error: 'A user with this email already exists'
      });
    }

    console.log('[Signup Invited] Creating user account');

    // Create user - ONLY fields that exist in the database
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert([{
        email: invitation.email,
        full_name: full_name,
        password: password, // Plain text to match login.js
        role: invitation.role,
        status: invitation.role === 'advisor' ? 'pending' : 'active',
        user_type: invitation.role,
        tenant_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', // Default tenant
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (createError) {
      console.error('[Signup Invited] Error creating user:', createError);
      return res.status(500).json({
        success: false,
        error: 'Failed to create user account'
      });
    }

    console.log('[Signup Invited] User created successfully:', newUser.id);

    // Mark invitation as accepted
    await supabase
      .from('invitations')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString()
      })
      .eq('id', invitation.id);

    console.log('[Signup Invited] Invitation marked as accepted');

    // Determine redirect and type based on role
let redirectTo, userType, permissions;

if (newUser.role === 'admin' || newUser.role === 'saas') {
  redirectTo = '/dashboard.html';
  userType = 'admin';
  permissions = 'all';
} else if (newUser.role === 'advisor' || newUser.role === 'consultant') {
  redirectTo = '/advisor-dashboard.html';
  userType = 'advisor';
  permissions = ['advisor-dashboard.view'];
} else if (newUser.role === 'client') {
  redirectTo = '/client-dashboard.html';
  userType = 'client';
  permissions = ['client-dashboard.view'];
} else {
  redirectTo = '/dashboard.html';
  userType = 'admin';
  permissions = 'all';
}

// Return success
return res.status(201).json({
  success: true,
  user: {
    id: newUser.id,
    email: newUser.email,
    full_name: newUser.full_name,
    role: newUser.role,
    type: userType,
    permissions: permissions,
    redirectTo: redirectTo,
    status: newUser.status
  },
  token: 'demo-token-' + newUser.id,
  message: newUser.status === 'pending' 
    ? 'Application submitted. You will receive an email once approved.' 
    : 'Account created successfully!'
});

  } catch (error) {
    console.error('[Signup Invited] Server error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
};
