const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

/**
 * ZOOM WEBHOOK DIAGNOSTIC - COMPLETE DATA FLOW TRACER
 * This will log every step to help identify where data is getting lost
 */
module.exports = async (req, res) => {
  const diagnosticLog = [];
  
  function log(step, status, details) {
    const entry = {
      timestamp: new Date().toISOString(),
      step,
      status,
      details
    };
    diagnosticLog.push(entry);
    console.log(`[DIAGNOSTIC ${status}] ${step}:`, details);
  }

  try {
    log('1. REQUEST_RECEIVED', 'INFO', {
      method: req.method,
      headers: Object.keys(req.headers),
      bodyExists: !!req.body
    });

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      log('2. OPTIONS_HANDLED', 'SUCCESS', 'Preflight request handled');
      return res.status(200).end();
    }

    if (req.method !== 'POST') {
      log('2. METHOD_CHECK', 'FAIL', `Wrong method: ${req.method}`);
      return res.status(405).json({ error: 'Method not allowed', diagnosticLog });
    }

    log('2. METHOD_CHECK', 'SUCCESS', 'POST method confirmed');

    // ============================================
    // STEP 3: CHECK ENVIRONMENT VARIABLES
    // ============================================
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const zoomWebhookSecret = process.env.ZOOM_WEBHOOK_SECRET;

    log('3. ENV_VARIABLES', 'INFO', {
      supabaseUrl: !!supabaseUrl,
      supabaseKey: !!supabaseKey ? `${supabaseKey.substring(0, 20)}...` : 'MISSING',
      zoomWebhookSecret: !!zoomWebhookSecret
    });

    if (!supabaseUrl || !supabaseKey) {
      log('3. ENV_VARIABLES', 'FAIL', 'Supabase credentials missing');
      return res.status(500).json({ 
        error: 'Supabase not configured',
        diagnosticLog 
      });
    }

    // ============================================
    // STEP 4: INITIALIZE SUPABASE CLIENT
    // ============================================
    let supabase;
    try {
      supabase = createClient(supabaseUrl, supabaseKey);
      log('4. SUPABASE_CLIENT', 'SUCCESS', 'Client initialized');
    } catch (error) {
      log('4. SUPABASE_CLIENT', 'FAIL', error.message);
      return res.status(500).json({ error: 'Supabase client failed', diagnosticLog });
    }

    // ============================================
    // STEP 5: TEST SUPABASE CONNECTION
    // ============================================
    try {
      const { data, error } = await supabase
        .from('podcast_interviews')
        .select('count')
        .limit(1);
      
      if (error) {
        log('5. SUPABASE_CONNECTION', 'FAIL', error.message);
        return res.status(500).json({ 
          error: 'Supabase query failed', 
          details: error,
          diagnosticLog 
        });
      }
      
      log('5. SUPABASE_CONNECTION', 'SUCCESS', 'Database accessible');
    } catch (error) {
      log('5. SUPABASE_CONNECTION', 'FAIL', error.message);
      return res.status(500).json({ error: 'Supabase connection test failed', diagnosticLog });
    }

    // ============================================
    // STEP 6: PARSE ZOOM WEBHOOK PAYLOAD
    // ============================================
    const { event, payload } = req.body;
    
    log('6. PAYLOAD_PARSE', 'INFO', {
      event: event,
      payloadKeys: payload ? Object.keys(payload) : 'none'
    });

    // ============================================
    // STEP 7: HANDLE VALIDATION
    // ============================================
    if (event === 'endpoint.url_validation') {
      if (!zoomWebhookSecret) {
        log('7. VALIDATION', 'FAIL', 'Webhook secret missing');
        return res.status(500).json({ error: 'Webhook secret not configured', diagnosticLog });
      }

      const plainToken = payload.plainToken;
      const encryptedToken = crypto
        .createHmac('sha256', zoomWebhookSecret)
        .update(plainToken)
        .digest('hex');

      log('7. VALIDATION', 'SUCCESS', 'Token encrypted');

      res.setHeader('Content-Type', 'application/json');
      return res.status(200).json({
        plainToken: plainToken,
        encryptedToken: encryptedToken,
        diagnosticLog
      });
    }

    // ============================================
    // STEP 8: HANDLE RECORDING COMPLETED
    // ============================================
    if (event === 'recording.completed') {
      const meetingId = payload.object.id;
      const topic = payload.object.topic;
      const recordingFiles = payload.object.recording_files;

      log('8. RECORDING_EVENT', 'INFO', {
        meetingId,
        topic,
        fileCount: recordingFiles?.length
      });

      // ============================================
      // STEP 9: TEST DIRECT WRITE TO SUPABASE
      // ============================================
      try {
        const testRecord = {
          zoom_meeting_id: meetingId,
          guest_name: 'DIAGNOSTIC_TEST_' + Date.now(),
          contact_email: 'test@diagnostic.com',
          interview_status: 'scheduled',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        log('9. TEST_WRITE_ATTEMPT', 'INFO', testRecord);

        const { data: insertData, error: insertError } = await supabase
          .from('podcast_interviews')
          .insert(testRecord)
          .select();

        if (insertError) {
          log('9. TEST_WRITE', 'FAIL', {
            code: insertError.code,
            message: insertError.message,
            details: insertError.details,
            hint: insertError.hint
          });
          
          return res.status(500).json({ 
            error: 'TEST WRITE FAILED - This is why data is not reaching Supabase',
            supabaseError: insertError,
            diagnosticLog 
          });
        }

        log('9. TEST_WRITE', 'SUCCESS', {
          recordId: insertData[0]?.id,
          message: 'Data CAN reach Supabase - issue is elsewhere'
        });

        // ============================================
        // STEP 10: PROCESS ACTUAL RECORDING
        // ============================================
        // Determine call type
        const callType = determineCallType(topic);
        log('10. CALL_TYPE', 'INFO', { topic, callType });

        if (!callType) {
          log('10. CALL_TYPE', 'SKIP', 'Not a tracked call type');
          return res.status(200).json({ 
            message: 'Not a tracked call type',
            diagnosticLog 
          });
        }

        // Process transcript files
        let transcriptFound = false;
        for (const file of recordingFiles) {
          if (file.file_type === 'TRANSCRIPT' || file.recording_type === 'audio_transcript') {
            transcriptFound = true;
            log('11. TRANSCRIPT_FOUND', 'SUCCESS', {
              fileType: file.file_type,
              recordingType: file.recording_type
            });
            break;
          }
        }

        if (!transcriptFound) {
          log('11. TRANSCRIPT_CHECK', 'WARN', 'No transcript file found in recording');
        }

        // ============================================
        // STEP 12: ATTEMPT REAL UPDATE
        // ============================================
        const updates = {
          zoom_meeting_id: meetingId,
          updated_at: new Date().toISOString()
        };

        let tableName;
        switch (callType) {
          case 'prequal':
            tableName = 'pre_qualification_calls';
            break;
          case 'podcast':
            tableName = 'podcast_interviews';
            break;
          case 'discovery':
            tableName = 'discovery_calls';
            break;
          case 'strategy':
            tableName = 'sales_calls';
            break;
        }

        log('12. UPDATE_ATTEMPT', 'INFO', { tableName, meetingId });

        // Check if record exists
        const { data: existing, error: findError } = await supabase
          .from(tableName)
          .select('id')
          .eq('zoom_meeting_id', meetingId)
          .single();

        if (findError && findError.code !== 'PGRST116') {
          log('12. FIND_RECORD', 'FAIL', findError.message);
        } else if (existing) {
          log('12. FIND_RECORD', 'SUCCESS', `Found existing record: ${existing.id}`);
          
          // Try to update
          const { error: updateError } = await supabase
            .from(tableName)
            .update(updates)
            .eq('id', existing.id);

          if (updateError) {
            log('13. UPDATE_RECORD', 'FAIL', updateError.message);
            return res.status(500).json({ 
              error: 'UPDATE FAILED',
              details: updateError,
              diagnosticLog 
            });
          }

          log('13. UPDATE_RECORD', 'SUCCESS', `Updated ${existing.id}`);
        } else {
          log('12. FIND_RECORD', 'INFO', 'No existing record, would need to insert');
        }

        return res.status(200).json({
          success: true,
          message: 'Recording processed with full diagnostics',
          diagnosticLog
        });
      } catch (error) {
        log('ERROR', 'FAIL', {
          message: error.message,
          stack: error.stack
        });
        
        return res.status(500).json({
          error: error.message,
          diagnosticLog
        });
      }
    }

    // Other events
    log('FINAL', 'INFO', `Event ${event} received but not fully processed`);
    return res.status(200).json({ 
      message: 'Event received',
      event,
      diagnosticLog 
    });

  } catch (error) {
    log('FATAL_ERROR', 'FAIL', {
      message: error.message,
      stack: error.stack
    });
    
    return res.status(500).json({
      error: error.message,
      diagnosticLog
    });
  }
};

function determineCallType(topic) {
  const topicLower = topic.toLowerCase();
  
  if (topicLower.includes('pre-qual') || topicLower.includes('prequal') || topicLower.includes('pre qual') || topicLower.includes('pre-podcast')) {
    return 'prequal';
  }
  if (topicLower.includes('podcast')) {
    return 'podcast';
  }
  if (topicLower.includes('discovery')) {
    return 'discovery';
  }
  if (topicLower.includes('strategy') || topicLower.includes('sales call')) {
    return 'strategy';
  }
  
  return null;
}
