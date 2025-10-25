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
    const { sales_call_id, transcript } = req.body;

    if (!sales_call_id || !transcript) {
      return res.status(400).json({ 
        error: 'Missing required fields: sales_call_id and transcript are required' 
      });
    }

    console.log('Analyzing sales call:', sales_call_id);

    // Get the sales call record
    const { data: salesCall, error: salesError } = await supabase
      .from('sales_calls')
      .select('*, contacts(*), discovery_calls(*)')
      .eq('id', sales_call_id)
      .single();

    if (salesError || !salesCall) {
      return res.status(404).json({ error: 'Sales call not found' });
    }

    // Analyze transcript with Claude
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

    // Parse Claude's response
    const analysisText = message.content[0].text;
    const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse analysis from Claude');
    }

    const analysis = JSON.parse(jsonMatch[0]);
    console.log('Analysis result:', analysis);

    // Update sales call with analysis
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
      console.error('Error updating sales call:', updateError);
      throw updateError;
    }

    let deal = null;

    // If they agreed to deal, create deal record
    if (analysis.agreed_to_deal) {
      console.log('Deal closed! Creating deal record...');

      // Determine deal value (default to Leadership Intelligence System price if not mentioned)
      const dealValue = analysis.deal_value || 15000; // Default to $15k if not specified

      // Create deal record
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
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (dealError) {
        console.error('Error creating deal:', dealError);
      } else {
        deal = newDeal;
        console.log('Deal created:', deal.id);

        // Update contact stage to "Client"
        await supabase
          .from('contacts')
          .update({
            stage: 'Client',
            updated_at: new Date().toISOString()
          })
          .eq('id', salesCall.contact_id);

        console.log('Contact stage updated to Client');
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
        ? `Deal closed! ${salesCall.contacts.name} is now a client. Deal value: $${deal?.deal_value}` 
        : 'Sales call analyzed: Prospect did not agree to deal.'
    });

  } catch (error) {
    console.error('Error analyzing sales call:', error);
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message 
    });
  }
};
