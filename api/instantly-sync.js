const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const instantlyApiKey = process.env.INSTANTLY_API_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST' || req.method === 'GET') {
    try {
      console.log('[Instantly Sync] Starting sync from Instantly.ai...');

      // Check if API key exists
      if (!instantlyApiKey) {
        throw new Error('INSTANTLY_API_KEY not configured');
      }

      // Fetch leads from Instantly.ai
      // Instantly API endpoint: https://api.instantly.ai/api/v1/lead/list
      const instantlyResponse = await fetch('https://api.instantly.ai/api/v1/lead/list', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${instantlyApiKey}`
        }
      });

      if (!instantlyResponse.ok) {
        throw new Error(`Instantly API error: ${instantlyResponse.status}`);
      }

      const instantlyData = await instantlyResponse.json();
      console.log('[Instantly Sync] Received leads from Instantly:', instantlyData.length || 0);

      // Map Instantly leads to our contacts format
      const leads = Array.isArray(instantlyData) ? instantlyData : [];
      
      let syncedCount = 0;
      let errorCount = 0;
      const errors = [];

      for (const lead of leads) {
        try {
          // Map Instantly fields to our Supabase contacts structure
          const contactData = {
            email: lead.email,
            name: lead.first_name && lead.last_name 
              ? `${lead.first_name} ${lead.last_name}`.trim()
              : lead.first_name || lead.last_name || lead.email.split('@')[0],
            company: lead.company_name || lead.company || null,
            phone: lead.phone || null,
            status: lead.status || 'new',
            source: 'instantly',
            instantly_campaign: lead.campaign_name || null,
            notes: lead.custom_variables ? JSON.stringify(lead.custom_variables) : null,
            last_contact_date: lead.last_replied_at || lead.updated_at || new Date().toISOString()
          };

          // Upsert (insert or update if exists) based on email
          const { data, error } = await supabase
            .from('contacts')
            .upsert(contactData, {
              onConflict: 'email',
              ignoreDuplicates: false
            })
            .select();

          if (error) {
            console.error('[Instantly Sync] Error syncing lead:', lead.email, error);
            errorCount++;
            errors.push({ email: lead.email, error: error.message });
          } else {
            syncedCount++;
          }
        } catch (err) {
          console.error('[Instantly Sync] Error processing lead:', err);
          errorCount++;
          errors.push({ email: lead.email, error: err.message });
        }
      }

      console.log(`[Instantly Sync] Completed: ${syncedCount} synced, ${errorCount} errors`);

      return res.status(200).json({
        success: true,
        data: {
          total_leads: leads.length,
          synced: syncedCount,
          errors: errorCount,
          error_details: errors.length > 0 ? errors.slice(0, 5) : [] // Return first 5 errors only
        },
        message: `Successfully synced ${syncedCount} contacts from Instantly.ai`
      });

    } catch (error) {
      console.error('[Instantly Sync] Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message,
        message: 'Failed to sync contacts from Instantly.ai'
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
