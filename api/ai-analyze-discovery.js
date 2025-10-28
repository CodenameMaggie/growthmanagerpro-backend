const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
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

        // Analyze transcript with Claude AI - COMPREHENSIVE 50-POINT SCORING
        const analysisPrompt = `You are analyzing a discovery call transcript for Maggie Forbes Strategies, a B2B growth consultancy.

TRANSCRIPT:
${transcript}

SCORING RUBRIC (50 Points Total):

1. BUDGET SIGNALS (15 points):
   - 15 pts: Current revenue $10M+, clear growth budget discussed
   - 10 pts: Revenue $5-10M or budget signals present
   - 5 pts: Revenue $1-5M, some budget indicators
   - 0 pts: No budget signals or under $1M

2. TIMELINE/URGENCY (10 points):
   - 10 pts: Ready now or within 1 week
   - 7 pts: Within 2-4 weeks
   - 4 pts: 1-2 months
   - 0 pts: 3+ months or vague

3. DECISION AUTHORITY (10 points):
   - 10 pts: Owner/CEO/decision maker
   - 7 pts: VP/Director with authority
   - 4 pts: Manager who needs approval
   - 0 pts: No authority or unclear

4. PAIN SEVERITY (10 points):
   - 10 pts: Critical/urgent problems with $ impact stated
   - 7 pts: Clear pain points, quantified challenges
   - 4 pts: Some challenges identified
   - 0 pts: Vague or no specific pain

5. STRATEGIC FIT (5 points):
   - 5 pts: B2B service/contractor, growth-focused
   - 3 pts: B2B but different vertical
   - 0 pts: B2C or poor fit

6. AGREEMENT TO SEE OFFER (10 points):
   - 10 pts: Explicit "yes, send me proposal"
   - 7 pts: Verbal agreement, negotiated deal
   - 4 pts: Interested but needs more info
   - 0 pts: No clear agreement

ENGAGEMENT MODELS TO RECOMMEND:

1. STRATEGIC FOUNDATIONS ($Custom, 90-day): For leaders seeking clarity before scale
   - Recommend if: They're unclear what's wrong, need diagnostic, want roadmap
   
2. GROWTH ARCHITECTURE ($150K annually): For organizations ready to systematize and scale
   - Recommend if: Clear on problems, ready for implementation, ongoing partnership desired
   
3. STRATEGIC ALLIANCE (By invitation): For leaders who want permanent thinking partner
   - Recommend if: Premium client profile, want strategic partner not vendor, long-term focus

SPECIFIC SERVICES (flag if mentioned):
- Predictable Growth / Lead Generation / Dream 100
- Conversion Systems / Sales Process Optimization
- Authority Engine / Content / Thought Leadership
- Operational Freedom / Automation
- Strategic Clarity / Business Audit
- Branded Client Experience
- Data Clarity / Reporting
- Fractional Growth Partnership

Respond in this EXACT JSON format:
{
  "totalScore": [number 0-50],
  "budgetSignals": {
    "score": [number 0-15],
    "evidence": "[quote or observation]",
    "revenueRange": "[estimate if mentioned]"
  },
  "timeline": {
    "score": [number 0-10],
    "evidence": "[quote or observation]",
    "estimatedTimeline": "[ready now/1 week/2-4 weeks/1-2 months/3+ months]"
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
  "strategicFit": {
    "score": [number 0-5],
    "evidence": "[quote or observation]",
    "industry": "[industry name]"
  },
  "agreementToOffer": {
    "score": [number 0-10],
    "evidence": "[quote or observation]",
    "agreedToProposal": [true/false]
  },
  "recommendation": {
    "status": "HOT|WARM|NURTURE",
    "engagementModel": "Strategic Foundations|Growth Architecture|Strategic Alliance|Custom",
    "reasoning": "[2-3 sentence explanation]",
    "specificServices": ["service name 1", "service name 2"],
    "estimatedValue": "[dollar range if determinable]"
  },
  "nextSteps": {
    "autoAdvance": [true/false],
    "action": "Create Sales Call|Manual Review|Move to Nurture",
    "notes": "[any important flags or considerations]"
  },
  "executiveSummary": "[3-4 sentence summary of the call and why this is/isn't a good fit]",
  "enthusiasmLevel": "high|medium|low",
  "objections": ["objection 1", "objection 2"] or []
}

Be precise. Score conservatively. Base everything on actual evidence from the transcript.`;

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

        // Determine advancement based on score
        const shouldAutoAdvance = analysis.totalScore >= 40;
        const requiresReview = analysis.totalScore >= 30 && analysis.totalScore < 40;
        const shouldNurture = analysis.totalScore < 30;

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

        // Update discovery call with BOTH old fields (backward compatibility) AND new AI analysis
        const { error: updateError } = await supabase
            .from('discovery_calls')
            .update({
                // Store transcript
                transcript: transcript,
                
                // OLD FIELDS (for backward compatibility)
                key_points: analysis.painSeverity?.keyPainPoints || [],
                pain_points: analysis.painSeverity?.keyPainPoints || [],
                budget_mentioned: analysis.budgetSignals?.revenueRange || null,
                timeline: analysis.timeline?.estimatedTimeline || null,
                decision_maker: analysis.decisionAuthority?.role === 'Owner' || analysis.decisionAuthority?.role === 'CEO',
                enthusiasm_level: analysis.enthusiasmLevel || 'medium',
                objections: analysis.objections || [],
                notes: analysis.executiveSummary || '',
                
                // NEW FIELDS (comprehensive AI analysis)
                ai_analysis: analysis,
                ai_score: analysis.totalScore,
                status: finalStatus,
                analyzed_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', discovery_call_id);

        if (updateError) {
            console.error('[AI Analyzer] Error updating discovery call:', updateError);
        }

        let salesCall = null;
        let emailSent = false;

        // AUTO-ADVANCE: Create Sales Call if score >= 40
        if (shouldAutoAdvance && discoveryCall.contacts) {
            console.log('[AI Analyzer] 🎯 HOT LEAD - Auto-advancing to Sales Call');

            const salesCallData = {
                contact_id: discoveryCall.contacts.id,
                discovery_call_id: discovery_call_id,
                status: 'scheduled',
                notes: `Auto-created from discovery call (Score: ${analysis.totalScore}/50)\n\nRecommended Engagement: ${analysis.recommendation.engagementModel}\n\nKey Services: ${analysis.recommendation.specificServices.join(', ')}\n\n${analysis.executiveSummary}`,
                recommended_engagement: analysis.recommendation.engagementModel,
                recommended_services: analysis.recommendation.specificServices,
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
                console.error('[AI Analyzer] Error creating sales call:', salesError);
            } else {
                salesCall = newSalesCall;
                console.log('[AI Analyzer] ✅ Sales call created:', salesCall.id);

                // Update contact stage to "sales"
                await supabase
                    .from('contacts')
                    .update({ 
                        stage: 'sales',
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
                            engagement_model: analysis.recommendation.engagementModel
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

        // MANUAL REVIEW: Flag for review if 30-39 points
        if (requiresReview) {
            console.log('[AI Analyzer] ⚠️ WARM LEAD - Flagged for manual review');
        }

        // NURTURE: Move to nurture campaign if < 30 points
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
                salesCallCreated: !!salesCall,
                salesCallId: salesCall?.id,
                emailSent: emailSent,
                message: shouldAutoAdvance 
                    ? `🎯 HOT LEAD (${analysis.totalScore}/50) - Sales Call created and strategy email sent!`
                    : requiresReview
                    ? `⚠️ WARM LEAD (${analysis.totalScore}/50) - Flagged for your review`
                    : `📧 NURTURE (${analysis.totalScore}/50) - Moved to nurture campaign`
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
