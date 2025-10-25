const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY 
});

/**
 * AI Podcast Analyzer
 * Analyzes podcast transcripts and generates comprehensive scoring
 * Auto-creates discovery call ONLY if: prospect agreed AND score >= 35
 * Auto-sends discovery call invitation via Instantly
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
      const { interview_id, transcript } = req.body;

      if (!interview_id || !transcript) {
        return res.status(400).json({
          success: false,
          error: 'interview_id and transcript are required'
        });
      }

      console.log(`[AI Analyzer] Starting analysis for interview ${interview_id}`);

      // Get interview details (need contact info)
      const { data: interview, error: fetchError } = await supabase
        .from('podcast_interviews')
        .select('*, contacts(*)')
        .eq('id', interview_id)
        .single();

      if (fetchError) {
        console.error('[AI Analyzer] Error fetching interview:', fetchError);
        throw fetchError;
      }

      // Generate comprehensive AI analysis
      const analysis = await analyzeTranscript(transcript);

      // Calculate overall score
      const overallScore = calculateOverallScore(analysis);

      // Check if prospect agreed to discovery call
      const agreedToDiscovery = analysis.prospect_agreement.agreed_to_discovery || 
                                 analysis.prospect_agreement.agreed_to_next_meeting;

      // Check if score meets minimum threshold
      const scoreQualified = overallScore >= 35;

      // BOTH conditions required for auto-creation
      const fullyQualified = agreedToDiscovery && scoreQualified;

      // Determine qualification status and reason
      let qualificationStatus = 'not_qualified';
      let qualificationReason = '';

      if (fullyQualified) {
        qualificationStatus = 'qualified';
        qualificationReason = 'Prospect agreed and conversation met quality threshold (≥35)';
      } else if (agreedToDiscovery && !scoreQualified) {
        qualificationStatus = 'needs_review';
        qualificationReason = `Prospect agreed but score too low (${overallScore}/50). Manual review needed to gather more information.`;
      } else if (!agreedToDiscovery && scoreQualified) {
        qualificationStatus = 'no_agreement';
        qualificationReason = `Good conversation quality (${overallScore}/50) but prospect did not agree to next steps.`;
      } else {
        qualificationStatus = 'not_qualified';
        qualificationReason = `Prospect did not agree and score below threshold (${overallScore}/50).`;
      }

      // Update interview record with analysis
      const { data: updatedInterview, error: updateError } = await supabase
        .from('podcast_interviews')
        .update({
          overall_score: overallScore,
          intro_score: analysis.intro.total_score,
          questions_flow_score: analysis.questions_flow.total_score,
          close_next_steps_score: analysis.close_next_steps.total_score,
          ai_analysis: analysis,
          qualified_for_discovery: fullyQualified,
          qualification_status: qualificationStatus,
          qualification_reason: qualificationReason,
          prospect_agreed: agreedToDiscovery,
          interview_status: 'analyzed',
          analyzed_at: new Date().toISOString()
        })
        .eq('id', interview_id)
        .select('*, contacts(*)')
        .single();

      if (updateError) throw updateError;

      console.log(`[AI Analyzer] Analysis complete:`);
      console.log(`  - Score: ${overallScore}/50 (threshold: 35)`);
      console.log(`  - Prospect agreed: ${agreedToDiscovery}`);
      console.log(`  - Status: ${qualificationStatus}`);
      console.log(`  - Reason: ${qualificationReason}`);

      let discoveryCallCreated = null;

      // ONLY auto-create if BOTH conditions met
      if (fullyQualified) {
        console.log(`[AI Analyzer] ✅ FULLY QUALIFIED! Creating discovery call...`);
        discoveryCallCreated = await createDiscoveryCall(updatedInterview, analysis, overallScore);
        
        // Update contact stage to "discovery"
        if (updatedInterview.contact_id) {
          await supabase
            .from('contacts')
            .update({ 
              status: 'discovery',
              last_contact_date: new Date().toISOString()
            })
            .eq('id', updatedInterview.contact_id);
          
          console.log(`[AI Analyzer] Contact moved to discovery stage`);
        }

        // 🚀 AUTO-SEND DISCOVERY CALL INVITATION VIA INSTANTLY
        if (discoveryCallCreated) {
          console.log(`[AI Analyzer] Sending discovery call invitation...`);
          await sendDiscoveryInvitation(discoveryCallCreated.id);
        }
      } else {
        console.log(`[AI Analyzer] ⚠️  NOT AUTO-CREATING: ${qualificationReason}`);
      }

      return res.status(200).json({
        success: true,
        data: {
          interview_id,
          overall_score: overallScore,
          prospect_agreed: agreedToDiscovery,
          score_qualified: scoreQualified,
          fully_qualified: fullyQualified,
          qualification_status: qualificationStatus,
          qualification_reason: qualificationReason,
          discovery_call_created: discoveryCallCreated ? true : false,
          discovery_call_id: discoveryCallCreated?.id,
          agreement_details: analysis.prospect_agreement,
          analysis
        }
      });

    } catch (error) {
      console.error('[AI Analyzer] Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

/**
 * Analyze transcript using Claude AI
 * Checks for prospect agreement AND provides quality scoring
 */
