const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ==================== POST - Sync calendars (Calendly & Zoom) ====================
  if (req.method === 'POST') {
    try {
      console.log('[Availability Sync] Syncing with Calendly and Zoom...');

      // Get current availability settings
      const { data: settings, error: fetchError } = await supabase
        .from('availability')
        .select('*')
        .limit(1)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError;
      }

      // 🔄 FUTURE: Implement Calendly API sync
      // This would:
      // 1. Connect to Calendly API with OAuth token
      // 2. Update Calendly event types with working hours
      // 3. Sync availability windows

      // 🔄 FUTURE: Implement Zoom API sync
      // This would:
      // 1. Connect to Zoom API with OAuth token
      // 2. Create/update recurring meeting links
      // 3. Sync meeting settings

      // For now, just update the last_synced_at timestamp
      if (settings) {
        const { error: updateError } = await supabase
          .from('availability')
          .update({
            last_synced_at: new Date().toISOString(),
            calendly_connected: false,  // Set to true when implemented
            zoom_connected: false        // Set to true when implemented
          })
          .eq('id', settings.id);

        if (updateError) throw updateError;
      }

      return res.status(200).json({
        success: true,
        message: 'Sync initiated. Calendar integration coming soon!',
        sync: {
          calendly: {
            status: 'pending',
            message: 'Calendly integration coming soon'
          },
          zoom: {
            status: 'pending',
            message: 'Zoom integration coming soon'
          },
          lastSyncedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('[Availability Sync] Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  return res.status(405).json({ 
    success: false,
    error: 'Method not allowed. Use POST to sync calendars.' 
  });
};
