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
    const { email, role, invited_by } = req.body; // ✅ Accept invited_by

    // Validate required fields
    if (!email || !role) {
      return res.status(400).json({
        success: false,
        error: 'Email and role are required'
      });
    }

    // Validate email format
    if (!email.includes('@')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    // Validate role
    const validRoles = ['admin', 'advisor', 'client', 'saas'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role. Must be one of: admin, advisor, client, saas'
      });
    }

    console.log('[Invitations] Creating invitation for:', email, 'as', role);

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'A user with this email already exists'
      });
    }

    // Check if there's already a pending invitation
    const { data: existingInvitation } = await supabase
      .from('invitations')
      .select('id, status')
      .eq('email', email)
      .eq('status', 'pending')
      .single();

    if (existingInvitation) {
      return res.status(400).json({
        success: false,
        error: 'There is already a pending invitation for this email'
      });
    }

    // Generate unique token
    const token = require('crypto').randomBytes(32).toString('hex');

    // Calculate expiration date (7 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Create invitation with invited_by field
    const { data: invitation, error } = await supabase
      .from('invitations')
      .insert([{
        email: email,
        role: role,
        token: token,
        status: 'pending',
        invited_by: invited_by || null, // ✅ Store who invited this user
        expires_at: expiresAt.toISOString(),
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      console.error('[Invitations] Error creating invitation:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to create invitation'
      });
    }

    console.log('[Invitations] Invitation created successfully:', invitation.id);

    // Generate signup link
    const signupLink = `https://www.growthmanagerpro.com/accept-invitation`;

    return res.status(201).json({
      success: true,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        token: invitation.token,
        invited_by: invitation.invited_by, // ✅ Include in response
        signupLink: signupLink,
        expiresAt: invitation.expires_at
      },
      message: 'Invitation created successfully'
    });

  } catch (error) {
    console.error('[Invitations] Server error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
};
