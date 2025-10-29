const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const INSTANTLY_API_KEY = process.env.INSTANTLY_API_KEY;
const INSTANTLY_STRATEGY_CAMPAIGN_ID = process.env.INSTANTLY_STRATEGY_CAMPAIGN_ID;

/**
 * Send Strategy Call Invitation via Instantly
 * Triggered after qualified discovery call (score >= 35)
 */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Handle GET request (for testing)
  if (req.method === 'GET') {
    return res.status(200).json({ 
      status: 'ok', 
      message: 'Instantly Strategy Call endpoint is running',
      timestamp: new Date().toISOString()
    });
  }

  if (req.method === 'POST') {
    try {
      const { sales_call_id, contact_name, company, recommended_tier, systems } = req.body;

      if (!sales_call_id) {
        return res.status(400).json({
          success: false,
          error: 'sales_call_id is required'
        });
      }

      console.log(`[Strategy Invite] Processing strategy call invitation`);

      // Get sales call details
      const { data: salesCall, error: fetchError } = await supabase
        .from('sales_calls')
        .select('*, contacts(*)')
        .eq('id', sales_call_id)
        .single();

      if (fetchError || !salesCall) {
        throw new Error('Sales call not found');
      }

      // Check if email already sent
      if (salesCall.calendly_invite_sent) {
        console.log('[Strategy Invite] Email already sent');
        return res.status(200).json({
          success: true,
          message: 'Email already sent',
          already_sent: true
        });
      }

      const contact = salesCall.contacts || {};
      const firstName = contact.name?.split(' ')[0] || contact_name?.split(' ')[0] || 'there';
      const companyName = contact.company || company || 'your business';
      const tier = recommended_tier || salesCall.recommended_tier || 'Growth Architecture';

      // IMPROVED EMAIL TEMPLATE
      const emailSubject = `Your custom growth strategy is ready`;
      
      const emailBody = `Hi ${firstName},

Based on our discovery conversation, I'd like to schedule a strategy call to present your customized ${tier} implementation plan for ${companyName}.

Schedule your strategy call here:
https://calendly.com/maggie-maggieforbesstrategies/strategy-call

Looking forward to showing you what's possible!

Maggie Forbes
Founder, Maggie Forbes Strategies
AI Systems for Human-Led Growth`;

      // Send via Instantly API
      const instantlyResponse = await fetch('https://api.instantly.ai/api/v1/lead/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          api_key: INSTANTLY_API_KEY,
          campaign_id: INSTANTLY_STRATEGY_CAMPAIGN_ID,
          email: contact.email,
          first_name: firstName,
          last_name: contact.name?.split(' ').slice(1).join(' ') || '',
          company_name: companyName,
          personalization: {
            strategy_call_link: 'https://calendly.com/maggie-maggieforbesstrategies/strategy-call',
            recommended_tier: tier
          },
          variables: {
            subject: emailSubject,
            body: emailBody
          }
        })
      });

      if (!instantlyResponse.ok) {
        const errorData = await instantlyResponse.text();
        throw new Error(`Instantly API error: ${instantlyResponse.status} - ${errorData}`);
      }

      const instantlyResult = await instantlyResponse.json();
      console.log('[Strategy Invite] Instantly response:', instantlyResult);

      // Update sales call record
      await supabase
        .from('sales_calls')
        .update({
          calendly_invite_sent: true,
          calendly_invite_sent_at: new Date().toISOString(),
          calendly_link: 'https://calendly.com/maggie-maggieforbesstrategies/strategy-call'
        })
        .eq('id', sales_call_id);

      console.log('[Strategy Invite] ✅ Email sent successfully');

      return res.status(200).json({
        success: true,
        message: 'Strategy call invitation sent',
        email: contact.email
      });

    } catch (error) {
      console.error('[Strategy Invite] Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
