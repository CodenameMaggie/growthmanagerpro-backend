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

async function storeSenderAssignment(contactEmail, senderEmail, tenantId) {
  try {
    const { error } = await supabase
      .from('contacts')
      .update({ assigned_sender_email: senderEmail })
      .eq('email', contactEmail)
      .eq('tenant_id', tenantId);

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

async function getStoredSender(contactEmail, tenantId) {
  try {
    const { data, error } = await supabase
      .from('contacts')
      .select('assigned_sender_email')
      .eq('email', contactEmail)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !data) return null;
    return data.assigned_sender_email;
  } catch (error) {
    return null;
  }
}

function getSenderPool(senderEmail) {
  for (const [poolName, poolData] of Object.entries(SENDER_POOLS)) {
    if (poolData.senders.includes(senderEmail)) {
      return poolName;
    }
  }
  return null;
}

function getCampaignForSender(stage, senderEmail) {
  const pool = getSenderPool(senderEmail);
  if (!pool) {
    console.error(`[Sender Tracker] Sender not in any pool: ${senderEmail}`);
    return null;
  }

  const campaignKey = `${stage}_campaign_id`;
  return SENDER_POOLS[pool][campaignKey];
}

async function getNextAvailablePool(tenantId) {
  try {
    const poolCounts = {};
    
    for (const poolName of ['A', 'B', 'C']) {
      const { count, error } = await supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .in('assigned_sender_email', SENDER_POOLS[poolName].senders)
        .eq('tenant_id', tenantId);
      
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

function getCampaignForPool(pool, stage) {
  const campaignKey = `${stage}_campaign_id`;
  return SENDER_POOLS[pool][campaignKey];
}

// ============================================
// OPERATION HANDLERS
// ============================================

/**
 * SYNC: Sync leads from Instantly to Supabase with cursor pagination
 */
async function handleSync(req, res) {
  try {
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

    // Fetch ALL leads using cursor-based pagination
    console.log('[Instantly Sync] Fetching leads with cursor pagination...');
    let allLeads = [];
    let startingAfter = null;
    const limit = 100;
    let hasMore = true;
    let pageCount = 0;

    while (hasMore && pageCount < 50) {
      pageCount++;
      console.log(`[Instantly Sync] Fetching page ${pageCount}...`);
      
      const body = { limit };
      if (startingAfter) {
        body.starting_after = startingAfter;
      }
      
      const leadsResponse = await fetch('https://api.instantly.ai/api/v2/leads/list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${instantlyApiKey}`
        },
        body: JSON.stringify(body)
      });

      if (!leadsResponse.ok) {
        const errorText = await leadsResponse.text();
        console.error('[Instantly Sync] API error:', leadsResponse.status, errorText);
        throw new Error(`Instantly API error: ${leadsResponse.status}`);
      }

      const leadsData = await leadsResponse.json();
      const batchLeads = leadsData.items || [];
      
      console.log(`[Instantly Sync] Page ${pageCount}: ${batchLeads.length} leads`);
      
      if (batchLeads.length === 0) {
        hasMore = false;
      } else {
        allLeads = allLeads.concat(batchLeads);
        
        if (leadsData.next_starting_after) {
          startingAfter = leadsData.next_starting_after;
        } else {
          hasMore = false;
        }
      }
    }

    const leads = allLeads;
    console.log(`[Instantly Sync] Total leads: ${leads.length} across ${pageCount} pages`);

    let syncedCount = 0;
    let errorCount = 0;
    const errors = [];

    for (const lead of leads) {
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

        const { data: existing } = await supabase
          .from('contacts')
          .select('id, tenant_id')
          .eq('email', lead.email)
          .maybeSingle();

        let result;

        if (existing && existing.tenant_id === tenant_id) {
          result = await supabase
            .from('contacts')
            .update(contactData)
            .eq('id', existing.id)
            .select();
        } else if (existing && existing.tenant_id !== tenant_id) {
          continue;
        } else {
          result = await supabase
            .from('contacts')
            .insert([{ ...contactData, tenant_id: tenant_id }])
            .select();
        }

        if (result.error) {
          console.error(`[Instantly Sync] Error: ${lead.email}`, result.error);
          errorCount++;
          errors.push({ email: lead.email, error: result.error.message });
        } else {
          syncedCount++;
        }

      } catch (err) {
        console.error(`[Instantly Sync] Exception: ${lead.email}`, err);
        errorCount++;
        errors.push({ email: lead.email, error: err.message });
      }
    }

    console.log(`[Instantly Sync] Complete: ${syncedCount} synced, ${errorCount} errors`);

    return res.status(200).json({
      success: true,
      data: {
        total_leads: leads.length,
        synced: syncedCount,
        errors: errorCount,
        pages_fetched: pageCount,
        error_details: errors.length > 0 ? errors.slice(0, 5) : []
      },
      message: `Successfully synced ${syncedCount} contacts from ${pageCount} pages`
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
 * SYNC-ENGAGEMENT: Sync engagement data from Instantly campaigns
 */
async function handleSyncEngagement(req, res) {
  try {
    const { tenant_id } = req.body;

    if (!tenant_id) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID required'
      });
    }

    console.log(`[Engagement Sync] Starting for tenant: ${tenant_id}`);

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
      console.log(`[Engagement Sync] Processing ${campaign.name}...`);

      try {
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
        
        console.log(`[Engagement Sync] ${leads.length} leads in ${campaign.name}`);

        for (const lead of leads) {
          try {
            const { data: contact } = await supabase
              .from('contacts')
              .select('id, email')
              .eq('email', lead.email)
              .eq('tenant_id', tenant_id)
              .single();

            if (!contact) continue;

            totalProcessed++;

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

              emails.forEach(email => {
                if (email.timestamp_sent) {
                  const sentDate = new Date(email.timestamp_sent);
                  if (!engagementData.last_email_sent || sentDate > new Date(engagementData.last_email_sent)) {
                    engagementData.last_email_sent = email.timestamp_sent;
                  }
                }

                if (email.timestamp_opened) {
                  engagementData.email_open_count++;
                  const openDate = new Date(email.timestamp_opened);
                  if (!engagementData.last_email_opened || openDate > new Date(engagementData.last_email_opened)) {
                    engagementData.last_email_opened = email.timestamp_opened;
                    engagementData.last_engagement_date = email.timestamp_opened;
                  }
                }

                if (email.timestamp_clicked) {
                  engagementData.email_click_count++;
                  const clickDate = new Date(email.timestamp_clicked);
                  if (!engagementData.last_email_clicked || clickDate > new Date(engagementData.last_email_clicked)) {
                    engagementData.last_email_clicked = email.timestamp_clicked;
                    engagementData.last_engagement_date = email.timestamp_clicked;
                  }
                }

                if (email.timestamp_replied) {
                  engagementData.has_replied = true;
                  const replyDate = new Date(email.timestamp_replied);
                  if (!engagementData.reply_date || replyDate > new Date(engagementData.reply_date)) {
                    engagementData.reply_date = email.timestamp_replied;
                    engagementData.last_engagement_date = email.timestamp_replied;
                  }
                }

                if (email.status) {
                  engagementData.email_status = email.status;
                }
              });
            }

            engagementData.current_campaign = campaign.name;
            engagementData.current_campaign_stage = campaign.stage;

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
              .eq('tenant_id', tenant_id);

            if (updateError) {
              console.error(`[Engagement Sync] Error updating ${lead.email}:`, updateError);
              errors.push({ email: lead.email, error: updateError.message });
            } else {
              totalUpdated++;
            }

          } catch (leadError) {
            console.error(`[Engagement Sync] Error processing lead:`, leadError);
            errors.push({ email: lead.email, error: leadError.message });
          }
        }

      } catch (campaignError) {
        console.error(`[Engagement Sync] Error with ${campaign.name}:`, campaignError);
        errors.push({ campaign: campaign.name, error: campaignError.message });
      }
    }

    console.log(`[Engagement Sync] Complete: ${totalUpdated}/${totalProcessed} updated`);

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

    if (!discovery_call_id || !tenant_id) {
      return res.status(400).json({
        success: false,
        error: 'discovery_call_id and tenant_id required'
      });
    }

    console.log(`[Discovery Invite] Processing: ${discovery_call_id}`);

    const { data: discoveryCall, error: fetchError } = await supabase
      .from('discovery_calls')
      .select('*, contacts(*), podcast_interviews(*)')
      .eq('id', discovery_call_id)
      .eq('tenant_id', tenant_id)
      .single();

    if (fetchError || !discoveryCall) {
      throw new Error('Discovery call not found');
    }

    if (discoveryCall.calendly_invite_sent) {
      return res.status(200).json({
        success: true,
        message: 'Email already sent',
        already_sent: true
      });
    }

    const contact = discoveryCall.contacts || {};
    const firstName = contact.name?.split(' ')[0] || 'there';
    const company = contact.company || 'your business';

    let senderEmail = null;
    let campaignId = null;

    senderEmail = await getStoredSender(contact.email, tenant_id);
    
    if (senderEmail) {
      campaignId = getCampaignForSender('discovery', senderEmail);
    } else {
      senderEmail = await getAssignedSender(contact.email);
      
      if (senderEmail) {
        await storeSenderAssignment(contact.email, senderEmail, tenant_id);
        campaignId = getCampaignForSender('discovery', senderEmail);
      } else {
        const pool = await getNextAvailablePool(tenant_id);
        const poolSenders = SENDER_POOLS[pool].senders;
        senderEmail = poolSenders[0];
        
        await storeSenderAssignment(contact.email, senderEmail, tenant_id);
        campaignId = getCampaignForPool(pool, 'discovery');
      }
    }

    if (!campaignId) {
      throw new Error(`Could not determine campaign ID for sender: ${senderEmail}`);
    }

    console.log('[Discovery Invite] Campaign:', campaignId, 'Sender:', senderEmail);

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

    await supabase
      .from('discovery_calls')
      .update({
        calendly_invite_sent: true,
        calendly_invite_sent_at: new Date().toISOString(),
        calendly_link: 'https://calendly.com/maggie-maggieforbesstrategies/discovery-call'
      })
      .eq('id', discovery_call_id)
      .eq('tenant_id', tenant_id);

    console.log('[Discovery Invite] ✅ Sent from:', senderEmail);

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
 * SEND-PODCAST: Send podcast invitation (SENDER-AWARE)
 */
async function handleSendPodcast(req, res) {
  try {
    const { callId, tenant_id } = req.body;

    if (!callId || !tenant_id) {
      return res.status(400).json({ 
        success: false,
        error: 'callId and tenant_id required' 
      });
    }

    console.log('[Podcast Invite] Processing:', callId);

    const { data: prequalCall, error: callError } = await supabase
      .from('pre_qualification_calls')
      .select('*')
      .eq('id', callId)
      .eq('tenant_id', tenant_id)
      .single();

    if (callError || !prequalCall) {
      return res.status(404).json({ 
        success: false,
        error: 'Pre-qualification call not found' 
      });
    }

    if (prequalCall.podcast_invitation_sent) {
      return res.status(400).json({ 
        success: false,
        error: 'Podcast invitation already sent',
        sent_at: prequalCall.podcast_invitation_sent_at
      });
    }

    if (!prequalCall.ai_score || prequalCall.ai_score < 35) {
      return res.status(400).json({ 
        success: false,
        error: 'Call not qualified for podcast invitation',
        current_score: prequalCall.ai_score,
        required_score: 35
      });
    }

    let senderEmail = null;
    let campaignId = null;

    senderEmail = await getStoredSender(prequalCall.guest_email, tenant_id);
    
    if (senderEmail) {
      campaignId = getCampaignForSender('podcast', senderEmail);
    } else {
      senderEmail = await getAssignedSender(prequalCall.guest_email);
      
      if (senderEmail) {
        await storeSenderAssignment(prequalCall.guest_email, senderEmail, tenant_id);
        campaignId = getCampaignForSender('podcast', senderEmail);
      } else {
        const pool = await getNextAvailablePool(tenant_id);
        const poolSenders = SENDER_POOLS[pool].senders;
        senderEmail = poolSenders[0];
        
        await storeSenderAssignment(prequalCall.guest_email, senderEmail, tenant_id);
        campaignId = getCampaignForPool(pool, 'podcast');
      }
    }

    if (!campaignId) {
      throw new Error(`Could not determine campaign ID for sender: ${senderEmail}`);
    }

    console.log('[Podcast Invite] Campaign:', campaignId, 'Sender:', senderEmail);

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
      throw new Error(`Instantly API failed: ${errorText}`);
    }

    await supabase
      .from('pre_qualification_calls')
      .update({ 
        podcast_invitation_sent: true,
        podcast_invitation_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', callId)
      .eq('tenant_id', tenant_id);

    if (prequalCall.contact_id) {
      await supabase
        .from('contacts')
        .update({ 
          status: 'podcast_scheduled',
          updated_at: new Date().toISOString()
        })
        .eq('id', prequalCall.contact_id)
        .eq('tenant_id', tenant_id);
    }

    console.log('[Podcast Invite] ✅ Sent from:', senderEmail);

    return res.status(200).json({
      success: true,
      message: `Podcast invitation sent to ${prequalCall.guest_name}`,
      guest_name: prequalCall.guest_name,
      guest_email: prequalCall.guest_email,
      score: prequalCall.ai_score,
      sender: senderEmail,
      campaign_id: campaignId,
      sent_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Podcast Invite] Error:', error);
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

    if (!strategy_call_id || !tenant_id) {
      return res.status(400).json({
        success: false,
        error: 'strategy_call_id and tenant_id required'
      });
    }

    console.log(`[Strategy Invite] Processing: ${strategy_call_id}`);

    const { data: strategyCall, error: fetchError } = await supabase
      .from('strategy_calls')
      .select('*, contacts(*)')
      .eq('id', strategy_call_id)
      .eq('tenant_id', tenant_id)
      .single();

    if (fetchError || !strategyCall) {
      throw new Error('strategy call not found');
    }

    if (strategyCall.calendly_invite_sent) {
      return res.status(200).json({
        success: true,
        message: 'Email already sent',
        already_sent: true
      });
    }

    const contact = strategyCall.contacts || {};
    const firstName = contact.name?.split(' ')[0] || contact_name?.split(' ')[0] || 'there';
    const companyName = contact.company || company || 'your business';

    let senderEmail = null;
    let campaignId = null;

    senderEmail = await getStoredSender(contact.email, tenant_id);
    
    if (senderEmail) {
      campaignId = getCampaignForSender('strategy', senderEmail);
    } else {
      senderEmail = await getAssignedSender(contact.email);
      
      if (senderEmail) {
        await storeSenderAssignment(contact.email, senderEmail, tenant_id);
        campaignId = getCampaignForSender('strategy', senderEmail);
      } else {
        const pool = await getNextAvailablePool(tenant_id);
        const poolSenders = SENDER_POOLS[pool].senders;
        senderEmail = poolSenders[0];
        
        await storeSenderAssignment(contact.email, senderEmail, tenant_id);
        campaignId = getCampaignForPool(pool, 'strategy');
      }
    }

    if (!campaignId) {
      throw new Error(`Could not determine campaign ID for sender: ${senderEmail}`);
    }

    console.log('[Strategy Invite] Campaign:', campaignId, 'Sender:', senderEmail);

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

    await supabase
      .from('strategy_calls')
      .update({
        calendly_invite_sent: true,
        calendly_invite_sent_at: new Date().toISOString(),
        calendly_link: 'https://calendly.com/maggie-maggieforbesstrategies/strategy-call'
      })
      .eq('id', strategy_call_id)
      .eq('tenant_id', tenant_id);

    console.log('[Strategy Invite] ✅ Sent from:', senderEmail);

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

  if (req.method === 'GET') {
    return res.status(200).json({ 
      status: 'ok', 
      message: 'Instantly Manager endpoint is running',
      actions: ['sync', 'sync-engagement', 'send-podcast', 'send-discovery', 'send-strategy'],
      timestamp: new Date().toISOString()
    });
  }

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

module.exports.getAssignedSender = getAssignedSender;
module.exports.storeSenderAssignment = storeSenderAssignment;
module.exports.getStoredSender = getStoredSender;
module.exports.getSenderPool = getSenderPool;
module.exports.getCampaignForSender = getCampaignForSender;
module.exports.getNextAvailablePool = getNextAvailablePool;
module.exports.getCampaignForPool = getCampaignForPool;
module.exports.SENDER_POOLS = SENDER_POOLS;
