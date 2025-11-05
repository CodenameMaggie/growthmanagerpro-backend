import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { contactId, trigger, campaignType, preQualScore, inviteEmail, inviteRole, signupLink } = req.body;

  try {
    console.log('[Smartlead Handoff] Starting for contact:', contactId);
    console.log('[Smartlead Handoff] Trigger:', trigger);
    console.log('[Smartlead Handoff] Campaign Type:', campaignType);
    console.log('[Smartlead Handoff] Pre-qual Score:', preQualScore);

    // Determine which campaign ID to use
    let campaignId;
    let campaignName;
    let newStage;
    let newStatus;

    if (campaignType === 'podcast' || trigger === 'pre_qual_qualified') {
      campaignId = process.env.SMARTLEAD_PODCAST_CAMPAIGN_ID;
      campaignName = 'Podcast Invitation';
      newStage = 'podcast_invited';
      newStatus = 'Podcast Invitation Sent';
    } else if (campaignType === 'discovery' || trigger === 'podcast_completed') {
      campaignId = process.env.SMARTLEAD_DISCOVERY_CAMPAIGN_ID;
      campaignName = 'Discovery Call Invitation';
      newStage = 'discovery_invited';
      newStatus = 'Discovery Invitation Sent';
    } else if (campaignType === 'strategy' || trigger === 'discovery_qualified') {
      campaignId = process.env.SMARTLEAD_STRATEGY_CAMPAIGN_ID;
      campaignName = 'Strategy Call Invitation';
      newStage = 'strategy_invited';
      newStatus = 'Strategy Invitation Sent';
    } else if (campaignType === 'platform_invite' || trigger === 'user_invitation') {
      campaignId = process.env.SMARTLEAD_INVITATIONS_CAMPAIGN_ID;
      campaignName = 'Platform Invitation';
      // For platform invites, we don't update contacts table
    } else {
      throw new Error(`Unknown campaign type: ${campaignType}`);
    }

    if (!campaignId) {
      throw new Error(`Campaign ID not configured for type: ${campaignType}`);
    }

    console.log('[Smartlead Handoff] Using campaign:', campaignName, '(ID:', campaignId + ')');

    // Handle platform invitations differently (no contact lookup needed)
    if (campaignType === 'platform_invite') {
      const leadData = {
        lead_list: [{
          first_name: inviteEmail.split('@')[0] || 'there',
          last_name: '',
          email: inviteEmail,
          custom_fields: {
            role: inviteRole,
            signup_link: signupLink,
            invitation_date: new Date().toISOString().split('T')[0]
          }
        }],
        settings: {
          ignore_global_block_list: false,
          ignore_unsubscribe_list: false
        }
      };

      console.log('[Smartlead Handoff] Sending platform invite to:', inviteEmail);

      const apiKey = process.env.SMARTLEAD_API_KEY;
      const smartleadUrl = `https://server.smartlead.ai/api/v1/campaigns/${campaignId}/leads?api_key=${apiKey}`;
      
      const smartleadResponse = await fetch(smartleadUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leadData)
      });

      const responseText = await smartleadResponse.text();
      console.log('[Smartlead Handoff] Response:', smartleadResponse.status, responseText);

      if (!smartleadResponse.ok) {
        throw new Error(`Smartlead API error ${smartleadResponse.status}: ${responseText}`);
      }

      return res.json({
        success: true,
        message: 'Platform invitation sent via Smartlead',
        email: inviteEmail,
        campaign_id: campaignId
      });
    }

    // For regular contact handoffs (podcast/discovery/strategy)
    // 1. Get contact from Supabase
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .single();

    if (contactError || !contact) {
      throw new Error(`Contact not found: ${contactError?.message}`);
    }

    console.log('[Smartlead Handoff] Contact found:', contact.email);

    // 2. Prepare lead data for Smartlead
    const leadData = {
      lead_list: [{
        first_name: contact.name?.split(' ')[0] || 'there',
        last_name: contact.name?.split(' ').slice(1).join(' ') || '',
        email: contact.email,
        company_name: contact.company || '',
        phone_number: contact.phone || '',
        location: contact.location || '',
        custom_fields: {
          pre_qual_score: preQualScore?.toString() || '0',
          industry: contact.industry || '',
          source: trigger,
          handoff_date: new Date().toISOString().split('T')[0],
          contact_id: contactId
        }
      }],
      settings: {
        ignore_global_block_list: false,
        ignore_unsubscribe_list: false
      }
    };

    console.log('[Smartlead Handoff] Sending to Smartlead:', JSON.stringify(leadData, null, 2));

    // 3. Add lead to Smartlead campaign
    const apiKey = process.env.SMARTLEAD_API_KEY;
    const smartleadUrl = `https://server.smartlead.ai/api/v1/campaigns/${campaignId}/leads?api_key=${apiKey}`;
    
    const smartleadResponse = await fetch(smartleadUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(leadData)
    });

    const responseText = await smartleadResponse.text();
    console.log('[Smartlead Handoff] Response status:', smartleadResponse.status);
    console.log('[Smartlead Handoff] Response body:', responseText);

    if (!smartleadResponse.ok) {
      throw new Error(`Smartlead API error ${smartleadResponse.status}: ${responseText}`);
    }

    let smartleadData;
    try {
      smartleadData = JSON.parse(responseText);
    } catch (e) {
      console.log('[Smartlead Handoff] Response was not JSON, treating as success');
      smartleadData = { success: true };
    }

    // 4. Update contact in Supabase
    const updateData = {
      stage: newStage,
      status: newStatus,
      current_campaign: campaignName,
      smartlead_campaign_id: campaignId,
      smartlead_handoff_date: new Date().toISOString(),
      notes: (contact.notes || '') + `\n\n[${new Date().toISOString()}] ✅ Handed to Smartlead - ${campaignName}\n${preQualScore ? `Pre-qual Score: ${preQualScore}\n` : ''}Campaign ID: ${campaignId}\nEmail: ${contact.email}`
    };

    const { error: updateError } = await supabase
      .from('contacts')
      .update(updateData)
      .eq('id', contactId);

    if (updateError) {
      console.error('[Smartlead Handoff] Error updating contact:', updateError);
      // Don't fail the whole operation
    }

    console.log('[Smartlead Handoff] ✅ Success for:', contact.email);

    return res.json({
      success: true,
      message: `Lead successfully handed to Smartlead ${campaignName} campaign`,
      email: contact.email,
      campaign_id: campaignId,
      smartlead_response: smartleadData
    });

  } catch (error) {
    console.error('[Smartlead Handoff] ❌ Error:', error);
    return res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
}
