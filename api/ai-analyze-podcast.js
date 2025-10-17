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
 * Matches the format from the user's example analysis
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

      // Generate comprehensive AI analysis
      const analysis = await analyzeTranscript(transcript);

      // Calculate overall score
      const overallScore = calculateOverallScore(analysis);

      // Determine if qualified for discovery call
      const qualifiedForDiscovery = overallScore >= 35;

      // Update interview record with analysis
      const { data: updatedInterview, error: updateError } = await supabase
        .from('podcast_interviews')
        .update({
          overall_score: overallScore,
          intro_score: analysis.intro.total_score,
          questions_flow_score: analysis.questions_flow.total_score,
          close_next_steps_score: analysis.close_next_steps.total_score,
          ai_analysis: analysis,
          qualified_for_discovery: qualifiedForDiscovery,
          interview_status: 'analyzed',
          analyzed_at: new Date().toISOString()
        })
        .eq('id', interview_id)
        .select();

      if (updateError) throw updateError;

      console.log(`[AI Analyzer] Analysis complete. Score: ${overallScore}/50`);

      // If qualified, trigger auto-progression to discovery call
      if (qualifiedForDiscovery) {
        console.log(`[AI Analyzer] Interview qualified! Triggering auto-progression...`);
        await createDiscoveryCall(updatedInterview[0]);
      }

      return res.status(200).json({
        success: true,
        data: {
          interview_id,
          overall_score: overallScore,
          qualified: qualifiedForDiscovery,
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
 * Returns comprehensive analysis matching user's example format
 */
async function analyzeTranscript(transcript) {
  const prompt = `You are an expert podcast analyst. Analyze this podcast transcript and provide a comprehensive evaluation.

TRANSCRIPT:
${transcript}

Provide a detailed analysis in the following JSON format:

{
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
    "guest_fit_assessment": "Analysis of whether guest is good fit for discovery call"
  }
}

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
 * Auto-create discovery call if qualified
 */
async function createDiscoveryCall(interview) {
  try {
    const { data: discoveryCall, error } = await supabase
      .from('discovery_calls')
      .insert([{
        contact_name: interview.guest_name,
        email: interview.guest_email,
        company: interview.company,
        call_source: 'podcast_qualified',
        call_status: 'scheduled',
        podcast_interview_id: interview.id,
        notes: `Auto-created from podcast interview. AI Score: ${interview.overall_score}/50.\n\nKey insights: ${interview.ai_analysis?.overall_insights?.key_strengths?.join(', ') || 'See podcast analysis'}`,
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

    console.log(`[AI Analyzer] Discovery call created: ${discoveryCall[0].id}`);
    
    return discoveryCall[0];

  } catch (error) {
    console.error('[AI Analyzer] Error creating discovery call:', error);
    throw error;
  }
}
