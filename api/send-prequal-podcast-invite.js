const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Manually Send Pre-Qual Podcast Invitation
 * For qualified pre-qual calls that didn't get the automated email
 * 
 * Endpoint: POST /api/send-prequal-podcast-invite
 * Body: { callId } - The pre_qualification_calls record ID
 */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { callId } = req.body;

    if (!callId) {
      return res.status(400).json({ 
        error: 'Missing required field: callId is required' 
      });
    }

    console.log('[Manual Podcast Invite] Sending invitation for call:', callId);

    // Get the pre-qual call record
    const { data: prequalCall, error: callError } = await supabase
      .from('pre_qualification_calls')
      .select('*')
      .eq('id', callId)
      .single();

    if (callError || !prequalCall) {
      return res.status(404).json({ error: 'Pre-qualification call not found' });
    }

    // Check if already sent
    if (prequalCall.podcast_invitation_sent) {
      return res.status(400).json({ 
        error: 'Podcast invitation already sent',
        sent_at: prequalCall.podcast_invitation_sent_at
      });
    }

    // Check if qualified (score >= 35)
    if (!prequalCall.ai_score || prequalCall.ai_score < 35) {
      return res.status(400).json({ 
        error: 'Call not qualified for podcast invitation',
        current_score: prequalCall.ai_score,
        required_score: 35
      });
    }

    console.log('[Manual Podcast Invite] ✅ Qualified! Score:', prequalCall.ai_score);

    // Build personalized email content
    const firstName = prequalCall.guest_name.split(' ')[0];
    const companyName = prequalCall.company || 'your business';
    
    // Format growth challenges for email
    const challenges = prequalCall.growth_challenges || [];
    const challengesText = challenges.length > 0 
      ? challenges.slice(0, 2).join(' and ')
      : 'the growth challenges you mentioned';
    
    // Format podcast topics
    const topics = prequalCall.podcast_topics || [];
    const topicsText = topics.length > 0 
      ? topics.slice(0, 2).join(', ')
      : 'scaling strategies and leadership development';

    // Build personalized intro based on strengths
    let personalNote = '';
    const strengths = prequalCall.strengths || [];
    if (strengths.length > 0) {
      const strength = strengths[0];
      personalNote = `I was particularly impressed by ${strength.toLowerCase()}. `;
    }

    const emailBody = `Hi ${firstName},

Thanks for taking the time to speak with me during our pre-podcast call! ${personalNote}I really enjoyed learning about ${companyName} and hearing your perspective on ${challengesText}.

Based on our conversation, I think there's a great opportunity for us to dive deeper into your growth strategy. I'd love to invite you to be a guest on my podcast, where we explore ${topicsText} with business leaders like yourself.

**About the Podcast:**
The Modern Design podcast features in-depth conversations with executives and business owners who are scaling their operations and overcoming real growth challenges. It's a 30-minute discussion where we can:

- Explore the specific challenges you're facing with ${challengesText}
- Share proven strategies that have worked for similar businesses
- Discuss actionable next steps for your growth goals

**About Me:**
I'm Maggie Forbes, founder of Maggie Forbes Strategies. I specialize in helping B2B companies and service professionals scale from $3M to $10M+ through systematic lead generation, sales enablement, and strategic growth planning. My clients typically see a 7x ROI within 90 days of implementing The Leadership Intelligence System™.

Learn more about my work: https://www.maggieforbesstrategies.com

**Next Steps:**
The podcast is conversational and value-focused—my goal is to help you gain clarity on your next growth phase while sharing insights that could benefit other business leaders facing similar challenges.

Schedule your 30-minute podcast interview here:
👉 https://calendly.com/maggie-maggieforbesstrategies/podcast-call-1

I'm looking forward to continuing our conversation!

Best regards,

Maggie Forbes
Founder, Maggie Forbes Strategies
AI Systems for Human-Led Growth

🌐 www.maggieforbesstrategies.com`;

    console.log('[Manual Podcast Invite] Sending email to:', prequalCall.guest_email);

    // Send via Instantly
    const instantlyResponse = await fetch('https://api.instantly.ai/api/v1/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.INSTANTLY_API_KEY}`
      },
      body: JSON.stringify({
        to: prequalCall.guest_email,
        subject: `${firstName}, let's continue our conversation on the podcast 🎙️`,
        body: emailBody,
        from_email: 'maggie@maggieforbesstrategies.com',
        from_name: 'Maggie Forbes'
      })
    });

    if (!instantlyResponse.ok) {
      const errorText = await instantlyResponse.text();
      console.error('[Manual Podcast Invite] ❌ Instantly API error:', errorText);
      throw new Error(`Instantly API failed: ${errorText}`);
    }

    console.log('[Manual Podcast Invite] ✅ Email sent successfully!');

    // Mark as sent in database
    const { error: updateError } = await supabase
      .from('pre_qualification_calls')
      .update({ 
        podcast_invitation_sent: true,
        podcast_invitation_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', callId);

    if (updateError) {
      console.error('[Manual Podcast Invite] ⚠️ Error updating database:', updateError);
      // Don't throw - email was sent successfully
    }

    // Update contact status
    if (prequalCall.contact_id) {
      await supabase
        .from('contacts')
        .update({ 
          status: 'podcast_scheduled',
          updated_at: new Date().toISOString()
        })
        .eq('id', prequalCall.contact_id);
    }

    return res.status(200).json({
      success: true,
      message: `✅ Podcast invitation sent to ${prequalCall.guest_name}`,
      guest_name: prequalCall.guest_name,
      guest_email: prequalCall.guest_email,
      score: prequalCall.ai_score,
      sent_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Manual Podcast Invite] ❌ Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to send podcast invitation',
      details: error.message
    });
  }
};
