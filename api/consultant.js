const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Tenant-ID');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const tenantId = req.headers['x-tenant-id'] || req.query.tenant_id;

  if (!tenantId) {
    return res.status(400).json({
      success: false,
      error: 'tenant_id is required'
    });
  }

  try {
    switch (req.method) {
      case 'GET':
        return await handleGetConsultant(req, res, tenantId);
      case 'POST':
        return await handleInviteClient(req, res, tenantId);
      case 'PUT':
        return await handleUpdateConsultant(req, res, tenantId);
      case 'DELETE':
        return await handleDisconnectClient(req, res, tenantId);
      default:
        return res.status(405).json({
          success: false,
          error: 'Method not allowed'
        });
    }
  } catch (error) {
    console.error('[Consultant API] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
};

// GET - Fetch consultant profile with stats and clients
async function handleGetConsultant(req, res, tenantId) {
  const { consultant_id } = req.query;

  if (!consultant_id) {
    return res.status(400).json({
      success: false,
      error: 'consultant_id is required'
    });
  }

  console.log('[Consultant API] Fetching consultant:', consultant_id);

  // Get consultant profile
  const { data: consultant, error: consultantError } = await supabase
    .from('users')
    .select('*')
    .eq('id', consultant_id)
    .eq('tenant_id', tenantId)
    .eq('user_type', 'consultant')
    .single();

  if (consultantError || !consultant) {
    return res.status(404).json({
      success: false,
      error: 'Consultant not found'
    });
  }

  // Get all clients for this consultant
  const { data: clients, error: clientsError } = await supabase
    .from('users')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('user_type', 'client')
    .order('created_at', { ascending: false });

  if (clientsError) {
    console.error('[Consultant API] Error fetching clients:', clientsError);
  }

  const clientList = clients || [];

  // Get deals for revenue calculation
  const { data: deals, error: dealsError } = await supabase
    .from('deals')
    .select('*')
    .eq('tenant_id', tenantId);

  if (dealsError) {
    console.error('[Consultant API] Error fetching deals:', dealsError);
  }

  const dealsList = deals || [];

  // Calculate stats
  const totalClients = clientList.length;
  const clientLimit = getClientLimit(consultant.subscription_tier);
  const activeContracts = dealsList.filter(d => d.stage === 'won').length;
  const totalRevenue = dealsList
    .filter(d => d.stage === 'won')
    .reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);

  // Get recent activity (prospects)
  const { data: prospects, error: prospectsError } = await supabase
    .from('prospects')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: false })
    .limit(10);

  if (prospectsError) {
    console.error('[Consultant API] Error fetching prospects:', prospectsError);
  }

  const recentActivity = prospects || [];

  return res.status(200).json({
    success: true,
    consultant: {
      id: consultant.id,
      email: consultant.email,
      full_name: consultant.full_name,
      role: consultant.role,
      user_type: consultant.user_type,
      status: consultant.status,
      subscription_tier: consultant.subscription_tier,
      subscription_status: consultant.subscription_status,
      trial_ends_at: consultant.trial_ends_at,
      created_at: consultant.created_at
    },
    stats: {
      totalClients,
      clientLimit,
      activeContracts,
      totalRevenue,
      deliverables: 0 // Placeholder - implement when deliverables tracking exists
    },
    clients: clientList.map(c => ({
      id: c.id,
      email: c.email,
      full_name: c.full_name,
      status: c.status,
      created_at: c.created_at,
      last_login: c.last_login
    })),
    recentActivity: recentActivity.map(p => ({
      id: p.id,
      full_name: p.full_name,
      email: p.email,
      status: p.status,
      updated_at: p.updated_at
    }))
  });
}

