const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const instantlyApiKey = process.env.INSTANTLY_API_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================
// SENDER POOL CONFIGURATION
// ============================================
const SENDER_POOLS = {
  A: {
    senders: [
      'maggie@askmaggieforbes.com',
      'maggie@gomaggieforbes.com',
      'maggie@searchmaggieforbes.com',
      'maggie.forbes@askmaggieforbes.com',
      'maggie.forbes@gomaggieforbes.com',
      'maggieforbes@askmaggieforbes.com',
      'maggieforbes@gomaggieforbes.com',
      'maggieforbes@searchmaggieforbes.com',
      'm.forbes@brightmaggieforbesstrategies.com',
      'maggie@brightmaggieforbesstrategies.com'
    ],
    podcast_campaign_id: process.env.INSTANTLY_PODCAST_CAMPAIGN_ID,
    discovery_campaign_id: process.env.INSTANTLY_DISCOVERY_CAMPAIGN_ID,
    strategy_campaign_id: process.env.INSTANTLY_STRATEGY_CAMPAIGN_ID
  },
  B: {
    senders: [
      'm.forbes@coolmaggieforbesstrategies.com',
      'm.forbes@easymaggieforbesstrategies.com',
      'm.forbes@geniusmaggieforbesstrategies.com',
      'm.forbes@scalemaggieforbesstrategies.com',
      'm.forbes@webmaggieforbesstrategies.com',
      'maggie.forbes@coolmaggieforbesstrategies.com',
      'maggie.forbes@easymaggieforbesstrategies.com',
      'maggie.forbes@geniusmaggieforbesstrategies.com',
      'maggie.forbes@scalemaggieforbesstrategies.com',
      'maggie.forbes@webmaggieforbesstrategies.com'
    ],
    podcast_campaign_id: process.env.INSTANTLY_PODCAST_CAMPAIGN_ID,
    discovery_campaign_id: process.env.INSTANTLY_DISCOVERY_CAMPAIGN_ID,
    strategy_campaign_id: process.env.INSTANTLY_STRATEGY_CAMPAIGN_ID
  },
  C: {
    senders: [
      'maggie@coolmaggieforbesstrategies.com',
      'maggie@easymaggieforbesstrategies.com',
      'maggie@geniusmaggieforbesstrategies.com',
      'maggie@scalemaggieforbesstrategies.com',
      'maggie@webmaggieforbesstrategies.com',
      'maggieforbes@searchmaggieforbes.com',
      'maggie.forbes@brightmaggieforbesstrategies.com',
      'maggie.forbes@webmaggieforbesstrategies.com',
      'm.forbes@easymaggieforbesstrategies.com',
      'm.forbes@geniusmaggieforbesstrategies.com'
    ],
    podcast_campaign_id: process.env.INSTANTLY_PODCAST_CAMPAIGN_ID,
    discovery_campaign_id: process.env.INSTANTLY_DISCOVERY_CAMPAIGN_ID,
    strategy_campaign_id: process.env.INSTANTLY_STRATEGY_CAMPAIGN_ID
  }
};

// ============================================
// SENDER TRACKING HELPER FUNCTIONS
// ============================================

/**
 * Get which sender email was assigned to a lead
 */
async function getAssignedSender(leadEmail) {
  try {
    console.log(`[Sender Tracker] Checking assigned sender for: ${leadEmail}`);
    
    const response = await fetch(
      `https://api.instantly.ai/api/v2/emails?lead=${leadEmail}&limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${instantlyApiKey}`
        }
      }
    );

    if (!response.ok) {
      console.error('[Sender Tracker] Instantly API error:', response.status);
      return null;
    }

    const data = await response.json();
    
    if (data.items && data.items.length > 0) {
      const senderEmail = data.items[0].eaccount;
      console.log(`[Sender Tracker] Found sender: ${senderEmail}`);
      return senderEmail;
    }

    return null;
  } catch (error) {
    console.error('[Sender Tracker] Error getting assigned sender:', error);
    return null;
  }
}