async function analyzeTranscript(transcript) {
  const prompt = `You are an expert podcast analyst. Analyze this podcast transcript and provide a comprehensive evaluation.

TRANSCRIPT:
${transcript}

Provide a detailed analysis in the following JSON format:

{
  "prospect_agreement": {
    "agreed_to_discovery": true/false,
    "agreed_to_next_meeting": true/false,
    "confidence": "high/medium/low",
    "evidence": ["Quote from transcript showing agreement", "Another quote"],
    "context": "Explain what the prospect agreed to and how enthusiastic they were"
  },
  "intro": {
    "total_score": 0-10,
    "rapport_energy": {
      "score": 0-10,
      "feedback": "detailed feedback here",
      "examples": ["quote from transcript", "another quote"],
      "script_example": "suggested improvement script"
    },
    "credibility": {
      "score": 0-10,
      "feedback": "detailed feedback",
      "examples": ["quotes"],
      "script_example": "improvement"
    },
    "frame_context_intro": {
      "score": 0-10,
      "feedback": "Was guest properly introduced?",
      "examples": ["quotes or lack thereof"],
      "script_example": "Today, we're thrilled to welcome [Guest Name]..."
    },
    "frame_context_expectations": {
      "score": 0-10,
      "feedback": "Were expectations set?",
      "examples": ["quotes"],
      "script_example": "improvement"
    },
    "hook": {
      "score": 0-10,
      "feedback": "Was there a compelling opening?",
      "examples": ["quotes or lack"],
      "script_example": "Have you ever wondered..."
    }
  },
  "questions_flow": {
    "total_score": 0-10,
    "question_quality": {
      "score": 0-10,
      "feedback": "Were questions relevant and thought-provoking?",
      "examples": ["quote question 1", "quote question 2"]
    },
    "deep_diving": {
      "score": 0-10,
      "feedback": "Did host follow up and probe deeper?",
      "examples": ["follow-up examples"],
      "script_example": "improvement"
    },
    "pacing": {
      "score": 0-10,
      "feedback": "Was conversation well-paced?",
      "script_example": "improvement"
    },
    "transitions": {
      "score": 0-10,
      "feedback": "Were topic transitions smooth?",
      "examples": ["transition quotes"],
      "script_example": "improvement"
    },
    "guest_management": {
      "score": 0-10,
      "feedback": "Did host make guest shine?",
      "examples": ["positive affirmations"]
    },
    "audience_awareness": {
      "score": 0-10,
      "feedback": "Were questions relevant to audience?",
      "examples": ["quotes"]
    }
  },
  "close_next_steps": {
    "total_score": 0-10,
    "summary": {
      "score": 0-10,
      "feedback": "Was there a recap of key points?",
      "script_example": "To recap, [Guest] shared..."
    },
    "guest_promotion": {
      "score": 0-10,
      "feedback": "Did host promote guest's work?",
      "examples": ["quotes or lack"],
      "script_example": "For listeners who want to learn more..."
    },
    "call_to_action": {
      "score": 0-10,
      "feedback": "Clear CTA for audience?",
      "script_example": "If you enjoyed this, please leave a review..."
    },
    "professional_closing": {
      "score": 0-10,
      "feedback": "Strong, memorable ending?",
      "examples": ["closing quotes"],
      "script_example": "improvement"
    }
  },
  "overall_insights": {
    "key_strengths": ["strength 1", "strength 2"],
    "key_improvements": ["improvement 1", "improvement 2"],
    "guest_fit_assessment": "Analysis of whether guest is good fit for discovery call",
    "information_gaps": ["What information was NOT gathered that would be needed for next conversation"]
  }
}

CRITICAL INSTRUCTIONS:

1. PROSPECT AGREEMENT (MOST IMPORTANT):
   Look for explicit or implicit agreement to:
   - Schedule a discovery call
   - Have a follow-up meeting
   - Continue the conversation
   - Book a next call
   - "Let's talk more about..."
   - "I'd love to learn more..."
   - "When can we schedule..."
   - Any affirmative response to an invitation for next steps
   
   Set agreed_to_discovery to TRUE only if there is clear evidence the prospect wants to continue.
   Set confidence based on how explicit the agreement was (explicit = high, implied = medium, unclear = low).

2. QUALITY SCORING:
   Score honestly based on the criteria. Low scores indicate gaps in information gathering.
   If score is low (<35), note what information is missing in "information_gaps".

Be specific, cite actual quotes from the transcript, and provide actionable feedback.`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    // Extract JSON from response
    const responseText = message.content[0].text;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from AI response');
    }

    const analysis = JSON.parse(jsonMatch[0]);
    
    return analysis;

  } catch (error) {
    console.error('[AI Analyzer] AI analysis failed:', error);
    throw new Error('AI analysis failed: ' + error.message);
  }
}