// POST - Invite new client
async function handleInviteClient(req, res, tenantId) {
  const { consultant_id, client_email, client_name, message } = req.body;

  if (!consultant_id || !client_email) {
    return res.status(400).json({
      success: false,
      error: 'consultant_id and client_email are required'
    });
  }

  console.log('[Consultant API] Creating client invitation from:', consultant_id, 'to:', client_email);

  // Verify consultant exists and has capacity
  const { data: consultant, error: consultantError } = await supabase
    .from('users')
    .select('*')
    .eq('id', consultant_id)
    .eq('tenant_id', tenantId)
    .eq('user_type', 'consultant')
    .single();

  if (consultantError || !consultant) {
    return res.status(404).json({
      success: false,
      error: 'Consultant not found'
    });
  }

  // Check client count against tier limit
  const { count: clientCount } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('user_type', 'client');

  const clientLimit = getClientLimit(consultant.subscription_tier);
  
  if (clientCount >= clientLimit) {
    return res.status(400).json({
      success: false,
      error: `Client limit reached. Upgrade your plan to add more clients. Current limit: ${clientLimit}`
    });
  }

  // Check if invitation already exists
  const { data: existingInvitation } = await supabase
    .from('invitations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('email', client_email.toLowerCase().trim())
    .eq('status', 'pending')
    .single();

  if (existingInvitation) {
    return res.status(400).json({
      success: false,
      error: 'An invitation has already been sent to this email'
    });
  }

  // Check if user already exists
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('email', client_email.toLowerCase().trim())
    .single();

  if (existingUser) {
    return res.status(400).json({
      success: false,
      error: 'A user with this email already exists'
    });
  }

  // Generate invitation token
  const invitationToken = generateToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 day expiration

  // Create invitation
  const { data: invitation, error: invitationError } = await supabase
    .from('invitations')
    .insert([{
      tenant_id: tenantId,
      email: client_email.toLowerCase().trim(),
      full_name: client_name || null,
      role: 'client',
      user_type: 'client',
      invited_by: consultant_id,
      invitation_token: invitationToken,
      status: 'pending',
      message: message || null,
      expires_at: expiresAt.toISOString(),
      created_at: new Date().toISOString()
    }])
    .select()
    .single();

  if (invitationError) {
    console.error('[Consultant API] Error creating invitation:', invitationError);
    return res.status(500).json({
      success: false,
      error: 'Failed to create invitation'
    });
  }

  console.log('[Consultant API] ✅ Invitation created:', invitation.id);

  // TODO: Send invitation email via SendGrid/Resend
  // For now, just return the invitation link
  const invitationUrl = `${process.env.FRONTEND_URL || 'https://growthmanagerpro-frontend.vercel.app'}/accept-invitation.html?token=${invitationToken}`;

  return res.status(201).json({
    success: true,
    invitation: {
      id: invitation.id,
      email: invitation.email,
      full_name: invitation.full_name,
      status: invitation.status,
      expires_at: invitation.expires_at,
      invitation_url: invitationUrl
    },
    message: 'Client invitation created successfully'
  });
}

// PUT - Update consultant settings
async function handleUpdateConsultant(req, res, tenantId) {
  const { consultant_id, updates } = req.body;

  if (!consultant_id) {
    return res.status(400).json({
      success: false,
      error: 'consultant_id is required'
    });
  }

  console.log('[Consultant API] Updating consultant:', consultant_id);

  // Only allow updating specific fields
  const allowedFields = ['full_name', 'phone', 'bio', 'notification_preferences'];
  const filteredUpdates = {};
  
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      filteredUpdates[field] = updates[field];
    }
  }

  if (Object.keys(filteredUpdates).length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No valid fields to update'
    });
  }

  filteredUpdates.updated_at = new Date().toISOString();

  const { data: updatedConsultant, error: updateError } = await supabase
    .from('users')
    .update(filteredUpdates)
    .eq('id', consultant_id)
    .eq('tenant_id', tenantId)
    .eq('user_type', 'consultant')
    .select()
    .single();

  if (updateError) {
    console.error('[Consultant API] Error updating consultant:', updateError);
    return res.status(500).json({
      success: false,
      error: 'Failed to update consultant profile'
    });
  }

  return res.status(200).json({
    success: true,
    consultant: updatedConsultant,
    message: 'Consultant profile updated successfully'
  });
}

// DELETE - Disconnect client (soft delete/deactivate)
async function handleDisconnectClient(req, res, tenantId) {
  const { consultant_id, client_id } = req.body;

  if (!consultant_id || !client_id) {
    return res.status(400).json({
      success: false,
      error: 'consultant_id and client_id are required'
    });
  }

  console.log('[Consultant API] Disconnecting client:', client_id, 'from consultant:', consultant_id);

  // Verify consultant exists
  const { data: consultant } = await supabase
    .from('users')
    .select('id')
    .eq('id', consultant_id)
    .eq('tenant_id', tenantId)
    .eq('user_type', 'consultant')
    .single();

  if (!consultant) {
    return res.status(404).json({
      success: false,
      error: 'Consultant not found'
    });
  }

  // Update client status to inactive
  const { data: updatedClient, error: updateError } = await supabase
    .from('users')
    .update({
      status: 'inactive',
      updated_at: new Date().toISOString()
    })
    .eq('id', client_id)
    .eq('tenant_id', tenantId)
    .eq('user_type', 'client')
    .select()
    .single();

  if (updateError) {
    console.error('[Consultant API] Error disconnecting client:', updateError);
    return res.status(500).json({
      success: false,
      error: 'Failed to disconnect client'
    });
  }

  return res.status(200).json({
    success: true,
    message: 'Client disconnected successfully'
  });
}

// Helper: Get client limit based on subscription tier
function getClientLimit(tier) {
  const limits = {
    starter: 5,
    professional: 25,
    premium: 100
  };
  return limits[tier] || 5; // Default to starter limit
}

// Helper: Generate random token
function generateToken() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}
