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

    // Get all clients where advisor_id matches
    const { data: clients, error } = await supabase
      .from('users')
      .select('id, email, full_name, status, role, created_at')
      .eq('advisor_id', advisorId)
      .eq('role', 'client')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Get Advisor Clients] Error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch clients'
      });
    }

    console.log('[Get Advisor Clients] Found', clients?.length || 0, 'clients');

    return res.status(200).json({
      success: true,
      clients: clients || [],
      count: clients?.length || 0
    });

  } catch (error) {
    console.error('[Get Advisor Clients] Server error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
};
