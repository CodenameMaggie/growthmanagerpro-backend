const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

module.exports = async (req, res) => {
    // Enable CORS
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
        const { discovery_call_id, transcript } = req.body;

        if (!discovery_call_id || !transcript) {
            return res.status(400).json({ 
                error: 'Missing required fields: discovery_call_id and transcript are required' 
            });
        }

        console.log('[AI Analyzer] Processing discovery call:', discovery_call_id);

        // Get the discovery call record with contact info
        const { data: discoveryCall, error: discoveryError } = await supabase
            .from('discovery_calls')
            .select('*, contacts(*)')
            .eq('id', discovery_call_id)
            .single();

        if (discoveryError || !discoveryCall) {
            return res.status(404).json({ error: 'Discovery call not found' });
        }

        const contactName = discoveryCall.contacts?.name || 'Unknown';
        const company = discoveryCall.contacts?.company || 'Unknown Company';

        // Analyze transcript with Claude AI - TIER-BASED SYSTEM RECOMMENDATIONS
        const analysisPrompt = `You are analyzing a discovery call transcript for Maggie Forbes Strategies, a B2B growth consultancy specializing in AI-powered systems deployment.

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

        console.log('[AI Analyzer] Sending transcript to Claude AI...');

        const message = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4000,
            messages: [{
                role: 'user',
                content: analysisPrompt
            }]
        });

        const responseText = message.content[0].text;
        console.log('[AI Analyzer] Received analysis from Claude');

        // Parse the JSON response
        let analysis;
        try {
            // Remove markdown code blocks if present
            const cleanedResponse = responseText
                .replace(/```json\n?/g, '')
                .replace(/```\n?/g, '')
                .trim();
            analysis = JSON.parse(cleanedResponse);
        } catch (parseError) {
            console.error('[AI Analyzer] JSON parse error:', parseError);
            return res.status(500).json({ 
                error: 'Failed to parse AI response',
                details: responseText
            });
        }

        // Determine advancement based on score and tier
        const shouldAutoAdvance = analysis.totalScore >= 35;
        const requiresReview = analysis.totalScore >= 25 && analysis.totalScore < 35;
        const shouldNurture = analysis.totalScore < 25;

        let finalStatus;
        let finalAction;
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

        // Update discovery call with tier-based analysis
        const { error: updateError } = await supabase
            .from('discovery_calls')
            .update({
                transcript: transcript,
                
                // Store comprehensive tier analysis
                ai_analysis: {
                    ...analysis,
                    recommendation: {
                        ...analysis.recommendation,
                        engagementModel: analysis.recommendation.tier // Map tier to old field name
                    }
                },
                ai_score: analysis.totalScore,
                recommended_tier: analysis.recommendation.tier,
                recommended_systems: analysis.recommendation.specificSystems,
                status: finalStatus,
                
                // Legacy fields for backward compatibility
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
            console.error('[AI Analyzer] Error updating discovery call:', updateError);
        }

        let salesCall = null;
        let emailSent = false;

        // AUTO-ADVANCE: Create Strategy Call if score >= 35
        if (shouldAutoAdvance && discoveryCall.contacts) {
            console.log('[AI Analyzer] 🎯 QUALIFIED - Auto-advancing to Strategy Call');

            const salesCallData = {
                contact_id: discoveryCall.contacts.id,
                discovery_call_id: discovery_call_id,
                status: 'scheduled',
                recommended_tier: analysis.recommendation.tier,
                recommended_systems: analysis.recommendation.specificSystems,
                estimated_value: analysis.recommendation.estimatedValue,
                implementation_timeline: analysis.recommendation.implementationTimeline,
                notes: `Auto-created from discovery call (Score: ${analysis.totalScore}/50)\n\nRecommended Tier: ${analysis.recommendation.tier}\n\nKey Systems Needed:\n${analysis.recommendation.specificSystems.map(s => `- ${s}`).join('\n')}\n\n${analysis.executiveSummary}`,
                auto_created: true,
                source: 'Automated from Discovery',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            const { data: newSalesCall, error: salesError } = await supabase
                .from('sales_calls')
                .insert([salesCallData])
                .select()
                .single();

            if (salesError) {
                console.error('[AI Analyzer] Error creating strategy call:', salesError);
            } else {
                salesCall = newSalesCall;
                console.log('[AI Analyzer] ✅ Strategy call created:', salesCall.id);

                // Update contact stage to "sales"
                await supabase
                    .from('contacts')
                    .update({ 
                        stage: 'sales',
                        recommended_tier: analysis.recommendation.tier,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', discoveryCall.contacts.id);

                // SEND INSTANTLY EMAIL - Strategy Call Invitation
                try {
                    const emailResponse = await fetch(`${process.env.VERCEL_URL || 'https://growthmanagerpro-backend.vercel.app'}/api/instantly-send-strategy`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            sales_call_id: salesCall.id,
                            contact_name: contactName,
                            company: company,
                            recommended_tier: analysis.recommendation.tier,
                            systems: analysis.recommendation.specificSystems
                        })
                    });

                    if (emailResponse.ok) {
                        emailSent = true;
                        console.log('[AI Analyzer] ✅ Strategy call email sent via Instantly');
                    } else {
                        console.error('[AI Analyzer] ⚠️ Failed to send strategy call email');
                    }
                } catch (emailError) {
                    console.error('[AI Analyzer] ❌ Error sending strategy call email:', emailError);
                }
            }
        }

        // MANUAL REVIEW: Flag for review if 25-34 points
        if (requiresReview) {
            console.log('[AI Analyzer] ⚠️ REVIEW NEEDED - Flagged for manual evaluation');
        }

        // NURTURE: Move to nurture campaign if < 25 points
        if (shouldNurture) {
            console.log('[AI Analyzer] 📧 NURTURE - Moving to nurture campaign');
            
            if (discoveryCall.contacts) {
                await supabase
                    .from('contacts')
                    .update({ 
                        stage: 'nurture',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', discoveryCall.contacts.id);
            }
        }

        // Return complete analysis
        return res.status(200).json({
            success: true,
            data: {
                discoveryCallId: discovery_call_id,
                contactName: contactName,
                company: company,
                analysis: analysis,
                action: finalAction,
                status: finalStatus,
                recommendedTier: analysis.recommendation.tier,
                recommendedSystems: analysis.recommendation.specificSystems,
                estimatedValue: analysis.recommendation.estimatedValue,
                salesCallCreated: !!salesCall,
                salesCallId: salesCall?.id,
                emailSent: emailSent,
                message: shouldAutoAdvance 
                    ? `🎯 QUALIFIED (${analysis.totalScore}/50) - ${analysis.recommendation.tier} recommended, Strategy Call created!`
                    : requiresReview
                    ? `⚠️ REVIEW NEEDED (${analysis.totalScore}/50) - ${analysis.recommendation.tier} suggested, needs your evaluation`
                    : `📧 NURTURE (${analysis.totalScore}/50) - Not ready for partnership, moved to nurture`
            }
        });

    } catch (error) {
        console.error('[AI Analyzer] Error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
};
