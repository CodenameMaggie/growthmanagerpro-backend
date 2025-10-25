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

    console.log('Analyzing discovery call:', discovery_call_id);

    // Get the discovery call record
    const { data: discoveryCall, error: discoveryError } = await supabase
      .from('discovery_calls')
      .select('*, contacts(*)')
      .eq('id', discovery_call_id)
      .single();

    if (discoveryError || !discoveryCall) {
      return res.status(404).json({ error: 'Discovery call not found' });
    }

    // Analyze transcript with Claude
    const analysisPrompt = `You are analyzing a discovery call transcript to determine if the prospect agreed to see the offer/proposal.

TRANSCRIPT:
${transcript}

Analyze this discovery call and respond with a JSON object:
{
  "agreed_to_see_offer": true/false,
  "key_points": ["point 1", "point 2", "point 3"],
  "pain_points": ["pain 1", "pain 2"],
  "budget_mentioned": "budget range or null",
  "timeline": "timeline mentioned or null",
  "decision_maker": true/false,
  "next_step_clarity": "clear/unclear/none",
  "enthusiasm_level": "high/medium/low",
  "objections": ["objection 1", "objection 2"] or [],
  "summary": "2-3 sentence summary of the call"
}

Focus on whether they explicitly or implicitly agreed to see your offer/proposal for The Leadership Intelligence System™.`;

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
    console.log('Analysis result:', analysis);

    // Update discovery call with analysis
    const { error: updateError } = await supabase
      .from('discovery_calls')
      .update({
        transcript: transcript,
        key_points: analysis.key_points,
        pain_points: analysis.pain_points,
        budget_mentioned: analysis.budget_mentioned,
        timeline: analysis.timeline,
        decision_maker: analysis.decision_maker,
        enthusiasm_level: analysis.enthusiasm_level,
        objections: analysis.objections,
        notes: analysis.summary,
        status: analysis.agreed_to_see_offer ? 'Qualified' : 'Completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', discovery_call_id);

    if (updateError) {
      console.error('Error updating discovery call:', updateError);
      throw updateError;
    }

    let salesCall = null;
    let emailSent = false;

    // If they agreed to see offer, create sales call and send email
    if (analysis.agreed_to_see_offer) {
      console.log('Prospect agreed! Creating sales call...');

      // Create sales call record
      const { data: newSalesCall, error: salesError } = await supabase
        .from('sales_calls')
        .insert({
          contact_id: discoveryCall.contact_id,
          discovery_call_id: discovery_call_id,
          source: 'Automated from Discovery',
          status: 'Scheduled',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (salesError) {
        console.error('Error creating sales call:', salesError);
      } else {
        salesCall = newSalesCall;
        console.log('Sales call created:', salesCall.id);

        // Send strategy call email via Instantly
        try {
          const emailResponse = await fetch(`${process.env.VERCEL_URL || 'https://growthmanagerpro-backend.vercel.app'}/api/instantly-send-strategy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sales_call_id: salesCall.id })
          });

          if (emailResponse.ok) {
            emailSent = true;
            console.log('Strategy call email sent successfully');
          } else {
            console.error('Failed to send strategy call email');
          }
        } catch (emailError) {
          console.error('Error sending strategy call email:', emailError);
        }
      }
    }

    return res.status(200).json({
      success: true,
      discovery_call_id,
      agreed_to_see_offer: analysis.agreed_to_see_offer,
      analysis,
      sales_call_created: !!salesCall,
      sales_call_id: salesCall?.id,
      email_sent: emailSent,
      message: analysis.agreed_to_see_offer 
        ? 'Discovery call analyzed: Prospect agreed! Sales call created and email sent.' 
        : 'Discovery call analyzed: Prospect did not agree to see offer.'
    });

  } catch (error) {
    console.error('Error analyzing discovery call:', error);
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message 
    });
  }
};
