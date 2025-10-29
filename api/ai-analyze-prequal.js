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
 * Analyzes pre-qual transcripts and auto-triggers podcast invitation if qualified
 * 
 * Endpoint: POST /api/ai-analyze-prequal
 * Body: { prequal_call_id, transcript }
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
    const { prequal_call_id, transcript } = req.body;

    if (!prequal_call_id || !transcript) {
      return res.status(400).json({ 
        error: 'Missing required fields: prequal_call_id and transcript are required' 
      });
    }

    console.log('[Pre-Qual Analysis] Analyzing call:', prequal_call_id);

    // Get the pre-qual call record
    const { data: prequalCall, error: callError } = await supabase
      .from('pre_qualification_calls')
      .select('*, contacts(*)')
      .eq('id', prequal_call_id)
      .single();

    if (callError || !prequalCall) {
      return res.status(404).json({ error: 'Pre-qualification call not found' });
    }

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
        transcript: transcript,
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
      .eq('id', prequal_call_id);

    if (updateError) {
      console.error('[Pre-Qual Analysis] Error updating call:', updateError);
      throw updateError;
    }

    // If qualified, send podcast invitation via Instantly
    if (analysis.qualified_for_podcast && analysis.qualification_score >= 35) {
      console.log('[Pre-Qual Analysis] ✅ QUALIFIED! Sending podcast invitation...');

      try {
        const instantlyResponse = await fetch('https://api.instantly.ai/api/v1/email/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.INSTANTLY_API_KEY}`
          },
          body: JSON.stringify({
            to: prequalCall.guest_email,
            subject: `Let's continue our conversation - Podcast invitation`,
            body: `Hi ${prequalCall.guest_name.split(' ')[0]},

Thanks for our great pre-qualification call! I really enjoyed learning about ${prequalCall.company || 'your business'} and the growth challenges you're facing.

I'd love to continue our conversation in a more in-depth format. I host a podcast where I explore ${analysis.podcast_topics.join(', ')} with leaders like yourself.

Would you be open to a 30-minute podcast conversation? It's a great way to dive deeper into your growth strategy, and I can share some specific ideas that might help.

Schedule your podcast interview here:
https://calendly.com/maggie-maggieforbesstrategies/podcast-call-1

Looking forward to it!

Maggie Forbes
Founder, Maggie Forbes Strategies
The Leadership Intelligence System™`,
            from_email: 'maggie@maggieforbesstrategies.com'
          })
        });

        if (instantlyResponse.ok) {
          console.log('[Pre-Qual Analysis] ✅ Podcast invitation sent via Instantly');
          
          // Mark email as sent
          await supabase
            .from('pre_qualification_calls')
            .update({ 
              podcast_invitation_sent: true,
              podcast_invitation_sent_at: new Date().toISOString()
            })
            .eq('id', prequal_call_id);

        } else {
          console.error('[Pre-Qual Analysis] ❌ Instantly email failed:', await instantlyResponse.text());
        }
      } catch (emailError) {
        console.error('[Pre-Qual Analysis] ❌ Error sending email:', emailError);
      }
    } else {
      console.log('[Pre-Qual Analysis] ❌ Not qualified (score:', analysis.qualification_score, ')');
    }

    return res.status(200).json({
      success: true,
      prequal_call_id,
      qualified: analysis.qualified_for_podcast,
      score: analysis.qualification_score,
      analysis,
      podcast_invitation_sent: analysis.qualified_for_podcast && analysis.qualification_score >= 35,
      message: analysis.qualified_for_podcast 
        ? `✅ Qualified! Score: ${analysis.qualification_score}/50. Podcast invitation sent to ${prequalCall.guest_name}.`
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
