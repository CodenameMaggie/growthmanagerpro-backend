const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const zoomClientId = process.env.ZOOM_CLIENT_ID;
const zoomClientSecret = process.env.ZOOM_CLIENT_SECRET;
const zoomAccountId = process.env.ZOOM_ACCOUNT_ID;
const zoomWebhookSecret = process.env.ZOOM_WEBHOOK_SECRET || 'temp-secret';

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Helper function to identify call type based on meeting title
 */
function identifyCallType(meetingTopic) {
  const topic = (meetingTopic || '').toLowerCase();
  
  if (topic.includes('podcast') || topic.includes('interview')) {
    return 'podcast';
  } else if (topic.includes('discovery') || topic.includes('discovery call')) {
    return 'discovery';
  } else if (topic.includes('strategy') || topic.includes('sales') || topic.includes('offer')) {
    return 'sales';
  }
  
  // Default to podcast if unclear
  return 'podcast';
}

/**
 * Enhanced Zoom Webhook Handler
 * Handles: validation, meeting.started, participant_joined, meeting.ended, recording.completed
 * Routes to: podcast_interviews, discovery_calls, or sales_calls based on meeting topic
 */
module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Handle GET request (for testing)
  if (req.method === 'GET') {
    return res.status(200).json({ 
      status: 'ok', 
      message: 'Enhanced Zoom webhook endpoint is running - Routes Podcast, Discovery, and Sales calls',
      timestamp: new Date().toISOString()
    });
  }

  // Handle POST request (Zoom events)
  if (req.method === 'POST') {
    try {
      const event = req.body;

      console.log('[Zoom Webhook] Event received:', event.event);

      // ========================================
      // HANDLE ZOOM VALIDATION CHALLENGE
      // ========================================
      if (event.event === 'endpoint.url_validation') {
        const plainToken = event.payload.plainToken;
        
        if (!plainToken) {
          console.log('[Zoom Webhook] No plainToken in validation request');
          return res.status(400).json({ error: 'No plainToken provided' });
        }

        const crypto = require('crypto');
        const encryptedToken = crypto
          .createHmac('sha256', zoomWebhookSecret || 'temp')
          .update(plainToken)
          .digest('hex');

        console.log('[Zoom Webhook] Validation challenge received and responded');
        
        return res.status(200).json({
          plainToken: plainToken,
          encryptedToken: encryptedToken
        });
      }

      // ========================================
      // VERIFY WEBHOOK SIGNATURE
      // ========================================
      if (zoomWebhookSecret && event.event !== 'endpoint.url_validation') {
        const isValid = verifyZoomWebhook(req.headers, req.body, zoomWebhookSecret);
        if (!isValid) {
          console.log('[Zoom Webhook] Invalid signature');
          return res.status(401).json({ error: 'Invalid webhook signature' });
        }
      }

      // ========================================
      // HANDLE MEETING STARTED EVENT
      // ========================================
      if (event.event === 'meeting.started') {
        console.log('[Zoom Webhook] Meeting started event');
        
        const meetingData = event.payload.object;
        const meetingId = meetingData.id;
        const topic = meetingData.topic;
        const startTime = meetingData.start_time;
        
        // Identify call type
        const callType = identifyCallType(topic);
        console.log('[Zoom Webhook] Identified call type:', callType);

        if (callType === 'podcast') {
          // Handle podcast interview
          const { data: existingInterview } = await supabase
            .from('podcast_interviews')
            .select('id, contact_id')
            .eq('zoom_meeting_id', meetingId.toString())
            .single();

          if (!existingInterview) {
            const { data: newInterview, error: createError } = await supabase
              .from('podcast_interviews')
              .insert({
                zoom_meeting_id: meetingId.toString(),
                scheduled_date: startTime,
                status: 'in_progress',
                notes: `Meeting started: ${topic}`
              })
              .select()
              .single();

            if (createError) {
              console.error('[Zoom Webhook] Error creating interview:', createError);
            } else {
              console.log('[Zoom Webhook] Created podcast interview record:', newInterview.id);
            }
          } else {
            await supabase
              .from('podcast_interviews')
              .update({ status: 'in_progress' })
              .eq('id', existingInterview.id);
            
            console.log('[Zoom Webhook] Updated podcast interview to in_progress');
          }
        } else if (callType === 'discovery') {
          // Handle discovery call
          const { data: existingCall } = await supabase
            .from('discovery_calls')
            .select('id')
            .gte('call_date', startTime)
            .order('call_date', { ascending: true })
            .limit(1)
            .single();

          if (existingCall) {
            await supabase
              .from('discovery_calls')
              .update({ 
                status: 'In Progress',
                zoom_meeting_id: meetingId.toString()
              })
              .eq('id', existingCall.id);
            
            console.log('[Zoom Webhook] Updated discovery call to In Progress');
          }
        } else if (callType === 'sales') {
          // Handle sales call
          const { data: existingCall } = await supabase
            .from('sales_calls')
            .select('id')
            .gte('call_date', startTime)
            .order('call_date', { ascending: true })
            .limit(1)
            .single();

          if (existingCall) {
            await supabase
              .from('sales_calls')
              .update({ 
                status: 'In Progress',
                zoom_meeting_id: meetingId.toString()
              })
              .eq('id', existingCall.id);
            
            console.log('[Zoom Webhook] Updated sales call to In Progress');
          }
        }

        return res.status(200).json({ success: true, message: 'Meeting started processed' });
      }

      // ========================================
      // HANDLE PARTICIPANT JOINED EVENT
      // ========================================
      if (event.event === 'meeting.participant_joined') {
        console.log('[Zoom Webhook] Participant joined event');
        
        const meetingData = event.payload.object;
        const meetingId = meetingData.id;
        const topic = meetingData.topic;
        const participant = meetingData.participant;
        const participantEmail = participant.email;

        if (!participantEmail) {
          console.log('[Zoom Webhook] No participant email available');
          return res.status(200).json({ message: 'No email' });
        }

        console.log('[Zoom Webhook] Participant email:', participantEmail);

        // Find contact by email
        const { data: contact } = await supabase
          .from('contacts')
          .select('id, email, name')
          .eq('email', participantEmail)
          .single();

        if (!contact) {
          console.log('[Zoom Webhook] No matching contact found for:', participantEmail);
          return res.status(200).json({ message: 'No matching contact' });
        }

        console.log('[Zoom Webhook] Found contact:', contact.name);

        // Identify call type
        const callType = identifyCallType(topic);

        if (callType === 'podcast') {
          // Link to podcast interview
          const { data: existingInterview } = await supabase
            .from('podcast_interviews')
            .select('id')
            .eq('zoom_meeting_id', meetingId.toString())
            .single();

          if (existingInterview) {
            await supabase
              .from('podcast_interviews')
              .update({ 
                contact_id: contact.id,
                status: 'in_progress'
              })
              .eq('id', existingInterview.id);
          } else {
            await supabase
              .from('podcast_interviews')
              .insert({
                zoom_meeting_id: meetingId.toString(),
                contact_id: contact.id,
                scheduled_date: new Date().toISOString(),
                status: 'in_progress'
              });
          }

          await supabase
            .from('contacts')
            .update({ 
              status: 'interviewing',
              last_contact_date: new Date().toISOString()
            })
            .eq('id', contact.id);
        } else if (callType === 'discovery') {
          // Link to discovery call
          const { data: existingCall } = await supabase
            .from('discovery_calls')
            .select('id')
            .eq('zoom_meeting_id', meetingId.toString())
            .single();

          if (existingCall) {
            await supabase
              .from('discovery_calls')
              .update({ contact_id: contact.id })
              .eq('id', existingCall.id);
          }
        } else if (callType === 'sales') {
          // Link to sales call
          const { data: existingCall } = await supabase
            .from('sales_calls')
            .select('id')
            .eq('zoom_meeting_id', meetingId.toString())
            .single();

          if (existingCall) {
            await supabase
              .from('sales_calls')
              .update({ contact_id: contact.id })
              .eq('id', existingCall.id);
          }
        }

        console.log('[Zoom Webhook] Linked', callType, 'call to contact');

        return res.status(200).json({ success: true, message: 'Participant linked' });
      }

      // ========================================
      // HANDLE MEETING ENDED EVENT
      // ========================================
      if (event.event === 'meeting.ended') {
        console.log('[Zoom Webhook] Meeting ended event');
        
        const meetingData = event.payload.object;
        const meetingId = meetingData.id;
        const topic = meetingData.topic;

        // Identify call type
        const callType = identifyCallType(topic);

        if (callType === 'podcast') {
          const { data: interview } = await supabase
            .from('podcast_interviews')
            .update({ status: 'completed' })
            .eq('zoom_meeting_id', meetingId.toString())
            .select('id, contact_id')
            .single();

          if (interview && interview.contact_id) {
            await supabase
              .from('contacts')
              .update({ 
                status: 'interviewed',
                last_contact_date: new Date().toISOString()
              })
              .eq('id', interview.contact_id);

            console.log('[Zoom Webhook] Updated contact status to interviewed');
          }
        } else if (callType === 'discovery') {
          await supabase
            .from('discovery_calls')
            .update({ status: 'Completed' })
            .eq('zoom_meeting_id', meetingId.toString());
        } else if (callType === 'sales') {
          await supabase
            .from('sales_calls')
            .update({ status: 'Completed' })
            .eq('zoom_meeting_id', meetingId.toString());
        }

        console.log('[Zoom Webhook] Meeting marked as completed');

        return res.status(200).json({ success: true, message: 'Meeting ended processed' });
      }

      // ========================================
      // HANDLE RECORDING COMPLETED EVENT
      // ========================================
      if (event.event === 'recording.completed') {
        console.log('[Zoom Webhook] Recording completed event');
        
        const meetingData = event.payload.object;
        
        // Extract meeting information
        const meetingInfo = {
          zoom_meeting_id: meetingData.id,
          topic: meetingData.topic,
          start_time: meetingData.start_time,
          duration: meetingData.duration,
          host_id: meetingData.host_id,
          recording_files: meetingData.recording_files || []
        };

        console.log('[Zoom Webhook] Processing recording for meeting:', meetingInfo.zoom_meeting_id);

        // Identify call type
        const callType = identifyCallType(meetingInfo.topic);
        console.log('[Zoom Webhook] Identified call type:', callType);

        // Find the recording file and transcript
        const recordingFile = meetingInfo.recording_files.find(f => f.file_type === 'MP4');
        const transcriptFile = meetingInfo.recording_files.find(f => f.file_type === 'TRANSCRIPT');

        if (!recordingFile) {
          console.log('[Zoom Webhook] No recording file found');
          return res.status(200).json({ message: 'No recording file' });
        }

        // Download transcript from Zoom (if available)
        let transcriptText = '';
        if (transcriptFile && transcriptFile.download_url) {
          try {
            transcriptText = await downloadZoomTranscript(transcriptFile.download_url);
            console.log('[Zoom Webhook] Transcript downloaded successfully');
          } catch (error) {
            console.error('[Zoom Webhook] Error downloading transcript:', error);
          }
        }

        // Route to appropriate table based on call type
        if (callType === 'podcast') {
          // Update podcast interview record
          const { data: interview, error: updateError } = await supabase
            .from('podcast_interviews')
            .update({
              zoom_recording_url: recordingFile.download_url,
              transcript_text: transcriptText || null,
              meeting_duration: meetingInfo.duration,
              status: 'completed'
            })
            .eq('zoom_meeting_id', meetingInfo.zoom_meeting_id.toString())
            .select()
            .single();

          if (updateError) {
            console.error('[Zoom Webhook] Error updating interview:', updateError);
            return res.status(500).json({ error: updateError.message });
          }

          console.log('[Zoom Webhook] Podcast interview updated with recording:', interview.id);

          // Trigger AI analysis if transcript exists
          if (transcriptText && interview) {
            triggerAIAnalysis('podcast', interview.id, transcriptText).catch(err => {
              console.error('[Zoom Webhook] AI analysis trigger failed:', err);
            });
          }

          return res.status(200).json({ 
            success: true, 
            message: 'Podcast recording processed',
            interview_id: interview.id,
            call_type: 'podcast'
          });

        } else if (callType === 'discovery') {
          // Update discovery call record
          const { data: discoveryCall, error: updateError } = await supabase
            .from('discovery_calls')
            .update({
              recording_url: recordingFile.download_url,
              transcript: transcriptText || null,
              status: 'Completed'
            })
            .eq('zoom_meeting_id', meetingInfo.zoom_meeting_id.toString())
            .select()
            .single();

          if (updateError) {
            console.error('[Zoom Webhook] Error updating discovery call:', updateError);
            return res.status(500).json({ error: updateError.message });
          }

          console.log('[Zoom Webhook] Discovery call updated with recording:', discoveryCall.id);

          // Trigger AI analysis if transcript exists
          if (transcriptText && discoveryCall) {
            triggerAIAnalysis('discovery', discoveryCall.id, transcriptText).catch(err => {
              console.error('[Zoom Webhook] AI analysis trigger failed:', err);
            });
          }

          return res.status(200).json({ 
            success: true, 
            message: 'Discovery call recording processed',
            discovery_call_id: discoveryCall.id,
            call_type: 'discovery'
          });

        } else if (callType === 'sales') {
          // Update sales call record
          const { data: salesCall, error: updateError } = await supabase
            .from('sales_calls')
            .update({
              recording_url: recordingFile.download_url,
              transcript: transcriptText || null,
              status: 'Completed'
            })
            .eq('zoom_meeting_id', meetingInfo.zoom_meeting_id.toString())
            .select()
            .single();

          if (updateError) {
            console.error('[Zoom Webhook] Error updating sales call:', updateError);
            return res.status(500).json({ error: updateError.message });
          }

          console.log('[Zoom Webhook] Sales call updated with recording:', salesCall.id);

          // Trigger AI analysis if transcript exists
          if (transcriptText && salesCall) {
            triggerAIAnalysis('sales', salesCall.id, transcriptText).catch(err => {
              console.error('[Zoom Webhook] AI analysis trigger failed:', err);
            });
          }

          return res.status(200).json({ 
            success: true, 
            message: 'Sales call recording processed',
            sales_call_id: salesCall.id,
            call_type: 'sales'
          });
        }
      }

      // Handle other events
      console.log('[Zoom Webhook] Unhandled event type:', event.event);
      return res.status(200).json({ message: 'Event received' });

    } catch (error) {
      console.error('[Zoom Webhook] Error processing request:', error);
      return res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

/**
 * Verify Zoom webhook signature for security
 */
function verifyZoomWebhook(headers, body, secret) {
  const crypto = require('crypto');
  const message = `v0:${headers['x-zm-request-timestamp']}:${JSON.stringify(body)}`;
  const hashForVerify = crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex');
  const signature = `v0=${hashForVerify}`;
  
  return signature === headers['x-zm-signature'];
}

/**
 * Download transcript from Zoom
 */
async function downloadZoomTranscript(downloadUrl) {
  try {
    const accessToken = await getZoomAccessToken();
    
    const response = await fetch(downloadUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to download transcript: ${response.status}`);
    }

    const transcriptData = await response.text();
    const plainText = parseVTTTranscript(transcriptData);
    
    return plainText;
  } catch (error) {
    console.error('[Zoom Webhook] Error downloading transcript:', error);
    return '';
  }
}

/**
 * Get Zoom OAuth access token
 */
async function getZoomAccessToken() {
  const tokenUrl = 'https://zoom.us/oauth/token';
  const credentials = Buffer.from(`${zoomClientId}:${zoomClientSecret}`).toString('base64');
  
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: `grant_type=account_credentials&account_id=${zoomAccountId}`
  });

  const data = await response.json();
  return data.access_token;
}

/**
 * Parse VTT transcript format to plain text
 */
function parseVTTTranscript(vttText) {
  const lines = vttText.split('\n');
  const textLines = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line && 
        !line.startsWith('WEBVTT') && 
        !line.includes('-->') && 
        !line.match(/^\d+$/)) {
      textLines.push(line);
    }
  }
  
  return textLines.join('\n');
}

/**
 * Trigger AI analysis based on call type
 */
async function triggerAIAnalysis(callType, recordId, transcript) {
  let analysisUrl;
  let bodyPayload;

  const baseUrl = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}`
    : 'https://growthmanagerpro-backend.vercel.app';

  if (callType === 'podcast') {
    analysisUrl = `${baseUrl}/api/ai-analyze-podcast`;
    bodyPayload = {
      interview_id: recordId,
      transcript: transcript
    };
  } else if (callType === 'discovery') {
    analysisUrl = `${baseUrl}/api/ai-analyze-discovery`;
    bodyPayload = {
      discovery_call_id: recordId,
      transcript: transcript
    };
  } else if (callType === 'sales') {
    analysisUrl = `${baseUrl}/api/ai-analyze-sales`;
    bodyPayload = {
      sales_call_id: recordId,
      transcript: transcript
    };
  } else {
    console.log('[Zoom Webhook] Unknown call type for AI analysis:', callType);
    return;
  }

  try {
    const response = await fetch(analysisUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload)
    });

    const result = await response.json();
    console.log(`[Zoom Webhook] AI analysis (${callType}) triggered:`, result);
  } catch (error) {
    console.error(`[Zoom Webhook] Failed to trigger AI analysis (${callType}):`, error);
    throw error;
  }
}
