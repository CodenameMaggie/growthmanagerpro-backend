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
    const { advisorId, clientId } = req.body;

    // Validate required fields
    if (!advisorId || !clientId) {
      return res.status(400).json({
        success: false,
        error: 'Advisor ID and Client ID are required'
      });
    }

    console.log('[Disconnect Client] Disconnecting client:', clientId, 'from advisor:', advisorId);

    // Verify the client is actually connected to this advisor
    const { data: client, error: fetchError } = await supabase
      .from('users')
      .select('id, advisor_id, email, full_name')
      .eq('id', clientId)
      .single();

    if (fetchError || !client) {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }

    if (client.advisor_id !== advisorId) {
      return res.status(403).json({
        success: false,
        error: 'This client is not connected to you'
      });
    }

    // Disconnect by setting advisor_id to NULL
    // Client keeps their account, subscription, and portal access
    const { error: updateError } = await supabase
      .from('users')
      .update({
        advisor_id: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', clientId);

    if (updateError) {
      console.error('[Disconnect Client] Error:', updateError);
      return res.status(500).json({
        success: false,
        error: 'Failed to disconnect client'
      });
    }

    console.log('[Disconnect Client] Successfully disconnected');

    return res.status(200).json({
      success: true,
      message: 'Client disconnected successfully',
      client: {
        id: client.id,
        email: client.email,
        full_name: client.full_name
      }
    });

  } catch (error) {
    console.error('[Disconnect Client] Server error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
};