/**
 * Store sender assignment in database
 */
async function storeSenderAssignment(contactEmail, senderEmail, tenantId) {
  try {
    const { error } = await supabase
      .from('contacts')
      .update({ assigned_sender_email: senderEmail })
      .eq('email', contactEmail)
      .eq('tenant_id', tenantId);  // ← ADDED: Verify tenant ownership

    if (error) {
      console.error('[Sender Tracker] Error storing sender:', error);
      return false;
    }

    console.log(`[Sender Tracker] ✅ Stored: ${contactEmail} → ${senderEmail}`);
    return true;
  } catch (error) {
    console.error('[Sender Tracker] Error in storeSenderAssignment:', error);
    return false;
  }
}

/**
 * Get stored sender from database
 */
async function getStoredSender(contactEmail, tenantId) {
  try {
    const { data, error } = await supabase
      .from('contacts')
      .select('assigned_sender_email')
      .eq('email', contactEmail)
      .eq('tenant_id', tenantId)  // ← ADDED: Verify tenant ownership
      .single();

    if (error || !data) return null;
    return data.assigned_sender_email;
  } catch (error) {
    return null;
  }
}

/**
 * Determine which pool a sender belongs to
 */
function getSenderPool(senderEmail) {
  for (const [poolName, poolData] of Object.entries(SENDER_POOLS)) {
    if (poolData.senders.includes(senderEmail)) {
      return poolName;
    }
  }
  return null;
}

/**
 * Get campaign ID for a stage and sender
 */
function getCampaignForSender(stage, senderEmail) {
  const pool = getSenderPool(senderEmail);
  if (!pool) {
    console.error(`[Sender Tracker] Sender not in any pool: ${senderEmail}`);
    return null;
  }

  const campaignKey = `${stage}_campaign_id`;
  return SENDER_POOLS[pool][campaignKey];
}

/**
 * Get next available pool (round-robin)
 */
async function getNextAvailablePool(tenantId) {
  try {
    const poolCounts = {};
    
    for (const poolName of ['A', 'B', 'C']) {
      const { count, error } = await supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .in('assigned_sender_email', SENDER_POOLS[poolName].senders)
        .eq('tenant_id', tenantId);  // ← ADDED: Filter by tenant
      
      poolCounts[poolName] = error ? 999 : (count || 0);
    }
    
    const leastUsedPool = Object.entries(poolCounts)
      .sort(([,a], [,b]) => a - b)[0][0];
    
    console.log(`[Sender Tracker] Pool distribution:`, poolCounts);
    console.log(`[Sender Tracker] Assigning to Pool ${leastUsedPool}`);
    
    return leastUsedPool;
  } catch (error) {
    console.error('[Sender Tracker] Error in getNextAvailablePool:', error);
    return 'A';
  }
}

/**
 * Get campaign ID for a pool
 */
function getCampaignForPool(pool, stage) {
  const campaignKey = `${stage}_campaign_id`;
  return SENDER_POOLS[pool][campaignKey];
}

// ============================================
// OPERATION HANDLERS
// ============================================

/**
 * SYNC: Sync leads from Instantly to Supabase
 */
