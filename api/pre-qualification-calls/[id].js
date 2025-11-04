const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Get ID from query params
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({
      success: false,
      error: 'Call ID is required'
    });
  }

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('pre_qualification_calls')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      if (!data) {
        return res.status(404).json({
          success: false,
          error: 'Call not found'
        });
      }

      return res.status(200).json({
        success: true,
        data: data
      });
    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  if (req.method === 'PUT') {
    try {
      const { 
        guest_name,
        guest_email,
        call_status,
        transcript,
        ai_score,
        ai_analysis,
        podcast_invitation_sent
      } = req.body;

      const updateData = {
        updated_at: new Date().toISOString()
      };
      
      if (guest_name) updateData.guest_name = guest_name;
      if (guest_email) updateData.guest_email = guest_email;
      if (call_status) updateData.call_status = call_status;
      if (transcript !== undefined) updateData.transcript = transcript;
      if (ai_score !== undefined) updateData.ai_score = ai_score;
      if (ai_analysis) updateData.ai_analysis = ai_analysis;
      if (podcast_invitation_sent !== undefined) updateData.podcast_invitation_sent = podcast_invitation_sent;

      const { data, error } = await supabase
        .from('pre_qualification_calls')
        .update(updateData)
        .eq('id', id)
        .select();

      if (error) throw error;

      if (!data || data.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Call not found'
        });
      }

      // ============================================================
      // SMARTLEAD HANDOFF TRIGGER
      // ============================================================
      // If AI score >= 35, automatically hand off to Smartlead
      if (ai_score !== undefined && ai_score >= 35) {
        console.log(`[Pre-Qual] Contact scored ${ai_score} - Triggering Smartlead handoff`);
        
        // Get the contact_id associated with this pre-qual call
        const { data: preQualCall, error: callError } = await supabase
          .from('pre_qualification_calls')
          .select('contact_id')
          .eq('id', id)
          .single();
        
        if (callError) {
          console.error('[Pre-Qual] Error fetching call:', callError);
        } else if (preQualCall && preQualCall.contact_id) {
          // Trigger Smartlead handoff asynchronously (don't block response)
          const handoffUrl = `${process.env.NEXT_PUBLIC_API_BASE || 'https://growthmanagerpro-backend.vercel.app'}/api/smartlead-handoff`;
          
          console.log(`[Pre-Qual] Calling handoff endpoint: ${handoffUrl}`);
          
          // Use fetch to call the handoff endpoint
          try {
            const handoffResponse = await fetch(handoffUrl, {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json' 
              },
              body: JSON.stringify({
                contactId: preQualCall.contact_id,
                trigger: 'pre_qual_qualified',
                preQualScore: ai_score
              })
            });
            
            if (!handoffResponse.ok) {
              const errorText = await handoffResponse.text();
              console.error(`[Pre-Qual] ❌ Handoff failed with status ${handoffResponse.status}:`, errorText);
            } else {
              const handoffResult = await handoffResponse.json();
              
              if (handoffResult.success) {
                console.log('[Pre-Qual] ✅ Successfully handed off to Smartlead');
                console.log('[Pre-Qual] Email:', handoffResult.email);
                console.log('[Pre-Qual] Campaign ID:', handoffResult.campaign_id);
              } else {
                console.error('[Pre-Qual] ❌ Handoff failed:', handoffResult.error);
              }
            }
          } catch (error) {
            console.error('[Pre-Qual] ❌ Error triggering Smartlead handoff:', error.message);
            // Don't fail the whole operation if handoff fails
          }
        } else {
          console.warn('[Pre-Qual] No contact_id found for pre-qual call');
        }
      }
      // ============================================================
      // END SMARTLEAD HANDOFF TRIGGER
      // ============================================================

      return res.status(200).json({
        success: true,
        data: data[0],
        message: 'Call updated successfully'
      });
    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { error } = await supabase
        .from('pre_qualification_calls')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return res.status(200).json({
        success: true,
        message: 'Call deleted successfully'
      });
    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
