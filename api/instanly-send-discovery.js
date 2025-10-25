const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const INSTANTLY_API_KEY = process.env.INSTANTLY_API_KEY;
const INSTANTLY_CAMPAIGN_ID = process.env.INSTANTLY_DISCOVERY_CAMPAIGN_ID; // We'll add this

/**
 * Send Discovery Call Invitation via Instantly
 * Triggered after qualified podcast interview (agreed + score >= 35)
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
      message: 'Instantly Discovery Call endpoint is running',
      timestamp: new Date().toISOString()
    });
  }

  if (req.method === 'POST') {
    try {
      const { discovery_call_id } = req.body;

      if (!discovery_call_id) {
        return res.status(400).json({
          success: false,
          error: 'discovery_call_id is required'
        });
      }

      console.log(`[Discovery Invite] Processing for discovery call: ${discovery_call_id}`);

      // Get discovery call details
      const { data: discoveryCall, error: fetchError } = await supabase
        .from('discovery_calls')
        .select('*, contacts(*), podcast_interviews(*)')
        .eq('id', discovery_call_id)
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

      // Prepare email content
      const emailSubject = `Let's Continue Our Conversation, ${firstName}!`;
      
      const emailBody = `Hi ${firstName},

Thank you for such an engaging conversation on our podcast! I really enjoyed learning about ${company} and the exciting work you're doing.

Based on our discussion, I believe there are some powerful opportunities we could explore together to help you achieve your growth goals.

I'd love to schedule a discovery call to dive deeper into:
✓ Your specific growth challenges and objectives
✓ Strategies that could accelerate your results
✓ How The Leadership Intelligence System™ could support your vision

Please book a time that works best for you:
👉 https://calendly.com/maggie-maggieforbesstrategies/discovery-call

This will be a focused 45-minute conversation where we can explore if there's a fit to work together.

Looking forward to our next conversation!

Best regards,
Maggie Forbes
Founder, Maggie Forbes Strategies
The Leadership Intelligence System™

P.S. If none of the available times work for you, just reply to this email and we'll find a time that fits your schedule.`;

      // Send via Instantly API
      const instantlyResponse = await fetch('https://api.instantly.ai/api/v1/lead/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          api_key: INSTANTLY_API_KEY,
          campaign_id: INSTANTLY_CAMPAIGN_ID,
          email: contact.email,
          first_name: firstName,
          last_name: contact.name?.split(' ').slice(1).join(' ') || '',
          company_name: company,
          personalization: {
            discovery_call_link: 'https://calendly.com/maggie-maggieforbesstrategies/discovery-call'
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
      console.log('[Discovery Invite] Instantly response:', instantlyResult);

      // Update discovery call record
      await supabase
        .from('discovery_calls')
        .update({
          calendly_invite_sent: true,
          calendly_invite_sent_at: new Date().toISOString(),
          calendly_link: 'https://calendly.com/maggie-maggieforbesstrategies/discovery-call'
        })
        .eq('id', discovery_call_id);

      console.log('[Discovery Invite] ✅ Email sent successfully');

      return res.status(200).json({
        success: true,
        message: 'Discovery call invitation sent',
        email: contact.email
      });

    } catch (error) {
      console.error('[Discovery Invite] Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