async function handleSync(req, res) {
  try {
    // Extract tenant_id from request body
    const { tenant_id } = req.body;

    if (!tenant_id) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID required'
      });
    }

    console.log(`[Instantly Sync] Starting sync for tenant: ${tenant_id}`);

    if (!instantlyApiKey) {
      throw new Error('INSTANTLY_API_KEY not configured');
    }

    const leadsUrl = 'https://api.instantly.ai/api/v2/leads/list';
    
    console.log('[Instantly Sync] Fetching leads from ALL campaigns...');
    const leadsResponse = await fetch(leadsUrl, {
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
      console.error('[Instantly Sync] API V2 error:', leadsResponse.status, errorText);
      throw new Error(`Instantly API error: ${leadsResponse.status} - ${errorText}`);
    }

    const leadsData = await leadsResponse.json();
    let allLeads = leadsData.items || [];
    let leads = allLeads; // No filter - sync everything
    
    console.log('[Instantly Sync] Total leads to sync:', leads.length);

    let syncedCount = 0;
    let errorCount = 0;
    const errors = [];

    for (const lead of leads) {
      try {
        const contactData = {
          tenant_id: tenant_id,
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

        // Check if contact exists for this tenant
        const { data: existing } = await supabase
          .from('contacts')
          .select('id')
          .eq('email', lead.email)
          .eq('tenant_id', tenant_id)
          .single();

        let data, error;
        
        if (existing) {
          // Update existing contact
          const result = await supabase
            .from('contacts')
            .update(contactData)
            .eq('id', existing.id)
            .select();
          data = result.data;
          error = result.error;
        } else {
          // Insert new contact
          const result = await supabase
            .from('contacts')
            .insert([contactData])
            .select();
          data = result.data;
          error = result.error;
        }

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
        filtered_from: allLeads.length,
        error_details: errors.length > 0 ? errors.slice(0, 5) : []
      },
      message: `Successfully synced ${syncedCount} contacts with positive replies`
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

/**
 * SYNC-ENGAGEMENT: Sync engagement data from Instantly for Growth Manager Pro campaigns ONLY
 */
async function handleSyncEngagement(req, res) {
  try {
    // Extract tenant_id from request body
    const { tenant_id } = req.body;

    if (!tenant_id) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID required'
      });
    }

    console.log(`[Engagement Sync] Starting sync for tenant: ${tenant_id}`);

    // Only sync these 3 campaigns (Growth Manager Pro campaigns)
    const campaignsToSync = [
      { 
        id: process.env.INSTANTLY_PODCAST_CAMPAIGN_ID, 
        name: 'Podcast',
        stage: 'podcast'
      },
      { 
        id: process.env.INSTANTLY_DISCOVERY_CAMPAIGN_ID, 
        name: 'Discovery',
        stage: 'discovery'
      },
      { 
        id: process.env.INSTANTLY_STRATEGY_CAMPAIGN_ID, 
        name: 'Strategy',
        stage: 'strategy'
      }
    ];

    let totalProcessed = 0;
    let totalUpdated = 0;
    const errors = [];

    for (const campaign of campaignsToSync) {
      console.log(`[Engagement Sync] Processing ${campaign.name} campaign...`);

      try {
        // Get all leads from this campaign using Instantly API v2
        const leadsResponse = await fetch(`https://api.instantly.ai/api/v2/leads/list`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${instantlyApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            campaign: campaign.id,
            limit: 100
          })
        });

        if (!leadsResponse.ok) {
          throw new Error(`Campaign ${campaign.name} API error: ${leadsResponse.status}`);
        }

        const leadsData = await leadsResponse.json();
        const leads = leadsData.items || [];
        
        console.log(`[Engagement Sync] Found ${leads.length} leads in ${campaign.name} campaign`);

        // Process each lead
        for (const lead of leads) {
          try {
            // Check if contact exists in our database FOR THIS TENANT
            const { data: contact } = await supabase
              .from('contacts')
              .select('id, email')
              .eq('email', lead.email)
              .eq('tenant_id', tenant_id)  // ← ADDED: Filter by tenant
              .single();

            if (!contact) {
              // Skip leads not in our Growth Manager Pro database for this tenant
              continue;
            }

            totalProcessed++;

            // Get detailed engagement data for this lead
            const emailStatsResponse = await fetch(
              `https://api.instantly.ai/api/v2/emails?lead=${lead.email}&limit=10`,
              {
                headers: {
                  'Authorization': `Bearer ${instantlyApiKey}`
                }
              }
            );

            let engagementData = {
              last_email_sent: null,
              last_email_opened: null,
              last_email_clicked: null,
              email_open_count: 0,
              email_click_count: 0,
              has_replied: false,
              reply_date: null,
              email_status: 'sent',
              sequence_step: null,
              last_engagement_date: null
            };

            if (emailStatsResponse.ok) {
              const emailStats = await emailStatsResponse.json();
              const emails = emailStats.items || [];

              // Analyze email engagement
              emails.forEach(email => {
                // Track sends
                if (email.timestamp_sent) {
                  const sentDate = new Date(email.timestamp_sent);
                  if (!engagementData.last_email_sent || sentDate > new Date(engagementData.last_email_sent)) {
                    engagementData.last_email_sent = email.timestamp_sent;
                  }
                }

                // Track opens
                if (email.timestamp_opened) {
                  engagementData.email_open_count++;
                  const openDate = new Date(email.timestamp_opened);
                  if (!engagementData.last_email_opened || openDate > new Date(engagementData.last_email_opened)) {
                    engagementData.last_email_opened = email.timestamp_opened;
                    engagementData.last_engagement_date = email.timestamp_opened;
                  }
                }

                // Track clicks
                if (email.timestamp_clicked) {
                  engagementData.email_click_count++;
                  const clickDate = new Date(email.timestamp_clicked);
                  if (!engagementData.last_email_clicked || clickDate > new Date(engagementData.last_email_clicked)) {
                    engagementData.last_email_clicked = email.timestamp_clicked;
                    engagementData.last_engagement_date = email.timestamp_clicked;
                  }
                }

                // Track replies
                if (email.timestamp_replied) {
                  engagementData.has_replied = true;
                  const replyDate = new Date(email.timestamp_replied);
                  if (!engagementData.reply_date || replyDate > new Date(engagementData.reply_date)) {
                    engagementData.reply_date = email.timestamp_replied;
                    engagementData.last_engagement_date = email.timestamp_replied;
                  }
                }

                // Track status
                if (email.status) {
                  engagementData.email_status = email.status;
                }
              });
            }

            // Add campaign info
            engagementData.current_campaign = campaign.name;
            engagementData.current_campaign_stage = campaign.stage;

            // Update contact in database
            const { error: updateError } = await supabase
              .from('contacts')
              .update({
                last_email_sent: engagementData.last_email_sent,
                last_email_opened: engagementData.last_email_opened,
                last_email_clicked: engagementData.last_email_clicked,
                email_open_count: engagementData.email_open_count,
                email_click_count: engagementData.email_click_count,
                has_replied: engagementData.has_replied,
                reply_date: engagementData.reply_date,
                email_status: engagementData.email_status,
                last_engagement_date: engagementData.last_engagement_date,
                current_campaign: engagementData.current_campaign,
                engagement_synced_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              })
              .eq('id', contact.id)
              .eq('tenant_id', tenant_id);  // ← ADDED: Verify tenant ownership

            if (updateError) {
              console.error(`[Engagement Sync] Error updating ${lead.email}:`, updateError);
              errors.push({ email: lead.email, error: updateError.message });
            } else {
              totalUpdated++;
              console.log(`[Engagement Sync] ✅ Updated ${lead.email}`);
            }

          } catch (leadError) {
            console.error(`[Engagement Sync] Error processing lead:`, leadError);
            errors.push({ email: lead.email, error: leadError.message });
          }
        }

      } catch (campaignError) {
        console.error(`[Engagement Sync] Error with ${campaign.name} campaign:`, campaignError);
        errors.push({ campaign: campaign.name, error: campaignError.message });
      }
    }

    console.log(`[Engagement Sync] Complete: ${totalUpdated}/${totalProcessed} contacts updated`);

    return res.status(200).json({
      success: true,
      message: `Engagement data synced for ${totalUpdated} contacts`,
      data: {
        campaigns_synced: campaignsToSync.length,
        contacts_processed: totalProcessed,
        contacts_updated: totalUpdated,
        errors: errors.length,
        error_details: errors.slice(0, 5)
      }
    });

  } catch (error) {
    console.error('[Engagement Sync] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * SEND-DISCOVERY: Send discovery call invitation (SENDER-AWARE)
 */
async function handleSendDiscovery(req, res) {
  try {
    const { discovery_call_id, tenant_id } = req.body;

    if (!discovery_call_id) {
      return res.status(400).json({
        success: false,
        error: 'discovery_call_id is required'
      });
    }

    if (!tenant_id) {
      return res.status(400).json({
        success: false,
        error: 'tenant_id is required'
      });
    }

    console.log(`[Discovery Invite] Processing for discovery call: ${discovery_call_id}`);

    // Get discovery call details
    const { data: discoveryCall, error: fetchError } = await supabase
      .from('discovery_calls')
      .select('*, contacts(*), podcast_interviews(*)')
      .eq('id', discovery_call_id)
      .eq('tenant_id', tenant_id)  // ← ADDED: Verify tenant ownership
      .single();

    if (fetchError || !discoveryCall) {
      throw new Error('Discovery call not found');
    }

    // Check if email already sent
    if (discoveryCall.calendly_invite_sent) {
      console.log('[Discovery Invite] Email already sent');
      return res.status(200).json({
        success: true,
        message: 'Email already sent',
        already_sent: true
      });
    }

    const contact = discoveryCall.contacts || {};
    const firstName = contact.name?.split(' ')[0] || 'there';
    const company = contact.company || 'your business';

    // SENDER TRACKING LOGIC
    console.log('[Discovery Invite] Determining sender for:', contact.email);
    
    let senderEmail = null;
    let campaignId = null;

    // Step 1: Check if sender is already stored in database
    senderEmail = await getStoredSender(contact.email, tenant_id);
    
    if (senderEmail) {
      console.log('[Discovery Invite] Found stored sender:', senderEmail);
      campaignId = getCampaignForSender('discovery', senderEmail);
    } else {
      // Step 2: Check Instantly API for which sender contacted them
      senderEmail = await getAssignedSender(contact.email);
      
      if (senderEmail) {
        console.log('[Discovery Invite] Found sender from Instantly:', senderEmail);
        await storeSenderAssignment(contact.email, senderEmail, tenant_id);
        campaignId = getCampaignForSender('discovery', senderEmail);
      } else {
        // Step 3: Assign new sender using round-robin
        console.log('[Discovery Invite] No sender found, assigning new one...');
        const pool = await getNextAvailablePool(tenant_id);
        const poolSenders = SENDER_POOLS[pool].senders;
        senderEmail = poolSenders[0];
        
        console.log('[Discovery Invite] Assigned to Pool', pool, 'sender:', senderEmail);
        await storeSenderAssignment(contact.email, senderEmail, tenant_id);
        campaignId = getCampaignForPool(pool, 'discovery');
      }
    }

    if (!campaignId) {
      throw new Error(`Could not determine campaign ID for sender: ${senderEmail}`);
    }

    console.log('[Discovery Invite] Using campaign:', campaignId);
    console.log('[Discovery Invite] Using sender:', senderEmail);

    // SEND VIA INSTANTLY V2 API
    const instantlyResponse = await fetch('https://api.instantly.ai/api/v2/leads', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${instantlyApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: contact.email,
        campaign: campaignId,
        eaccount: senderEmail,
        first_name: firstName,
        company_name: company
      })
    });

    if (!instantlyResponse.ok) {
      const errorData = await instantlyResponse.text();
      throw new Error(`Instantly API error: ${instantlyResponse.status} - ${errorData}`);
    }

    const instantlyResult = await instantlyResponse.json();
    console.log('[Discovery Invite] Instantly response:', instantlyResult);

    // Update discovery call record
    await supabase
      .from('discovery_calls')
      .update({
        calendly_invite_sent: true,
        calendly_invite_sent_at: new Date().toISOString(),
        calendly_link: 'https://calendly.com/maggie-maggieforbesstrategies/discovery-call'
      })
      .eq('id', discovery_call_id)
      .eq('tenant_id', tenant_id);  // ← ADDED: Verify tenant ownership

    console.log('[Discovery Invite] ✅ Email sent successfully from sender:', senderEmail);

    return res.status(200).json({
      success: true,
      message: 'Discovery call invitation sent',
      email: contact.email,
      sender: senderEmail,
      campaign_id: campaignId
    });

  } catch (error) {
    console.error('[Discovery Invite] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * SEND-PODCAST: Send podcast invitation to pre-qualified leads (SENDER-AWARE)
 */
async function handleSendPodcast(req, res) {
  try {
    const { callId, tenant_id } = req.body;

    if (!callId) {
      return res.status(400).json({ 
        success: false,
        error: 'callId is required' 
      });
    }

    if (!tenant_id) {
      return res.status(400).json({
        success: false,
        error: 'tenant_id is required'
      });
    }

    console.log('[Podcast Invite] Sending invitation for call:', callId);

    // Get the pre-qual call record
    const { data: prequalCall, error: callError } = await supabase
      .from('pre_qualification_calls')
      .select('*')
      .eq('id', callId)
      .eq('tenant_id', tenant_id)  // ← ADDED: Verify tenant ownership
      .single();

    if (callError || !prequalCall) {
      return res.status(404).json({ 
        success: false,
        error: 'Pre-qualification call not found' 
      });
    }

    // Check if already sent
    if (prequalCall.podcast_invitation_sent) {
      return res.status(400).json({ 
        success: false,
        error: 'Podcast invitation already sent',
        sent_at: prequalCall.podcast_invitation_sent_at
      });
    }

    // Check if qualified (score >= 35)
    if (!prequalCall.ai_score || prequalCall.ai_score < 35) {
      return res.status(400).json({ 
        success: false,
        error: 'Call not qualified for podcast invitation',
        current_score: prequalCall.ai_score,
        required_score: 35
      });
    }

    console.log('[Podcast Invite] ✅ Qualified! Score:', prequalCall.ai_score);

    // SENDER TRACKING LOGIC
    console.log('[Podcast Invite] Determining sender for:', prequalCall.guest_email);
    
    let senderEmail = null;
    let campaignId = null;

    // Check if sender is already stored
    senderEmail = await getStoredSender(prequalCall.guest_email, tenant_id);
    
    if (senderEmail) {
      console.log('[Podcast Invite] Found stored sender:', senderEmail);
      campaignId = getCampaignForSender('podcast', senderEmail);
    } else {
      // Check Instantly API
      senderEmail = await getAssignedSender(prequalCall.guest_email);
      
      if (senderEmail) {
        console.log('[Podcast Invite] Found sender from Instantly:', senderEmail);
        await storeSenderAssignment(prequalCall.guest_email, senderEmail, tenant_id);
        campaignId = getCampaignForSender('podcast', senderEmail);
      } else {
        // Assign new sender using round-robin
        console.log('[Podcast Invite] No sender found, assigning new one...');
        const pool = await getNextAvailablePool(tenant_id);
        const poolSenders = SENDER_POOLS[pool].senders;
        senderEmail = poolSenders[0];
        
        console.log('[Podcast Invite] Assigned to Pool', pool, 'sender:', senderEmail);
        await storeSenderAssignment(prequalCall.guest_email, senderEmail, tenant_id);
        campaignId = getCampaignForPool(pool, 'podcast');
      }
    }

    if (!campaignId) {
      throw new Error(`Could not determine campaign ID for sender: ${senderEmail}`);
    }

    console.log('[Podcast Invite] Using campaign:', campaignId);
    console.log('[Podcast Invite] Using sender:', senderEmail);
    console.log('[Podcast Invite] Sending email to:', prequalCall.guest_email);

    // SEND VIA INSTANTLY V2 API
    const instantlyResponse = await fetch('https://api.instantly.ai/api/v2/leads', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${instantlyApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: prequalCall.guest_email,
        campaign: campaignId,
        eaccount: senderEmail,
        first_name: prequalCall.guest_name?.split(' ')[0] || '',
        last_name: prequalCall.guest_name?.split(' ').slice(1).join(' ') || ''
      })
    });

    if (!instantlyResponse.ok) {
      const errorText = await instantlyResponse.text();
      console.error('[Podcast Invite] ❌ Instantly API error:', errorText);
      throw new Error(`Instantly API failed: ${errorText}`);
    }

    const instantlyResult = await instantlyResponse.json();
    console.log('[Podcast Invite] Instantly response:', instantlyResult);

    // Mark as sent in database
    const { error: updateError } = await supabase
      .from('pre_qualification_calls')
      .update({ 
        podcast_invitation_sent: true,
        podcast_invitation_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', callId)
      .eq('tenant_id', tenant_id);  // ← ADDED: Verify tenant ownership

    if (updateError) {
      console.error('[Podcast Invite] ⚠️ Error updating database:', updateError);
    }

    // Update contact status
    if (prequalCall.contact_id) {
      await supabase
        .from('contacts')
        .update({ 
          status: 'podcast_scheduled',
          updated_at: new Date().toISOString()
        })
        .eq('id', prequalCall.contact_id)
        .eq('tenant_id', tenant_id);  // ← ADDED: Verify tenant ownership
    }

    console.log('[Podcast Invite] ✅ Email sent successfully from sender:', senderEmail);

    return res.status(200).json({
      success: true,
      message: `✅ Podcast invitation sent to ${prequalCall.guest_name}`,
      guest_name: prequalCall.guest_name,
      guest_email: prequalCall.guest_email,
      score: prequalCall.ai_score,
      sender: senderEmail,
      campaign_id: campaignId,
      sent_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Podcast Invite] ❌ Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to send podcast invitation',
      details: error.message
    });
  }
}

/**
 * SEND-STRATEGY: Send strategy call invitation (SENDER-AWARE)
 */
async function handleSendStrategy(req, res) {
  try {
    const { strategy_call_id, contact_name, company, recommended_tier, systems, tenant_id } = req.body;

    if (!strategy_call_id) {
      return res.status(400).json({
        success: false,
        error: 'strategy_call_id is required'
      });
    }

    if (!tenant_id) {
      return res.status(400).json({
        success: false,
        error: 'tenant_id is required'
      });
    }

    console.log(`[Strategy Invite] Processing strategy call invitation`);

    // Get strategy call details
    const { data: strategyCall, error: fetchError } = await supabase
      .from('strategy_calls')
      .select('*, contacts(*)')
      .eq('id', strategy_call_id)
      .eq('tenant_id', tenant_id)  // ← ADDED: Verify tenant ownership
      .single();

    if (fetchError || !strategyCall) {
      throw new Error('strategy call not found');
    }

    // Check if email already sent
    if (strategyCall.calendly_invite_sent) {
      console.log('[Strategy Invite] Email already sent');
      return res.status(200).json({
        success: true,
        message: 'Email already sent',
        already_sent: true
      });
    }

    const contact = strategyCall.contacts || {};
    const firstName = contact.name?.split(' ')[0] || contact_name?.split(' ')[0] || 'there';
    const companyName = contact.company || company || 'your business';
    const tier = recommended_tier || strategyCall.recommended_tier || 'Growth Architecture';

    // SENDER TRACKING LOGIC
    console.log('[Strategy Invite] Determining sender for:', contact.email);
    
    let senderEmail = null;
    let campaignId = null;

    // Use same sender that contacted them before
    senderEmail = await getStoredSender(contact.email, tenant_id);
    
    if (senderEmail) {
      console.log('[Strategy Invite] Found stored sender:', senderEmail);
      campaignId = getCampaignForSender('strategy', senderEmail);
    } else {
      senderEmail = await getAssignedSender(contact.email);
      
      if (senderEmail) {
        console.log('[Strategy Invite] Found sender from Instantly:', senderEmail);
        await storeSenderAssignment(contact.email, senderEmail, tenant_id);
        campaignId = getCampaignForSender('strategy', senderEmail);
      } else {
        const pool = await getNextAvailablePool(tenant_id);
        const poolSenders = SENDER_POOLS[pool].senders;
        senderEmail = poolSenders[0];
        
        console.log('[Strategy Invite] Assigned to Pool', pool, 'sender:', senderEmail);
        await storeSenderAssignment(contact.email, senderEmail, tenant_id);
        campaignId = getCampaignForPool(pool, 'strategy');
      }
    }

    if (!campaignId) {
      throw new Error(`Could not determine campaign ID for sender: ${senderEmail}`);
    }

    console.log('[Strategy Invite] Using campaign:', campaignId);
    console.log('[Strategy Invite] Using sender:', senderEmail);

    // SEND VIA INSTANTLY V2 API
    const instantlyResponse = await fetch('https://api.instantly.ai/api/v2/leads', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${instantlyApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: contact.email,
        campaign: campaignId,
        eaccount: senderEmail,
        first_name: firstName,
        company_name: companyName
      })
    });

    if (!instantlyResponse.ok) {
      const errorData = await instantlyResponse.text();
      throw new Error(`Instantly API error: ${instantlyResponse.status} - ${errorData}`);
    }

    const instantlyResult = await instantlyResponse.json();
    console.log('[Strategy Invite] Instantly response:', instantlyResult);

    // Update strategy call record
    await supabase
      .from('strategy_calls')
      .update({
        calendly_invite_sent: true,
        calendly_invite_sent_at: new Date().toISOString(),
        calendly_link: 'https://calendly.com/maggie-maggieforbesstrategies/strategy-call'
      })
      .eq('id', strategy_call_id)
      .eq('tenant_id', tenant_id);  // ← ADDED: Verify tenant ownership

    console.log('[Strategy Invite] ✅ Email sent successfully from sender:', senderEmail);

    return res.status(200).json({
      success: true,
      message: 'Strategy call invitation sent',
      email: contact.email,
      sender: senderEmail,
      campaign_id: campaignId
    });

  } catch (error) {
    console.error('[Strategy Invite] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// ============================================
// MAIN ENDPOINT HANDLER
// ============================================

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET - Status check
  if (req.method === 'GET') {
    return res.status(200).json({ 
      status: 'ok', 
      message: 'Instantly Manager endpoint is running',
      actions: ['sync', 'sync-engagement', 'send-podcast', 'send-discovery', 'send-strategy'],
      timestamp: new Date().toISOString()
    });
  }

  // POST - Route to appropriate handler based on action
  if (req.method === 'POST') {
    const { action } = req.body;

    switch (action) {
      case 'sync':
        return handleSync(req, res);
      
      case 'sync-engagement':
        return handleSyncEngagement(req, res);
      
      case 'send-podcast':
        return handleSendPodcast(req, res);
      
      case 'send-discovery':
        return handleSendDiscovery(req, res);
      
      case 'send-strategy':
        return handleSendStrategy(req, res);
      
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid action',
          message: 'Action must be one of: sync, sync-engagement, send-podcast, send-discovery, send-strategy'
        });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

// Export helper functions for use in other files
module.exports.getAssignedSender = getAssignedSender;
module.exports.storeSenderAssignment = storeSenderAssignment;
module.exports.getStoredSender = getStoredSender;
module.exports.getSenderPool = getSenderPool;
module.exports.getCampaignForSender = getCampaignForSender;
module.exports.getNextAvailablePool = getNextAvailablePool;
module.exports.getCampaignForPool = getCampaignForPool;
module.exports.SENDER_POOLS = SENDER_POOLS;
