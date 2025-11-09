const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;   
const supabase = createClient(supabaseUrl, supabaseKey);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ============================================
// HANDLER: ANALYZE PRE-QUAL CALL
// ============================================
async function handleAnalyzePrequal(req, res) {
  try {
    const { callId } = req.body;

    if (!callId) {
      return res.status(400).json({ 
        success: false,
        error: 'callId is required' 
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
      return res.status(404).json({ 
        success: false,
        error: 'Pre-qualification call not found' 
      });
    }

    // Check if transcript exists
    if (!prequalCall.transcript) {
      return res.status(400).json({ 
        success: false,
        error: 'Transcript not available yet. Please transcribe the recording first.' 
      });
    }

    const transcript = prequalCall.transcript;

    // AI Analysis Prompt
    const analysisPrompt = `You are analyzing a pre-qualification strategy call to determine if this prospect should be invited to a podcast interview.

CONTEXT:
- This is a 15-minute screening call from cold email outreach
- You're qualifying for The Strategic Growth Architecture System™ (B2B growth consulting)
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

 // If qualified, send podcast invitation via SmartLead
if (analysis.qualified_for_podcast && analysis.qualification_score >= 35) {
  console.log('[Pre-Qual Analysis] ✅ QUALIFIED! Triggering SmartLead...');

  try {
    const handoffUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}/api/smartlead-handoff`
      : 'http://localhost:3000/api/smartlead-handoff';

    const handoffResponse = await fetch(handoffUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contactId: callId,
        trigger: 'pre_qual_qualified',
        campaignType: 'podcast',
        preQualScore: analysis.qualification_score
      })
    });

    const handoffResult = await handoffResponse.json();
    
    if (handoffResult.success) {
      console.log('[Pre-Qual Analysis] ✅ SmartLead handoff successful');
    } else {
      console.error('[Pre-Qual Analysis] ❌ SmartLead failed:', handoffResult.error);
    }
  } catch (emailError) {
    console.error('[Pre-Qual Analysis] ❌ Error calling SmartLead:', emailError);
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
        ? `✅ Qualified! Score: ${analysis.qualification_score}/50. Podcast invitation sent.`
        : `❌ Not qualified. Score: ${analysis.qualification_score}/50 (need 35+).`
    });

  } catch (error) {
    console.error('[Pre-Qual Analysis] Error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Internal server error', 
      details: error.message 
    });
  }
}

