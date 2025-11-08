const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const instantlyApiKey = process.env.INSTANTLY_API_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function handleSync(req, res) {
  try {
    const { tenant_id } = req.body;

    if (!tenant_id) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID required'
      });
    }

    console.log(`[DEBUG] Starting sync for tenant: ${tenant_id}`);

    if (!instantlyApiKey) {
      throw new Error('INSTANTLY_API_KEY not configured');
    }

    // Fetch ALL leads from Instantly
    console.log('[DEBUG] Fetching from Instantly API...');
    const leadsResponse = await fetch('https://api.instantly.ai/api/v2/leads/list', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${instantlyApiKey}`
      },
      body: JSON.stringify({
        limit: 100
      })
    });

    if (!leadsResponse.ok) {
      const errorText = await leadsResponse.text();
      console.error('[DEBUG] Instantly API error:', leadsResponse.status, errorText);
      throw new Error(`Instantly API error: ${leadsResponse.status}`);
    }

    const leadsData = await leadsResponse.json();
    console.log('[DEBUG] Instantly response:', JSON.stringify(leadsData).substring(0, 500));
    
    const leads = leadsData.items || [];
    console.log(`[DEBUG] Got ${leads.length} leads from Instantly`);

    if (leads.length === 0) {
      return res.status(200).json({
        success: true,
        data: { total_leads: 0, synced: 0, errors: 0 },
        message: 'No leads returned from Instantly API'
      });
    }

    // Log first lead structure
    console.log('[DEBUG] First lead structure:', JSON.stringify(leads[0], null, 2));

    let syncedCount = 0;
    let errorCount = 0;
    const errors = [];

    // Sync each lead
    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      console.log(`[DEBUG] Processing lead ${i+1}/${leads.length}: ${lead.email}`);

      try {
        const contactData = {
          email: lead.email,
          name: lead.first_name && lead.last_name 
            ? `${lead.first_name} ${lead.last_name}`.trim()
            : lead.first_name || lead.last_name || lead.email.split('@')[0],
          company: lead.company_name || lead.company || null,
          phone: lead.phone || null,
          status: lead.interest_status || lead.status || 'new',
          source: 'instantly',
          notes: lead.variables ? JSON.stringify(lead.variables) : null,
          last_contact_date: lead.last_replied_at || lead.timestamp_updated || new Date().toISOString()
        };

        console.log(`[DEBUG] Contact data prepared:`, contactData);

        // Try to find existing
        const { data: existing, error: findError } = await supabase
          .from('contacts')
          .select('id, tenant_id')
          .eq('email', lead.email)
          .maybeSingle();

        if (findError) {
          console.error(`[DEBUG] Find error:`, findError);
          throw findError;
        }

        console.log(`[DEBUG] Existing record:`, existing);

        let result;

        if (existing && existing.tenant_id === tenant_id) {
          // Update our tenant's contact
          console.log(`[DEBUG] Updating existing contact for our tenant`);
          result = await supabase
            .from('contacts')
            .update(contactData)
            .eq('id', existing.id)
            .select();
        } else if (existing && existing.tenant_id !== tenant_id) {
          // Email exists but belongs to different tenant - SKIP
          console.log(`[DEBUG] Email belongs to different tenant - SKIPPING`);
          continue;
        } else {
          // New contact - insert with tenant_id
          console.log(`[DEBUG] Inserting new contact`);
          result = await supabase
            .from('contacts')
            .insert([{ ...contactData, tenant_id: tenant_id }])
            .select();
        }

        console.log(`[DEBUG] Supabase result:`, result);

        if (result.error) {
          console.error(`[DEBUG] Supabase error:`, result.error);
          errorCount++;
          errors.push({ email: lead.email, error: result.error.message });
        } else {
          console.log(`[DEBUG] ✅ Successfully synced: ${lead.email}`);
          syncedCount++;
        }

      } catch (err) {
        console.error(`[DEBUG] Exception for ${lead.email}:`, err);
        errorCount++;
        errors.push({ email: lead.email, error: err.message });
      }
    }

    console.log(`[DEBUG] Sync complete: ${syncedCount} synced, ${errorCount} errors`);

    return res.status(200).json({
      success: true,
      data: {
        total_leads: leads.length,
        synced: syncedCount,
        errors: errorCount,
        error_details: errors.slice(0, 10)
      }
    });

  } catch (error) {
    console.error('[DEBUG] Fatal error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({ 
      status: 'ok',
      message: 'Instantly Manager DEBUG version'
    });
  }

  if (req.method === 'POST') {
    const { action } = req.body;
    
    if (action === 'sync') {
      return handleSync(req, res);
    }
    
    return res.status(400).json({
      success: false,
      error: 'Only sync action available in DEBUG version'
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