/**
 * Calculate overall score from category scores
 */
function calculateOverallScore(analysis) {
  // Intro: worth 10 points
  const introScore = analysis.intro.total_score;
  
  // Questions & Flow: worth 10 points  
  const questionsScore = analysis.questions_flow.total_score;
  
  // Close & Next Steps: worth 10 points
  const closeScore = analysis.close_next_steps.total_score;
  
  // Overall out of 30, convert to 50
  const totalOutOf30 = introScore + questionsScore + closeScore;
  const overallScore = (totalOutOf30 / 30) * 50;
  
  return Math.round(overallScore * 100) / 100; // Round to 2 decimals
}

/**
 * Auto-create discovery call when BOTH conditions met
 */
async function createDiscoveryCall(interview, analysis, score) {
  try {
    // Get contact info from the interview
    const contact = interview.contacts || {};
    
    const agreementContext = analysis.prospect_agreement.context || 'See podcast analysis for details';
    const agreementEvidence = analysis.prospect_agreement.evidence?.join('\n') || '';
    const informationGaps = analysis.overall_insights?.information_gaps?.join('\n') || 'None identified';

    const { data: discoveryCall, error } = await supabase
      .from('discovery_calls')
      .insert([{
        contact_name: contact.name || interview.guest_name,
        email: contact.email || interview.guest_email,
        company: contact.company || interview.company,
        call_source: 'podcast_qualified',
        call_status: 'scheduled',
        podcast_interview_id: interview.id,
        notes: `🤖 Auto-created from podcast interview (Qualified: Agreed + Score ≥35)

📊 AI SCORE: ${score}/50

✅ PROSPECT AGREEMENT:
${agreementContext}

Evidence from transcript:
${agreementEvidence}

💡 KEY STRENGTHS:
${analysis.overall_insights?.key_strengths?.join('\n') || 'See podcast analysis'}

⚠️  INFORMATION GAPS TO ADDRESS:
${informationGaps}

🎯 GUEST FIT ASSESSMENT:
${analysis.overall_insights?.guest_fit_assessment || 'Review full analysis'}

📝 View full podcast analysis for detailed scoring breakdown.`,
        created_at: new Date().toISOString()
      }])
      .select();

    if (error) throw error;

    // Update podcast interview with link to discovery call
    await supabase
      .from('podcast_interviews')
      .update({
        discovery_call_created: true,
        discovery_call_id: discoveryCall[0].id
      })
      .eq('id', interview.id);

    console.log(`[AI Analyzer] ✅ Discovery call created: ${discoveryCall[0].id}`);
    
    return discoveryCall[0];

  } catch (error) {
    console.error('[AI Analyzer] Error creating discovery call:', error);
    throw error;
  }
}

/**
 * Send discovery call invitation via Instantly
 */
async function sendDiscoveryInvitation(discoveryCallId) {
  try {
    const inviteUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}/api/instantly-send-discovery`
      : 'https://growthmanagerpro-backend.vercel.app/api/instantly-send-discovery';

    const response = await fetch(inviteUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        discovery_call_id: discoveryCallId
      })
    });

    const result = await response.json();
    
    if (result.success) {
      console.log('[AI Analyzer] ✅ Discovery invitation sent successfully');
    } else {
      console.error('[AI Analyzer] ⚠️  Failed to send discovery invitation:', result.error);
    }

    return result;

  } catch (error) {
    console.error('[AI Analyzer] Error sending discovery invitation:', error);
    // Don't throw - we don't want to fail the whole analysis if email fails
    return { success: false, error: error.message };
  }
}