// ============================================
// HANDLER: ANALYZE PODCAST INTERVIEW
// ============================================
async function handleAnalyzePodcast(req, res) {
  try {
    const { interview_id, transcript } = req.body;

    if (!interview_id || !transcript) {
      return res.status(400).json({
        success: false,
        error: 'interview_id and transcript are required'
      });
    }

    console.log(`[Podcast Analysis] Analyzing interview ${interview_id}`);

    // Get interview details
    const { data: interview, error: fetchError } = await supabase
      .from('podcast_interviews')
      .select('*, contacts(*)')
      .eq('id', interview_id)
      .single();

    if (fetchError) {
      console.error('[Podcast Analysis] Error fetching interview:', fetchError);
      throw fetchError;
    }

    // Analyze with comprehensive scoring
    const analysis = await analyzePodcastTranscript(transcript);
    const overallScore = calculatePodcastScore(analysis);

    // Check if prospect agreed
    const agreedToDiscovery = analysis.prospect_agreement.agreed_to_discovery || 
                               analysis.prospect_agreement.agreed_to_next_meeting;

    const scoreQualified = overallScore >= 35;
    const fullyQualified = agreedToDiscovery && scoreQualified;

    // Determine qualification status
    let qualificationStatus = 'not_qualified';
    let qualificationReason = '';

    if (fullyQualified) {
      qualificationStatus = 'qualified';
      qualificationReason = 'Prospect agreed and conversation met quality threshold (≥35)';
    } else if (agreedToDiscovery && !scoreQualified) {
      qualificationStatus = 'needs_review';
      qualificationReason = `Prospect agreed but score too low (${overallScore}/50). Manual review needed.`;
    } else if (!agreedToDiscovery && scoreQualified) {
      qualificationStatus = 'no_agreement';
      qualificationReason = `Good conversation quality (${overallScore}/50) but prospect did not agree.`;
    } else {
      qualificationStatus = 'not_qualified';
      qualificationReason = `Prospect did not agree and score below threshold (${overallScore}/50).`;
    }

    // Update interview record
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

    console.log(`[Podcast Analysis] Score: ${overallScore}/50, Status: ${qualificationStatus}`);

    let discoveryCallCreated = null;

    // Auto-create discovery call if fully qualified
    if (fullyQualified) {
      console.log(`[Podcast Analysis] ✅ QUALIFIED! Creating discovery call...`);
      discoveryCallCreated = await createDiscoveryCall(updatedInterview, analysis, overallScore);
      
      // Update contact stage
      if (updatedInterview.contact_id) {
        await supabase
          .from('contacts')
          .update({ 
            status: 'discovery',
            last_contact_date: new Date().toISOString()
          })
          .eq('id', updatedInterview.contact_id);
      }

      // Send discovery invitation
      if (discoveryCallCreated) {
        console.log(`[Podcast Analysis] Sending discovery invitation...`);
        await sendDiscoveryInvitation(discoveryCallCreated.id);
      }
    } else {
      console.log(`[Podcast Analysis] ⚠️ NOT AUTO-CREATING: ${qualificationReason}`);
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
        discovery_call_created: !!discoveryCallCreated,
        discovery_call_id: discoveryCallCreated?.id,
        analysis
      }
    });

  } catch (error) {
    console.error('[Podcast Analysis] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// ============================================
// HANDLER: ANALYZE DISCOVERY CALL
// ============================================
async function handleAnalyzeDiscovery(req, res) {
  try {
    const { discovery_call_id, transcript } = req.body;

    if (!discovery_call_id || !transcript) {
      return res.status(400).json({ 
        success: false,
        error: 'discovery_call_id and transcript are required' 
      });
    }

    console.log('[Discovery Analysis] Processing call:', discovery_call_id);

    // Get discovery call record
    const { data: discoveryCall, error: discoveryError } = await supabase
      .from('discovery_calls')
      .select('*, contacts(*)')
      .eq('id', discovery_call_id)
      .single();

    if (discoveryError || !discoveryCall) {
      return res.status(404).json({ 
        success: false,
        error: 'Discovery call not found' 
      });
    }

    const contactName = discoveryCall.contacts?.name || 'Unknown';
    const company = discoveryCall.contacts?.company || 'Unknown Company';

    // Analyze with tier-based system
    const analysis = await analyzeDiscoveryTranscript(transcript);

    // Determine advancement
    const shouldAutoAdvance = analysis.totalScore >= 35;
    const requiresReview = analysis.totalScore >= 25 && analysis.totalScore < 35;
    const shouldNurture = analysis.totalScore < 25;

    let finalStatus, finalAction;
    if (shouldAutoAdvance) {
      finalStatus = 'qualified';
      finalAction = 'auto_advance';
    } else if (requiresReview) {
      finalStatus = 'review';
      finalAction = 'manual_review';
    } else {
      finalStatus = 'nurture';
      finalAction = 'move_to_nurture';
    }

    // Update discovery call
    const { error: updateError } = await supabase
      .from('discovery_calls')
      .update({
        transcript: transcript,
        ai_analysis: analysis,
        ai_score: analysis.totalScore,
        recommended_tier: analysis.recommendation.tier,
        recommended_systems: analysis.recommendation.specificSystems,
        status: finalStatus,
        key_points: analysis.painSeverity?.keyPainPoints || [],
        pain_points: analysis.painSeverity?.keyPainPoints || [],
        budget_mentioned: analysis.organizationalMaturity?.revenueRange || null,
        timeline: analysis.timeline?.estimatedTimeline || null,
        decision_maker: analysis.decisionAuthority?.role === 'Owner' || analysis.decisionAuthority?.role === 'CEO',
        enthusiasm_level: analysis.enthusiasmLevel || 'medium',
        notes: analysis.executiveSummary || '',
        analyzed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', discovery_call_id);

    if (updateError) {
      console.error('[Discovery Analysis] Error updating:', updateError);
    }

    let strategyCall = null;
    let emailSent = false;

    // Auto-advance if score >= 35
    if (shouldAutoAdvance && discoveryCall.contacts) {
      console.log('[Discovery Analysis] 🎯 QUALIFIED - Creating strategy call');

      const { data: newstrategyCall, error: strategyError } = await supabase
        .from('strategy_calls')
        .insert([{
          contact_id: discoveryCall.contacts.id,
          discovery_call_id: discovery_call_id,
          status: 'scheduled',
          recommended_tier: analysis.recommendation.tier,
          recommended_systems: analysis.recommendation.specificSystems,
          estimated_value: analysis.recommendation.estimatedValue,
          implementation_timeline: analysis.recommendation.implementationTimeline,
          notes: `Auto-created from discovery (Score: ${analysis.totalScore}/50)\n\nTier: ${analysis.recommendation.tier}\n\nSystems:\n${analysis.recommendation.specificSystems.map(s => `- ${s}`).join('\n')}\n\n${analysis.executiveSummary}`,
          auto_created: true,
          source: 'Automated from Discovery',
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (strategyError) {
        console.error('[Discovery Analysis] Error creating strategy call:', strategyError);
      } else {
        strategyCall = newstrategyCall;
        console.log('[Discovery Analysis] ✅ Strategy call created:', strategyCall.id);

        // Update contact stage
        await supabase
          .from('contacts')
          .update({ 
            stage: 'strategy',
            recommended_tier: analysis.recommendation.tier,
            updated_at: new Date().toISOString()
          })
          .eq('id', discoveryCall.contacts.id);

        
      // Send strategy invitation via SmartLead
try {
  const handoffUrl = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}/api/smartlead-handoff`
    : 'http://localhost:3000/api/smartlead-handoff';

  const emailResponse = await fetch(handoffUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      contactId: strategyCall.id,
      trigger: 'discovery_qualified',
      campaignType: 'strategy'
    })
  });

  const emailResult = await emailResponse.json();
  
  if (emailResult.success) {
    emailSent = true;
    console.log('[Discovery Analysis] ✅ Strategy invitation sent via SmartLead');
  } else {
    console.error('[Discovery Analysis] ❌ SmartLead failed:', emailResult.error);
  }
} catch (emailError) {
  console.error('[Discovery Analysis] ❌ Email error:', emailError);
}
      

    // Handle review/nurture cases
    if (requiresReview) {
      console.log('[Discovery Analysis] ⚠️ REVIEW NEEDED');
    }

    if (shouldNurture && discoveryCall.contacts) {
      console.log('[Discovery Analysis] 📧 NURTURE - Moving to nurture');
      await supabase
        .from('contacts')
        .update({ 
          stage: 'nurture',
          updated_at: new Date().toISOString()
        })
        .eq('id', discoveryCall.contacts.id);
    }

    return res.status(200).json({
      success: true,
      data: {
        discoveryCallId: discovery_call_id,
        contactName,
        company,
        analysis,
        action: finalAction,
        status: finalStatus,
        recommendedTier: analysis.recommendation.tier,
        recommendedSystems: analysis.recommendation.specificSystems,
        estimatedValue: analysis.recommendation.estimatedValue,
        strategyCallCreated: !!strategyCall,
        strategyCallId: strategyCall?.id,
        emailSent,
        message: shouldAutoAdvance 
          ? `🎯 QUALIFIED (${analysis.totalScore}/50) - ${analysis.recommendation.tier}, Strategy Call created!`
          : requiresReview
          ? `⚠️ REVIEW (${analysis.totalScore}/50) - ${analysis.recommendation.tier}, needs evaluation`
          : `📧 NURTURE (${analysis.totalScore}/50) - Not ready, moved to nurture`
      }
    });

  } catch (error) {
    console.error('[Discovery Analysis] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// ============================================
// HANDLER: ANALYZE STRATEGY CALL
// ============================================
async function handleAnalyzestrategy(req, res) {
  try {
    const { strategy_call_id, transcript } = req.body;

    if (!strategy_call_id || !transcript) {
      return res.status(400).json({ 
        success: false,
        error: 'strategy_call_id and transcript are required' 
      });
    }

    console.log('[strategy Analysis] Analyzing call:', strategy_call_id);

    // Get strategy call record
    const { data: strategyCall, error: strategyError } = await supabase
      .from('strategy_calls')
      .select('*, contacts(*), discovery_calls(*)')
      .eq('id', strategy_call_id)
      .single();

    if (strategyError || !strategyCall) {
      return res.status(404).json({ 
        success: false,
        error: 'strategy call not found' 
      });
    }

    // Analyze transcript
    const analysisPrompt = `You are analyzing a strategy/strategy call transcript to determine if the prospect agreed to purchase The Leadership Intelligence System™.

TRANSCRIPT:
${transcript}

Analyze this strategy call and respond with a JSON object:
{
  "agreed_to_deal": true/false,
  "deal_value": number (in USD, or null if not discussed),
  "payment_terms": "upfront/payment plan/not discussed",
  "start_date": "date mentioned or null",
  "key_commitments": ["commitment 1", "commitment 2"],
  "objections_handled": ["objection 1", "objection 2"] or [],
  "decision_factors": ["factor 1", "factor 2"],
  "next_steps": ["step 1", "step 2"],
  "confidence_level": "high/medium/low",
  "competitor_mentions": ["competitor 1"] or [],
  "urgency": "immediate/this month/this quarter/low",
  "summary": "2-3 sentence summary of the outcome"
}

Focus on whether they explicitly or implicitly agreed to move forward with The Leadership Intelligence System™ program.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: analysisPrompt
      }]
    });

    // Parse response
    const analysisText = message.content[0].text;
    const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse analysis from Claude');
    }

    const analysis = JSON.parse(jsonMatch[0]);
    console.log('[strategy Analysis] Result:', analysis.agreed_to_deal ? 'DEAL CLOSED' : 'No deal');

    // Update strategy call
    const { error: updateError } = await supabase
      .from('strategy_calls')
      .update({
        transcript: transcript,
        key_commitments: analysis.key_commitments,
        objections_handled: analysis.objections_handled,
        decision_factors: analysis.decision_factors,
        next_steps: analysis.next_steps,
        confidence_level: analysis.confidence_level,
        urgency: analysis.urgency,
        notes: analysis.summary,
        status: analysis.agreed_to_deal ? 'Won' : 'Completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', strategy_call_id);

    if (updateError) {
      console.error('[strategy Analysis] Error updating:', updateError);
      throw updateError;
    }

    let deal = null;

    // Create deal if agreed
    if (analysis.agreed_to_deal) {
      console.log('[strategy Analysis] 🎉 DEAL CLOSED! Creating deal record...');

      const dealValue = analysis.deal_value || 15000;

      const { data: newDeal, error: dealError } = await supabase
        .from('deals')
        .insert({
          contact_id: strategyCall.contact_id,
          strategy_call_id: strategy_call_id,
          deal_name: `${strategyCall.contacts.company || strategyCall.contacts.name} - Leadership Intelligence System™`,
          deal_value: dealValue,
          payment_terms: analysis.payment_terms || 'Not discussed',
          start_date: analysis.start_date,
          stage: 'Closed Won',
          confidence_level: analysis.confidence_level,
          urgency: analysis.urgency,
          next_steps: analysis.next_steps,
          notes: analysis.summary,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (dealError) {
        console.error('[strategy Analysis] Error creating deal:', dealError);
      } else {
        deal = newDeal;
        console.log('[strategy Analysis] ✅ Deal created:', deal.id);

        // Update contact to Client
        await supabase
          .from('contacts')
          .update({
            stage: 'Client',
            updated_at: new Date().toISOString()
          })
          .eq('id', strategyCall.contact_id);

        console.log('[strategy Analysis] Contact updated to Client');
      }
    }

    return res.status(200).json({
      success: true,
      strategy_call_id,
      agreed_to_deal: analysis.agreed_to_deal,
      analysis,
      deal_created: !!deal,
      deal_id: deal?.id,
      deal_value: deal?.deal_value,
      message: analysis.agreed_to_deal 
        ? `🎉 Deal closed! ${strategyCall.contacts.name} is now a client. Value: $${deal?.deal_value}` 
        : 'strategy call analyzed: Prospect did not agree to deal.'
    });

  } catch (error) {
    console.error('[strategy Analysis] Error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Internal server error', 
      details: error.message 
    });
  }
}

// ============================================
// HELPER FUNCTIONS: PODCAST ANALYSIS
// ============================================
async function analyzePodcastTranscript(transcript) {
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

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }]
  });

  const responseText = message.content[0].text;
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  
  if (!jsonMatch) {
    throw new Error('Failed to extract JSON from AI response');
  }

  return JSON.parse(jsonMatch[0]);
}

function calculatePodcastScore(analysis) {
  const introScore = analysis.intro.total_score;
  const questionsScore = analysis.questions_flow.total_score;
  const closeScore = analysis.close_next_steps.total_score;
  
  const totalOutOf30 = introScore + questionsScore + closeScore;
  const overallScore = (totalOutOf30 / 30) * 50;
  
  return Math.round(overallScore * 100) / 100;
}

async function createDiscoveryCall(interview, analysis, score) {
  const contact = interview.contacts || {};
  const agreementContext = analysis.prospect_agreement.context || 'See podcast analysis';
  const agreementEvidence = analysis.prospect_agreement.evidence?.join('\n') || '';
  const informationGaps = analysis.overall_insights?.information_gaps?.join('\n') || 'None';

  const { data: discoveryCall, error } = await supabase
    .from('discovery_calls')
    .insert([{
      contact_name: contact.name || interview.guest_name,
      email: contact.email || interview.guest_email,
      company: contact.company || interview.company,
      call_source: 'podcast_qualified',
      call_status: 'scheduled',
      podcast_interview_id: interview.id,
      notes: `🤖 Auto-created from podcast (Qualified: Agreed + Score ≥35)

📊 AI SCORE: ${score}/50

✅ PROSPECT AGREEMENT:
${agreementContext}

Evidence: ${agreementEvidence}

💡 STRENGTHS: ${analysis.overall_insights?.key_strengths?.join(', ') || 'See analysis'}

⚠️ GAPS: ${informationGaps}

🎯 FIT: ${analysis.overall_insights?.guest_fit_assessment || 'Review analysis'}`,
      created_at: new Date().toISOString()
    }])
    .select();

  if (error) throw error;

  // Link discovery call to interview
  await supabase
    .from('podcast_interviews')
    .update({
      discovery_call_created: true,
      discovery_call_id: discoveryCall[0].id
    })
    .eq('id', interview.id);

  console.log(`[Podcast Analysis] ✅ Discovery call created: ${discoveryCall[0].id}`);
  return discoveryCall[0];
}

async function sendDiscoveryInvitation(discoveryCallId) {
  try {
    const handoffUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}/api/smartlead-handoff`
      : 'http://localhost:3000/api/smartlead-handoff';

    const response = await fetch(handoffUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contactId: discoveryCallId,
        trigger: 'podcast_completed',
        campaignType: 'discovery'
      })
    });

    const result = await response.json();
    
    if (result.success) {
      console.log('[Podcast Analysis] ✅ Discovery invitation sent via SmartLead');
    } else {
      console.error('[Podcast Analysis] ⚠️ SmartLead failed:', result.error);
    }

    return result;
  } catch (error) {
    console.error('[Podcast Analysis] Error sending invitation:', error);
    return { success: false, error: error.message };
  }
}

    const result = await response.json();
    
    if (result.success) {
      console.log('[Podcast Analysis] ✅ Discovery invitation sent');
    } else {
      console.error('[Podcast Analysis] ⚠️ Failed to send invitation:', result.error);
    }

    return result;
  } catch (error) {
    console.error('[Podcast Analysis] Error sending invitation:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// HELPER FUNCTIONS: DISCOVERY ANALYSIS
// ============================================
async function analyzeDiscoveryTranscript(transcript) {
  const prompt = `You are analyzing a discovery call transcript for Maggie Forbes Strategies, a B2B growth consultancy specializing in AI-powered systems deployment.

TRANSCRIPT:
${transcript}

SCORING RUBRIC (50 Points Total):

1. ORGANIZATIONAL MATURITY & SCALE (15 points):
   - 15 pts: $10M+ revenue, established operations, 50+ employees
   - 10 pts: $5-10M revenue, scaling phase, 20-50 employees
   - 5 pts: $3-5M revenue, early growth, under 20 employees
   - 0 pts: Under $3M or unclear

2. SYSTEMS SOPHISTICATION NEED (10 points):
   - 10 pts: Needs comprehensive AI systems (intent, personalization, orchestration)
   - 7 pts: Needs 3-5 systems deployed
   - 4 pts: Needs 1-2 systems or foundational work
   - 0 pts: No clear systems need

3. TIMELINE/URGENCY (10 points):
   - 10 pts: Ready to start within 1-2 weeks
   - 7 pts: Within 1 month
   - 4 pts: 1-3 months
   - 0 pts: 3+ months or vague

4. DECISION AUTHORITY (10 points):
   - 10 pts: Owner/CEO/decision maker with budget authority
   - 7 pts: VP/Director with decision power
   - 4 pts: Manager who needs approval
   - 0 pts: No authority or unclear

5. PAIN SEVERITY & STRATEGIC CHALLENGES (10 points):
   - 10 pts: Critical growth bottlenecks with quantified $ impact
   - 7 pts: Clear strategic challenges, specific pain points
   - 4 pts: Some challenges identified
   - 0 pts: Vague or no specific pain

6. PARTNERSHIP READINESS (5 points):
   - 5 pts: Committed to systematic transformation, not quick fixes
   - 3 pts: Open to partnership approach
   - 0 pts: Looking for tactical help only

PARTNERSHIP TIER RECOMMENDATIONS:

**STRATEGIC FOUNDATIONS ($25K-75K, 90-day projects)**
RECOMMEND IF:
- Revenue $3M-10M, established but not yet scaled
- Needs strategic clarity before implementation
- Unclear on what systems they need
- Wants roadmap and diagnostic work
- Score typically: 20-35/50

DELIVERS:
- Complete systems audit & tech stack analysis
- Data intelligence framework setup
- Growth systems design blueprint
- 12-month implementation roadmap
- ROI modeling and success metrics

**GROWTH ARCHITECTURE ($150K+ annual partnerships)**
RECOMMEND IF:
- Revenue $10M+, ready to scale systematically
- Clear on problems, needs comprehensive implementation
- Wants ongoing partnership with full AI systems deployment
- Needs 5+ systems integrated over 6-12 months
- Score typically: 35-45/50

DELIVERS (Phase 1-3 over 12 months):
PHASE 1 (Months 1-2):
- Intent-based prospecting systems (6sense/ZoomInfo + Clay)
- AI-powered personalization engine (Clay + OpenAI)
- Interactive assessment tools (Typeform/Outgrow)
- Multi-channel orchestration (Outreach/Instantly + LinkedIn)

PHASE 2 (Months 3-6):
- Agentic AI SDR (Outreach with Kaia + AI)
- Content atomization engine (Descript + Castmagic)
- Partnership program infrastructure (PartnerStack + Crossbeam)
- Buyer enablement suite (Navattic + Dock)

PHASE 3 (Months 6-12):
- ABM orchestration for top accounts (Demandbase/Terminus)
- AI video personalization (Synthesia/HeyGen)
- Private executive community (Circle)

**STRATEGIC ALLIANCE (Custom, by invitation only)**
RECOMMEND IF:
- Premium organization ($20M+ revenue)
- Seeks permanent thinking partner, not vendor
- Long-term strategic relationship desired
- Executive-level partnership focus
- Score typically: 45-50/50

DELIVERS:
- Everything in Architecture tier
- Unlimited strategic counsel
- Fractional growth executive role
- Board-level strategic planning
- Priority access and white-glove service

AI SYSTEMS MENU (select specific ones they need):
1. Intent-based prospecting systems (6sense/ZoomInfo + Clay)
2. AI-powered personalization engine (Clay + OpenAI)
3. Interactive assessment tools (Typeform/Outgrow)
4. Multi-channel orchestration (Outreach/Instantly + LinkedIn)
5. Agentic AI SDR (Outreach with Kaia)
6. Content atomization engine (Descript + Castmagic)
7. Partnership program infrastructure (PartnerStack + Crossbeam)
8. Buyer enablement suite (Navattic + Dock + PandaDoc)
9. ABM orchestration (Demandbase/Terminus)
10. AI video personalization (Synthesia/HeyGen)
11. Executive community platform (Circle)
12. Data intelligence framework (Segment/RudderStack)

Respond in this EXACT JSON format:
{
  "totalScore": [number 0-50],
  "organizationalMaturity": {
    "score": [number 0-15],
    "evidence": "[quote or observation]",
    "revenueRange": "[estimate if mentioned]",
    "employeeCount": "[estimate if mentioned]"
  },
  "systemsSophistication": {
    "score": [number 0-10],
    "evidence": "[quote or observation]",
    "currentSystems": ["system 1", "system 2"],
    "gaps": ["gap 1", "gap 2"]
  },
  "timeline": {
    "score": [number 0-10],
    "evidence": "[quote or observation]",
    "estimatedTimeline": "[1-2 weeks/1 month/1-3 months/3+ months]"
  },
  "decisionAuthority": {
    "score": [number 0-10],
    "evidence": "[quote or observation]",
    "role": "[Owner/CEO/VP/Manager/Unclear]"
  },
  "painSeverity": {
    "score": [number 0-10],
    "evidence": "[quote or observation]",
    "keyPainPoints": ["pain point 1", "pain point 2", "pain point 3"]
  },
  "partnershipReadiness": {
    "score": [number 0-5],
    "evidence": "[quote or observation]"
  },
  "recommendation": {
    "status": "QUALIFIED|REVIEW|NURTURE",
    "tier": "Strategic Foundations|Growth Architecture|Strategic Alliance",
    "reasoning": "[2-3 sentence explanation of why this tier fits]",
    "specificSystems": [
      "Intent-based prospecting systems",
      "AI-powered personalization engine",
      "[other systems from menu above]"
    ],
    "estimatedValue": "$25K-75K|$150K-200K|$200K+|Custom",
    "implementationTimeline": "90 days|6-12 months|Ongoing partnership"
  },
  "nextSteps": {
    "autoAdvance": [true if score >= 35, false otherwise],
    "action": "Create Strategy Call|Manual Review|Move to Nurture",
    "notes": "[any important flags or considerations]"
  },
  "executiveSummary": "[3-4 sentence summary of the call, their challenges, and why this tier/systems package is right for them]",
  "enthusiasmLevel": "high|medium|low",
  "strategicFit": "excellent|good|moderate|poor"
}

Be precise. Score conservatively. Base everything on actual evidence from the transcript. Select specific systems from the menu based on their stated problems and gaps.`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }]
  });

  const responseText = message.content[0].text;
  const cleanedResponse = responseText
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();
  
  return JSON.parse(cleanedResponse);
}

// ============================================
// MAIN ENDPOINT HANDLER
// ============================================
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET - Status check
  if (req.method === 'GET') {
    return res.status(200).json({ 
      status: 'ok', 
      message: 'AI Analyzer endpoint is running',
      actions: ['analyze-prequal', 'analyze-podcast', 'analyze-discovery', 'analyze-strategy'],
      timestamp: new Date().toISOString()
    });
  }

  // POST - Route to appropriate handler
  if (req.method === 'POST') {
    const { action } = req.body;

    switch (action) {
      case 'analyze-prequal':
        return handleAnalyzePrequal(req, res);
      
      case 'analyze-podcast':
        return handleAnalyzePodcast(req, res);
      
      case 'analyze-discovery':
        return handleAnalyzeDiscovery(req, res);
      
      case 'analyze-strategy':
        return handleAnalyzestrategy(req, res);
      
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid action',
          message: 'Action must be one of: analyze-prequal, analyze-podcast, analyze-discovery, analyze-strategy'
        });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
