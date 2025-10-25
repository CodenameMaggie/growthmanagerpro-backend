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

      // Fetch campaigns first to get leads from each campaign
      // Instantly API typically uses api_key as query parameter
      const campaignsUrl = `https://api.instantly.ai/api/v1/campaign/list?api_key=${instantlyApiKey}`;
      
      console.log('[Instantly Sync] Fetching campaigns...');
      const campaignsResponse = await fetch(campaignsUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!campaignsResponse.ok) {
        const errorText = await campaignsResponse.text();
        console.error('[Instantly Sync] Campaigns API error:', campaignsResponse.status, errorText);
        throw new Error(`Instantly API error: ${campaignsResponse.status} - ${errorText}`);
      }

      const campaignsData = await campaignsResponse.json();
      console.log('[Instantly Sync] Campaigns received:', JSON.stringify(campaignsData).substring(0, 200));

      // Get all leads across all campaigns
      let allLeads = [];
      
      // If we got campaigns, fetch leads from each
      if (campaignsData && Array.isArray(campaignsData)) {
        for (const campaign of campaignsData) {
          try {
            const leadsUrl = `https://api.instantly.ai/api/v1/campaign/get/leads?api_key=${instantlyApiKey}&campaign_id=${campaign.id}`;
            const leadsResponse = await fetch(leadsUrl);
            
            if (leadsResponse.ok) {
              const leadsData = await leadsResponse.json();
              if (Array.isArray(leadsData)) {
                allLeads = allLeads.concat(leadsData.map(lead => ({
                  ...lead,
                  campaign_name: campaign.name
                })));
              }
            }
          } catch (err) {
            console.error('[Instantly Sync] Error fetching leads for campaign:', campaign.id, err);
          }
        }
      }

      console.log('[Instantly Sync] Total leads collected:', allLeads.length);

      let syncedCount = 0;
      let errorCount = 0;
      const errors = [];

      for (const lead of allLeads) {
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
          total_leads: allLeads.length,
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
