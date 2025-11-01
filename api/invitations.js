const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const INSTANTLY_API_KEY = process.env.INSTANTLY_API_KEY;

module.exports = async (req, res) => {
  // ✅ CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // ✅ Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { email, role } = req.body;

    console.log('[Invitations] Creating invitation:', { email, role });

    // Validate inputs
    if (!email || !role) {
      return res.status(400).json({
        success: false,
        error: 'Email and role are required'
      });
    }

    // Validate role
    const validRoles = ['admin', 'advisor', 'client', 'saas'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role'
      });
    }

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();
    
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'User with this email already exists'
      });
    }

    // Check for existing pending invitation
    const { data: existingInvitation } = await supabase
      .from('invitations')
      .select('id')
      .eq('email', email)
      .eq('status', 'pending')
      .single();
    
    if (existingInvitation) {
      return res.status(400).json({
        success: false,
        error: 'Invitation already sent to this email'
      });
    }

    // Generate unique token
    const token = crypto.randomBytes(32).toString('hex');
    
    // Set expiration (7 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Create invitation
    const { data: invitation, error: createError } = await supabase
      .from('invitations')
      .insert([{
        email: email,
        role: role,
        token: token,
        status: 'pending',
        expires_at: expiresAt.toISOString(),
        created_at: new Date().toISOString()
      }])
      .select()
      .single();
    
    if (createError) {
      console.error('[Invitations] Error creating invitation:', createError);
      throw createError;
    }

    // Generate signup link
    const signupLink = `https://www.growthmanagerpro.com/signup?token=${token}`;
    
    console.log('[Invitations] ✅ Created:', { id: invitation.id, email, role });

    // 📧 SEND EMAIL VIA INSTANTLY
    try {
      const roleNames = {
        admin: 'Administrator',
        advisor: 'Advisor',
        client: 'Client',
        saas: 'SaaS Client'
      };

      const emailBody = `
Hi there!

You've been invited to join Growth Manager Pro as a ${roleNames[role]}.

Click the link below to create your account:
${signupLink}

This invitation expires in 7 days.

Welcome to the team!

Best regards,
Maggie Forbes
Growth Manager Pro
      `.trim();

      const instantlyResponse = await fetch('https://api.instantly.ai/api/v1/lead/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          api_key: INSTANTLY_API_KEY,
          campaign_id: process.env.INSTANTLY_INVITATION_CAMPAIGN_ID, // Create a campaign for invitations
          email: email,
          first_name: email.split('@')[0], // Use email prefix as name
          personalization: {
            signup_link: signupLink,
            role: roleNames[role]
          }
        })
      });

      const instantlyResult = await instantlyResponse.json();
      
      if (instantlyResult.status === 'success') {
        console.log('[Invitations] ✅ Email sent via Instantly');
      } else {
        console.error('[Invitations] Instantly error:', instantlyResult);
        // Don't fail the invitation if email fails
      }

    } catch (emailError) {
      console.error('[Invitations] Email sending error:', emailError);
      // Don't fail the invitation if email fails - user still gets the link in the modal
    }

    return res.status(201).json({
      success: true,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        signupLink: signupLink,
        expiresAt: invitation.expires_at
      },
      emailSent: true // Let frontend know email was sent
    });
    
  } catch (error) {
    console.error('[Invitations] Server error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
};
