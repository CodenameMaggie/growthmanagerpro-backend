const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }

  try {
    const { advisorId } = req.query;

    if (!advisorId) {
      return res.status(400).json({
        success: false,
        error: 'Advisor ID is required'
      });
    }

    console.log('[Get Advisor Clients] Fetching clients for advisor:', advisorId);

    // Query the advisor_client_relationships table
    // Join with users table to get client details
    const { data: relationships, error } = await supabase
      .from('advisor_client_relationships')
      .select(`
        id,
        client_id,
        relationship_type,
        permission_level,
        status,
        created_at,
        users!advisor_client_relationships_client_id_fkey (
          id,
          email,
          full_name,
          role,
          status,
          company_name,
          created_at
        )
      `)
      .eq('advisor_id', advisorId)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Get Advisor Clients] Error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch clients'
      });
    }

    // Transform the data to flatten the structure
    const clients = (relationships || []).map(rel => ({
      id: rel.users?.id || rel.client_id,
      email: rel.users?.email || '',
      full_name: rel.users?.full_name || 'Unknown',
      role: rel.users?.role || 'client',
      status: rel.users?.status || 'active',
      company_name: rel.users?.company_name || null,
      relationship_id: rel.id,
      relationship_type: rel.relationship_type,
      permission_level: rel.permission_level,
      connected_at: rel.created_at,
      user_created_at: rel.users?.created_at
    }));

    console.log('[Get Advisor Clients] Found', clients.length, 'clients');

    return res.status(200).json({
      success: true,
      clients: clients,
      count: clients.length
    });

  } catch (error) {
    console.error('[Get Advisor Clients] Server error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
};
