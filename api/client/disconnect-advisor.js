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
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    console.log('[Client Disconnect] Client disconnecting from advisor:', userId);

    // Verify user is a client
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('id, role, advisor_id, email')
      .eq('id', userId)
      .single();

    if (fetchError || !user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (user.role !== 'client') {
      return res.status(403).json({
        success: false,
        error: 'Only clients can disconnect from advisors'
      });
    }

    if (!user.advisor_id) {
      return res.status(400).json({
        success: false,
        error: 'You are not connected to any advisor'
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
      .eq('id', userId);

    if (updateError) {
      console.error('[Client Disconnect] Error:', updateError);
      return res.status(500).json({
        success: false,
        error: 'Failed to disconnect from advisor'
      });
    }

    console.log('[Client Disconnect] Successfully disconnected');

    return res.status(200).json({
      success: true,
      message: 'Disconnected from advisor successfully'
    });

  } catch (error) {
    console.error('[Client Disconnect] Server error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
};
