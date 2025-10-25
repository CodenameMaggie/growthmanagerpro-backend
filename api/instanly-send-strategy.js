const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const INSTANTLY_API_KEY = process.env.INSTANTLY_API_KEY;
const INSTANTLY_STRATEGY_CAMPAIGN_ID = process.env.INSTANTLY_STRATEGY_CAMPAIGN_ID; // We'll add this

/**
 * Send Strategy Call Invitation via Instantly
 * Triggered after qualified discovery call (agreed to see offer/proposal)
 */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    try {
      const { sales_call_id, discovery_call_id } = req.body;

      if (!sales_call_id && !discovery_call_id) {
        return res.status(400).json({
          success: false,
          error: 'sales_call_id or discovery_call_id is required'
        });
      }

      console.log(`[Strategy Invite] Processing strategy call invitation`);

      // Get sales call or discovery call details
      let email, firstName, company, callId;

      if (sales_call_id) {
        const { data: salesCall } = await supabase
          .from('sales_calls')
          .select('*, contacts(*)')
          .eq('id', sales_call_id)
          .single();
        
        if (salesCall && salesCall.calendly_invite_sent) {
          return res.status(200).json({
            success: true,
            message: 'Email already sent',
            already_sent: true
          });
        }

        const contact = salesCall?.contacts || {};
        email = contact.email;
        firstName = contact.name?.split(' ')[0] || 'there';
        company = contact.company || 'your business';
        callId = sales_call_id;
      } else {
        const { data: discoveryCall } = await supabase
          .from('discovery_calls')
          .select('*, contacts(*)')
          .eq('id', discovery_call_id)
          .single();
        
        const contact = discoveryCall?.contacts || {};
        email = contact.email;
        firstName = contact.name?.split(' ')[0] || 'there';
        company = contact.company || 'your business';
      }

      if (!email) {
        throw new Error('Contact email not found');
      }

      // Prepare email content
      const emailSubject = `Your Custom Growth Strategy is Ready, ${firstName}`;
      
      const emailBody = `Hi ${firstName},

Thank you for our productive discovery call! I've been thinking about ${company} and the growth opportunities we discussed.

I'm excited to share that I've prepared a customized strategy specifically designed to help you achieve your goals. This isn't a generic template – it's tailored to your unique situation and challenges.

Let's schedule a strategy call where I'll walk you through:
✓ A complete breakdown of your custom growth plan
✓ Specific tactics and timeline for implementation
✓ Expected ROI and key performance metrics
✓ How The Leadership Intelligence System™ will support your success

Book your strategy session here:
👉 https://calendly.com/maggie-maggieforbesstrategies/strategy-call

This 30-minute session will give you complete clarity on the path forward, whether we work together or not. You'll walk away with actionable insights you can implement immediately.

I'm looking forward to showing you what's possible!

Best regards,
Maggie Forbes
Founder, Maggie Forbes Strategies
The Leadership Intelligence System™

P.S. Spots are limited as I only work with a select number of clients at a time. Book soon to secure your preferred time.`;

      // Send via Instantly API
      const instantlyResponse = await fetch('https://api.instantly.ai/api/v1/lead/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          api_key: INSTANTLY_API_KEY,
          campaign_id: INSTANTLY_STRATEGY_CAMPAIGN_ID,
          email: email,
          first_name: firstName,
          last_name: '', // We can parse this if needed
          company_name: company,
          personalization: {
            strategy_call_link: 'https://calendly.com/maggie-maggieforbesstrategies/strategy-call'
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

      // Update sales call record if exists
      if (sales_call_id) {
        await supabase
          .from('sales_calls')
          .update({
            calendly_invite_sent: true,
            calendly_invite_sent_at: new Date().toISOString(),
            calendly_link: 'https://calendly.com/maggie-maggieforbesstrategies/strategy-call'
          })
          .eq('id', sales_call_id);
      }

      console.log('[Strategy Invite] ✅ Email sent successfully');

      return res.status(200).json({
        success: true,
        message: 'Strategy call invitation sent',
        email: email
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
