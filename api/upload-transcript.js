const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Manual Transcript Upload API
 *
 * POST /api/upload-transcript-api
 * Body: { callId: "uuid", transcript: "cleaned transcript text" }
 *
 * Updates a pre-qualification call with transcript and triggers AI analysis
 */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Tenant-ID');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    const { callId, transcript } = req.body;

    // Validate required fields
    if (!callId || !transcript) {
      return res.status(400).json({
        success: false,
        error: 'callId and transcript are required'
      });
    }

    console.log('[Upload Transcript] Processing upload for call:', callId);

    // Update pre-qual call with transcript
    const { data: updatedCall, error: updateError } = await supabase
      .from('pre_qualification_calls')
      .update({
        transcript: transcript,
        call_status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', callId)
      .select('id, guest_name, tenant_id')
      .single();

    if (updateError) {
      console.error('[Upload Transcript] Update error:', updateError);
      throw new Error('Failed to update call record: ' + updateError.message);
    }

    if (!updatedCall) {
      return res.status(404).json({
        success: false,
        error: 'Call not found'
      });
    }

    console.log('[Upload Transcript] ✅ Transcript saved for:', updatedCall.guest_name);

    // Auto-trigger AI analysis
    try {
      console.log('[Upload Transcript] Triggering AI analysis...');

      const analysisResponse = await fetch('https://growthmanagerpro-backend.vercel.app/api/ai-analyzer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'analyze-prequal',
          callId: callId  // Database ID
        })
      });

      const analysisResult = await analysisResponse.json();

      if (analysisResult.success) {
        console.log('[Upload Transcript] ✅ AI analysis complete');

        return res.status(200).json({
          success: true,
          message: 'Transcript uploaded and analyzed successfully',
          callId: callId,
          guestName: updatedCall.guest_name,
          analysis: {
            qualified: analysisResult.qualified,
            score: analysisResult.score
          }
        });
      } else {
        console.warn('[Upload Transcript] ⚠️ AI analysis failed:', analysisResult.error);

        // Still return success for transcript upload
        return res.status(200).json({
          success: true,
          message: 'Transcript uploaded successfully (AI analysis pending)',
          callId: callId,
          guestName: updatedCall.guest_name,
          warning: 'AI analysis failed to run: ' + analysisResult.error
        });
      }

    } catch (analysisError) {
      console.error('[Upload Transcript] AI analysis error:', analysisError);

      // Still return success for transcript upload
      return res.status(200).json({
        success: true,
        message: 'Transcript uploaded successfully (AI analysis failed)',
        callId: callId,
        guestName: updatedCall.guest_name,
        warning: 'AI analysis could not be triggered'
      });
    }

  } catch (error) {
    console.error('[Upload Transcript] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};
