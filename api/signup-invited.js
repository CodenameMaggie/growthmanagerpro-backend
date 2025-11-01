const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

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
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { 
      token,           // For invited users
      email,           // For direct signups
      full_name, 
      password,
      company,
      phone,
      role,            // For direct signups
      hasAdvisor,      // For client self-signup
      advisorEmail,    // For client self-signup
      permissionLevel  // For client self-signup
    } = req.body;

    console.log('[Signup] Processing:', { 
      hasToken: !!token, 
      email: email || 'from token',
      role: role || 'from token'
    });

    let finalEmail, finalRole, invitationId;

    // ==================== FLOW 1: INVITED USER (has token) ====================
    if (token) {
      console.log('[Signup] Token-based signup');
      
      // Validate invitation token
      const { data: invitation, error: invError } = await supabase
        .from('invitations')
        .select('*')
        .eq('token', token)
        .eq('status', 'pending')
        .single();
      
      if (invError || !invitation) {
        return res.status(404).json({
          success: false,
          error: 'Invalid or expired invitation'
        });
      }

      // Check if expired
      if (new Date(invitation.expires_at) < new Date()) {
        return res.status(400).json({
          success: false,
          error: 'Invitation has expired'
        });
      }

      finalEmail = invitation.email;
      finalRole = invitation.role;
      invitationId = invitation.id;
      
      console.log('[Signup] Valid invitation:', { email: finalEmail, role: finalRole });
    }
    // ==================== FLOW 2: DIRECT SIGNUP (no token) ====================
    else {
      console.log('[Signup] Direct signup');
      
      if (!email || !role) {
        return res.status(400).json({
          success: false,
          error: 'Email and role are required for direct signup'
        });
      }

      finalEmail = email;
      finalRole = role;
    }

    // ==================== VALIDATE REQUIRED FIELDS ====================
    if (!full_name || !password) {
      return res.status(400).json({
        success: false,
        error: 'Full name and password are required'
      });
    }

    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters'
      });
    }

    // ==================== CHECK IF USER ALREADY EXISTS ====================
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', finalEmail)
      .single();
    
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'User with this email already exists'
      });
    }

    // ==================== HASH PASSWORD ====================
    const hashedPassword = await bcrypt.hash(password, 10);

    // ==================== CREATE USER ====================
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert([{
        email: finalEmail,
        full_name: full_name,
        password: hashedPassword,
        role: finalRole,
        company: company || null,
        phone: phone || null,
        status: finalRole === 'advisor' ? 'pending' : 'active' // Advisors need approval
      }])
      .select()
      .single();
    
    if (createError) {
      console.error('[Signup] Error creating user:', createError);
      throw createError;
    }

    console.log('[Signup] User created:', { id: newUser.id, email: newUser.email, role: newUser.role });

    // ==================== MARK INVITATION AS ACCEPTED ====================
    if (invitationId) {
      await supabase
        .from('invitations')
        .update({ 
          status: 'accepted', 
          accepted_at: new Date().toISOString() 
        })
        .eq('id', invitationId);
      
      console.log('[Signup] Invitation marked as accepted');
    }

    // ==================== HANDLE ADVISOR CONNECTION (for clients) ====================
    let connectionMessage = '';
    if (finalRole === 'client' && hasAdvisor && advisorEmail) {
      try {
        console.log('[Signup] Processing advisor connection...');
        
        const connectionResponse = await fetch(
          `${process.env.API_BASE_URL || 'https://growthmanagerpro-backend.vercel.app'}/api/connection-request`, 
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              inviterEmail: finalEmail,
              inviterType: 'client',
              inviteeEmail: advisorEmail,
              inviteeType: 'advisor',
              permissionLevel: permissionLevel || 'collaborative',
              inviterName: full_name
            })
          }
        );

        const connectionData = await connectionResponse.json();
        
        if (connectionData.success) {
          connectionMessage = connectionData.status === 'auto_connected' 
            ? 'Connected with your advisor!' 
            : 'Connection request sent to your advisor!';
          console.log('[Signup] Connection status:', connectionData.status);
        }
      } catch (connectionError) {
        console.error('[Signup] Connection error:', connectionError);
        connectionMessage = 'Note: Could not connect advisor at this time.';
      }
    }

    // ==================== RETURN SUCCESS ====================
    return res.status(201).json({
      success: true,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.full_name,
        role: newUser.role,
        status: newUser.status
      },
      token: 'demo-token-' + newUser.id, // Replace with real JWT in production
      connectionMessage: connectionMessage || undefined,
      message: newUser.status === 'pending' 
        ? 'Application submitted. You will receive an email once approved.' 
        : 'Account created successfully'
    });
    
  } catch (error) {
    console.error('[Signup] Server error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
};
