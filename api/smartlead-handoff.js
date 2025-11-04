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

  const { contactId, trigger, preQualScore } = req.body;

  try {
    console.log('[Smartlead Handoff] Starting for contact:', contactId);
    console.log('[Smartlead Handoff] Trigger:', trigger);
    console.log('[Smartlead Handoff] Pre-qual Score:', preQualScore);

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
      campaign_id: parseInt(process.env.SMARTLEAD_PODCAST_CAMPAIGN_ID),
      lead_list: [{
        email: contact.email,
        first_name: contact.name?.split(' ')[0] || 'there',
        last_name: contact.name?.split(' ').slice(1).join(' ') || '',
        company_name: contact.company || 'your company',
        custom_fields: {
          pre_qual_score: preQualScore || 0,
          company: contact.company || '',
          industry: contact.industry || '',
          source: 'pre_qual_qualified',
          handoff_date: new Date().toISOString()
        }
      }]
    };

    console.log('[Smartlead Handoff] Sending to Smartlead:', JSON.stringify(leadData, null, 2));

    // 3. Add lead to Smartlead campaign
    const smartleadResponse = await fetch('https://server.smartlead.ai/api/v1/campaigns/add-lead', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SMARTLEAD_API_KEY}`,
        'Content-Type': 'application/json'
      },
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
    const { error: updateError } = await supabase
      .from('contacts')
      .update({
        managed_by: 'smartlead',
        smartlead_lead_id: contact.email,
        smartlead_campaign_id: process.env.SMARTLEAD_PODCAST_CAMPAIGN_ID,
        handoff_date: new Date().toISOString(),
        stage: 'podcast_invited',
        status: 'Podcast Invitation Sent',
        notes: (contact.notes || '') + `\n\n[${new Date().toISOString()}] ✅ Handed to Smartlead - Podcast Invitation\nPre-qual Score: ${preQualScore}\nCampaign ID: ${process.env.SMARTLEAD_PODCAST_CAMPAIGN_ID}`
      })
      .eq('id', contactId);

    if (updateError) {
      console.error('[Smartlead Handoff] Error updating contact:', updateError);
    }

    console.log('[Smartlead Handoff] ✅ Success for:', contact.email);

    return res.json({
      success: true,
      message: 'Lead successfully handed to Smartlead Podcast Invitation campaign',
      email: contact.email,
      campaign_id: process.env.SMARTLEAD_PODCAST_CAMPAIGN_ID
    });

  } catch (error) {
    console.error('[Smartlead Handoff] ❌ Error:', error);
    return res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
}
