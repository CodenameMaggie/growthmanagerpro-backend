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

    // If qualified, send podcast invitation
    if (analysis.qualified_for_podcast && analysis.qualification_score >= 35) {
      console.log('[Pre-Qual Analysis] ✅ QUALIFIED! Sending podcast invitation...');

      try {
        // Call instantly-manager to send podcast invite
        const inviteUrl = process.env.VERCEL_URL 
          ? `https://${process.env.VERCEL_URL}/api/instantly-manager`
          : 'http://localhost:3000/api/instantly-manager';

        const emailResponse = await fetch(inviteUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'send-podcast',
            callId: callId
          })
        });

        if (emailResponse.ok) {
          console.log('[Pre-Qual Analysis] ✅ Podcast invitation sent');
        } else {
          const errorText = await emailResponse.text();
          console.error('[Pre-Qual Analysis] ❌ Email failed:', errorText);
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

    let salesCall = null;
    let emailSent = false;

    // Auto-advance if score >= 35
    if (shouldAutoAdvance && discoveryCall.contacts) {
      console.log('[Discovery Analysis] 🎯 QUALIFIED - Creating strategy call');

      const { data: newSalesCall, error: salesError } = await supabase
        .from('sales_calls')
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

      if (salesError) {
        console.error('[Discovery Analysis] Error creating strategy call:', salesError);
      } else {
        salesCall = newSalesCall;
        console.log('[Discovery Analysis] ✅ Strategy call created:', salesCall.id);

        // Update contact stage
        await supabase
          .from('contacts')
          .update({ 
            stage: 'sales',
            recommended_tier: analysis.recommendation.tier,
            updated_at: new Date().toISOString()
          })
          .eq('id', discoveryCall.contacts.id);

        // Send strategy invitation via instantly-manager
        try {
          const inviteUrl = process.env.VERCEL_URL 
            ? `https://${process.env.VERCEL_URL}/api/instantly-manager`
            : 'http://localhost:3000/api/instantly-manager';

          const emailResponse = await fetch(inviteUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              action: 'send-strategy',
              sales_call_id: salesCall.id,
              contact_name: contactName,
              company: company,
              recommended_tier: analysis.recommendation.tier,
              systems: analysis.recommendation.specificSystems
            })
          });

          if (emailResponse.ok) {
            emailSent = true;
            console.log('[Discovery Analysis] ✅ Strategy invitation sent');
          }
        } catch (emailError) {
          console.error('[Discovery Analysis] ❌ Email error:', emailError);
        }
      }
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
        salesCallCreated: !!salesCall,
        salesCallId: salesCall?.id,
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
// HANDLER: ANALYZE SALES CALL
// ============================================
async function handleAnalyzeSales(req, res) {
  try {
    const { sales_call_id, transcript } = req.body;

    if (!sales_call_id || !transcript) {
      return res.status(400).json({ 
        success: false,
        error: 'sales_call_id and transcript are required' 
      });
    }

    console.log('[Sales Analysis] Analyzing call:', sales_call_id);

    // Get sales call record
    const { data: salesCall, error: salesError } = await supabase
      .from('sales_calls')
      .select('*, contacts(*), discovery_calls(*)')
      .eq('id', sales_call_id)
      .single();

    if (salesError || !salesCall) {
      return res.status(404).json({ 
        success: false,
        error: 'Sales call not found' 
      });
    }

    // Analyze transcript
    const analysisPrompt = `You are analyzing a sales/strategy call transcript to determine if the prospect agreed to purchase The Leadership Intelligence System™.

TRANSCRIPT:
${transcript}

Analyze this sales call and respond with a JSON object:
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
    console.log('[Sales Analysis] Result:', analysis.agreed_to_deal ? 'DEAL CLOSED' : 'No deal');

    // Update sales call
    const { error: updateError } = await supabase
      .from('sales_calls')
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
      .eq('id', sales_call_id);

    if (updateError) {
      console.error('[Sales Analysis] Error updating:', updateError);
      throw updateError;
    }

    let deal = null;

    // Create deal if agreed
    if (analysis.agreed_to_deal) {
      console.log('[Sales Analysis] 🎉 DEAL CLOSED! Creating deal record...');

      const dealValue = analysis.deal_value || 15000;

      const { data: newDeal, error: dealError } = await supabase
        .from('deals')
        .insert({
          contact_id: salesCall.contact_id,
          sales_call_id: sales_call_id,
          deal_name: `${salesCall.contacts.company || salesCall.contacts.name} - Leadership Intelligence System™`,
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
        console.error('[Sales Analysis] Error creating deal:', dealError);
      } else {
        deal = newDeal;
        console.log('[Sales Analysis] ✅ Deal created:', deal.id);

        // Update contact to Client
        await supabase
          .from('contacts')
          .update({
            stage: 'Client',
            updated_at: new Date().toISOString()
          })
          .eq('id', salesCall.contact_id);

        console.log('[Sales Analysis] Contact updated to Client');
      }
    }

    return res.status(200).json({
      success: true,
      sales_call_id,
      agreed_to_deal: analysis.agreed_to_deal,
      analysis,
      deal_created: !!deal,
      deal_id: deal?.id,
      deal_value: deal?.deal_value,
      message: analysis.agreed_to_deal 
        ? `🎉 Deal closed! ${salesCall.contacts.name} is now a client. Value: $${deal?.deal_value}` 
        : 'Sales call analyzed: Prospect did not agree to deal.'
    });

  } catch (error) {
    console.error('[Sales Analysis] Error:', error);
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

Provide analysis in JSON format with: prospect_agreement, intro, questions_flow, close_next_steps, and overall_insights sections.

CRITICAL: Look for prospect agreement to schedule discovery call or next meeting. Set agreed_to_discovery to TRUE only if clear evidence exists.

Respond with complete JSON matching the podcast analysis schema.`;

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
    const inviteUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}/api/instantly-manager`
      : 'http://localhost:3000/api/instantly-manager';

    const response = await fetch(inviteUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'send-discovery',
        discovery_call_id: discoveryCallId
      })
    });

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
  // Truncated for length - full tier-based analysis prompt here
  const prompt = `Analyze this discovery call for tier-based recommendations (Strategic Foundations/Growth Architecture/Strategic Alliance). Respond with JSON including totalScore, organizationalMaturity, systemsSophistication, timeline, decisionAuthority, painSeverity, partnershipReadiness, and recommendation fields.

TRANSCRIPT:
${transcript}

Score 0-50 and recommend appropriate tier.`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 3000,
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
      actions: ['analyze-prequal', 'analyze-podcast', 'analyze-discovery', 'analyze-sales'],
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
      
      case 'analyze-sales':
        return handleAnalyzeSales(req, res);
      
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid action',
          message: 'Action must be one of: analyze-prequal, analyze-podcast, analyze-discovery, analyze-sales'
        });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
