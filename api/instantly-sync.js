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
      console.log('[Instantly Sync] Starting sync from Instantly.ai API V2...');

      // Check if API key exists
      if (!instantlyApiKey) {
        throw new Error('INSTANTLY_API_KEY not configured');
      }

      // Fetch leads using Instantly API V2
      // API V2 uses Bearer token authentication and POST method
      const leadsUrl = 'https://api.instantly.ai/api/v2/leads/list';
      
      console.log('[Instantly Sync] Fetching leads from API V2...');
      const leadsResponse = await fetch(leadsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${instantlyApiKey}`
        },
        body: JSON.stringify({
          limit: 200 // Fetch up to 1000 leads
        })
      });

      if (!leadsResponse.ok) {
        const errorText = await leadsResponse.text();
        console.error('[Instantly Sync] API V2 error:', leadsResponse.status, errorText);
        throw new Error(`Instantly API error: ${leadsResponse.status} - ${errorText}`);
      }

      const leadsData = await leadsResponse.json();
      console.log('[Instantly Sync] Leads received:', JSON.stringify(leadsData).substring(0, 200));

      // Extract leads array from response
      const leads = leadsData.data || [];
      console.log('[Instantly Sync] Total leads collected:', leads.length);

      let syncedCount = 0;
      let errorCount = 0;
      const errors = [];

      for (const lead of leads) {
        try {
          // Map Instantly V2 fields to our Supabase contacts structure
          const contactData = {
            email: lead.email,
            name: lead.first_name && lead.last_name 
              ? `${lead.first_name} ${lead.last_name}`.trim()
              : lead.first_name || lead.last_name || lead.email.split('@')[0],
            company: lead.company_name || lead.company || null,
            phone: lead.phone || null,
            status: lead.interest_status || 'new',
            source: 'instantly',
            instantly_campaign: lead.campaign_name || null,
            notes: lead.variables ? JSON.stringify(lead.variables) : null,
            last_contact_date: lead.last_replied_at || lead.timestamp_updated || new Date().toISOString()
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
          error_details: errors.length > 0 ? errors.slice(0, 5) : []
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
