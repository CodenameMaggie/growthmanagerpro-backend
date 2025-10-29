const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * AI Pre-Qualification Call Analyzer
 * Analyzes pre-qual transcripts and auto-triggers personalized podcast invitation if qualified
 * 
 * Endpoint: POST /api/ai-analyze-prequal
 * Body: { callId } - The pre_qualification_calls record ID
 */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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

    console.log('[Pre-Qual Analysis] Analyzing call:', callId);

    // Get the pre-qual call record with transcript
    const { data: prequalCall, error: callError } = await supabase
      .from('pre_qualification_calls')
      .select('*, contacts(*)')
      .eq('id', callId)
      .single();

    if (callError || !prequalCall) {
      return res.status(404).json({ error: 'Pre-qualification call not found' });
    }

    // Check if transcript exists
    if (!prequalCall.transcript) {
      return res.status(400).json({ 
        error: 'Transcript not available yet. Please transcribe the recording first.' 
      });
    }

    const transcript = prequalCall.transcript;

    // AI Analysis Prompt
    const analysisPrompt = `You are analyzing a pre-qualification sales call to determine if this prospect should be invited to a podcast interview.

CONTEXT:
- This is a 15-minute screening call from cold email outreach
- You're qualifying for The Leadership Intelligence System™ (B2B growth consulting)
- Target: $3M+ revenue contractors, service professionals, B2B companies
- We use podcast interviews as the next qualification stage

TRANSCRIPT:
${transcript}

Analyze this pre-qualification call and respond with a JSON object:
{
  "qualified_for_podcast": true/false,
  "qualification_score": number (0-50, where 35+ = qualified),
  "revenue_signals": "estimated revenue or 'not discussed'",
  "growth_challenges": ["challenge 1", "challenge 2"],
  "budget_authority": "decision maker/influencer/unclear",
  "timeline": "immediate/this quarter/exploring/unclear",
  "engagement_level": "high/medium/low",
  "podcast_topics": ["potential topic 1", "topic 2"] (what to discuss on podcast),
  "red_flags": ["flag 1", "flag 2"] or [],
  "strengths": ["strength 1", "strength 2"],
  "summary": "2-3 sentence summary of fit and recommendation"
}

SCORING RUBRIC (0-50 points):
- Company size/revenue signals (0-15 points)
- Growth challenges mentioned (0-10 points)
- Budget/authority (0-10 points)
- Timeline urgency (0-5 points)
- Engagement level (0-10 points)

Score 35+ = Qualified for podcast interview`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: analysisPrompt
      }]
    });

    // Parse Claude's response
    const analysisText = message.content[0].text;
    const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error('Failed to parse analysis from Claude');
    }

    const analysis = JSON.parse(jsonMatch[0]);
    console.log('[Pre-Qual Analysis] Score:', analysis.qualification_score);

    // Update pre-qual call with analysis
    const { error: updateError } = await supabase
      .from('pre_qualification_calls')
      .update({
        ai_score: analysis.qualification_score,
        revenue_signals: analysis.revenue_signals,
        growth_challenges: analysis.growth_challenges,
        budget_authority: analysis.budget_authority,
        timeline: analysis.timeline,
        engagement_level: analysis.engagement_level,
        podcast_topics: analysis.podcast_topics,
        red_flags: analysis.red_flags,
        strengths: analysis.strengths,
        notes: analysis.summary,
        call_status: analysis.qualified_for_podcast ? 'qualified' : 'not_qualified',
        analyzed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', callId);

    if (updateError) {
      console.error('[Pre-Qual Analysis] Error updating call:', updateError);
      throw updateError;
    }

    // If qualified, send personalized podcast invitation via Instantly
    if (analysis.qualified_for_podcast && analysis.qualification_score >= 35) {
      console.log('[Pre-Qual Analysis] ✅ QUALIFIED! Sending personalized podcast invitation...');

      try {
        // Build personalized email content
        const firstName = prequalCall.guest_name.split(' ')[0];
        const companyName = prequalCall.company || 'your business';
        
        // Format growth challenges for email
        const challengesText = analysis.growth_challenges.length > 0 
          ? analysis.growth_challenges.slice(0, 2).join(' and ')
          : 'the growth challenges you mentioned';
        
        // Format podcast topics
        const topicsText = analysis.podcast_topics.length > 0 
          ? analysis.podcast_topics.slice(0, 2).join(', ')
          : 'scaling strategies and leadership development';

        // Build personalized intro based on strengths
        let personalNote = '';
        if (analysis.strengths.length > 0) {
          const strength = analysis.strengths[0];
          personalNote = `I was particularly impressed by ${strength.toLowerCase()}. `;
        }

        const emailBody = `Hi ${firstName},

Thanks for taking the time to speak with me during our pre-podcast call! ${personalNote}I really enjoyed learning about ${companyName} and hearing your perspective on ${challengesText}.

Based on our conversation, I think there's a great opportunity for us to dive deeper into your growth strategy. I'd love to invite you to be a guest on my podcast, where we explore ${topicsText} with business leaders like yourself.

**About the Podcast:**
The Modern Design podcast features in-depth conversations with executives and business owners who are scaling their operations and overcoming real growth challenges. It's a 30-minute discussion where we can:

• Explore the specific challenges you're facing with ${challengesText}
• Share proven strategies that have worked for similar businesses
• Discuss actionable next steps for your growth goals

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

📧 maggie@maggieforbesstrategies.com
🌐 www.maggieforbesstrategies.com`;

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

        if (instantlyResponse.ok) {
          console.log('[Pre-Qual Analysis] ✅ Personalized podcast invitation sent via Instantly');
          
          // Mark email as sent
          await supabase
            .from('pre_qualification_calls')
            .update({ 
              podcast_invitation_sent: true,
              podcast_invitation_sent_at: new Date().toISOString()
            })
            .eq('id', callId);

          // Also update contact status
          if (prequalCall.contact_id) {
            await supabase
              .from('contacts')
              .update({ 
                status: 'podcast_scheduled',
                updated_at: new Date().toISOString()
              })
              .eq('id', prequalCall.contact_id);
          }

        } else {
          const errorText = await instantlyResponse.text();
          console.error('[Pre-Qual Analysis] ❌ Instantly email failed:', errorText);
        }
      } catch (emailError) {
        console.error('[Pre-Qual Analysis] ❌ Error sending email:', emailError);
      }
    } else {
      console.log('[Pre-Qual Analysis] ❌ Not qualified (score:', analysis.qualification_score, ')');
    }

    return res.status(200).json({
      success: true,
      call_id: callId,
      guest_name: prequalCall.guest_name,
      qualified: analysis.qualified_for_podcast,
      score: analysis.qualification_score,
      analysis,
      podcast_invitation_sent: analysis.qualified_for_podcast && analysis.qualification_score >= 35,
      message: analysis.qualified_for_podcast 
        ? `✅ Qualified! Score: ${analysis.qualification_score}/50. Personalized podcast invitation sent to ${prequalCall.guest_name}.`
        : `❌ Not qualified. Score: ${analysis.qualification_score}/50 (need 35+).`
    });

  } catch (error) {
    console.error('[Pre-Qual Analysis] Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message 
    });
  }
};
