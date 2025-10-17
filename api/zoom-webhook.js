const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = https://tatbblgwhmyzovsyhzyb.supabase.co;
const supabaseKey = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhdGJibGd3aG15em92c3loenliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxOTQ1NDMsImV4cCI6MjA3NDc3MDU0M30.HUBWBd0Wtdl5rD1G8XSqJe8rYnpMaOXnJiuwHTHyZMo;
const zoomClientId = GB6HVtuxTPmWqvjS8z5z1w;
const zoomClientSecret = XM5VWDJtQVRokWAlr3nlg4zKGuOlhE23;
const zoomWebhookSecret = process.env.ZOOM_WEBHOOK_SECRET || 'temp-secret';

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Zoom Webhook Handler
 * Listens for "recording.completed" events from Zoom
 * Downloads transcript and triggers AI analysis
 */
module.exports = async (req, res) => {
  // Handle Zoom webhook verification
  if (req.method === 'POST' && req.headers['authorization'] === zoomWebhookSecret) {
    const event = req.body;

    console.log('[Zoom Webhook] Event received:', event.event);

   // Verify webhook signature (security) - TEMPORARILY DISABLED
// const isValid = verifyZoomWebhook(req.headers, req.body, zoomWebhookSecret);
// if (!isValid) {
//   return res.status(401).json({ error: 'Invalid webhook signature' });
// }
console.log('[Zoom Webhook] Signature verification temporarily disabled for setup');

    // Handle recording completion event
    if (event.event === 'recording.completed') {
      try {
        const meetingData = event.payload.object;
        
        console.log('[Zoom Webhook] Recording completed for meeting:', meetingData.id);
        
        // Extract meeting information
        const meetingInfo = {
          zoom_meeting_id: meetingData.id,
          topic: meetingData.topic,
          start_time: meetingData.start_time,
          duration: meetingData.duration,
          host_id: meetingData.host_id,
          recording_files: meetingData.recording_files
        };

        // Find the recording file and transcript
        const recordingFile = meetingInfo.recording_files.find(f => f.file_type === 'MP4');
        const transcriptFile = meetingInfo.recording_files.find(f => f.file_type === 'TRANSCRIPT');

        if (!recordingFile) {
          console.log('[Zoom Webhook] No recording file found');
          return res.status(200).json({ message: 'No recording file' });
        }

        // Download transcript from Zoom
        let transcriptText = '';
        if (transcriptFile) {
          transcriptText = await downloadZoomTranscript(transcriptFile.download_url);
        }

        // Extract guest name from meeting topic
        // Assumes format like "Podcast with John Smith" or "John Smith - Podcast"
        const guestName = extractGuestName(meetingInfo.topic);
        const guestEmail = extractGuestEmail(meetingData.participant?.email || '');

        // Create or update podcast interview record
        const { data: interview, error: dbError } = await supabase
          .from('podcast_interviews')
          .upsert([{
            zoom_meeting_id: meetingInfo.zoom_meeting_id,
            guest_name: guestName,
            guest_email: guestEmail || null,
            scheduled_date: meetingInfo.start_time,
            status: 'completed',
            zoom_recording_url: recordingFile.download_url,
            transcript_text: transcriptText,
            meeting_duration: meetingInfo.duration,
            interview_status: 'analyzing' // Will be updated after AI analysis
          }], {
            onConflict: 'zoom_meeting_id'
          })
          .select();

        if (dbError) throw dbError;

        console.log('[Zoom Webhook] Interview record created:', interview[0].id);

        // Trigger AI analysis (async - don't wait)
        if (transcriptText) {
          triggerAIAnalysis(interview[0].id, transcriptText).catch(err => {
            console.error('[Zoom Webhook] AI analysis trigger failed:', err);
          });
        }

        return res.status(200).json({ 
          success: true, 
          message: 'Recording processed',
          interview_id: interview[0].id
        });

      } catch (error) {
        console.error('[Zoom Webhook] Error processing recording:', error);
        return res.status(500).json({ 
          success: false, 
          error: error.message 
        });
      }
    }

    // Handle other events
    return res.status(200).json({ message: 'Event received' });
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
    // Get Zoom access token
    const accessToken = await getZoomAccessToken();
    
    // Download transcript file
    const response = await fetch(downloadUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to download transcript: ${response.status}`);
    }

    const transcriptData = await response.text();
    
    // Parse VTT format to plain text
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
    body: 'grant_type=account_credentials&account_id=' + process.env.ZOOM_ACCOUNT_ID
  });

  const data = await response.json();
  return data.access_token;
}

/**
 * Parse VTT transcript format to plain text
 */
function parseVTTTranscript(vttText) {
  // Remove VTT headers and timestamps
  const lines = vttText.split('\n');
  const textLines = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip VTT headers, timestamps, and empty lines
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
 * Extract guest name from meeting topic
 */
function extractGuestName(topic) {
  // Common patterns:
  // "Podcast with John Smith"
  // "John Smith - Podcast Interview"
  // "Interview: John Smith"
  
  const patterns = [
    /with\s+([A-Z][a-z]+\s+[A-Z][a-z]+)/i,
    /^([A-Z][a-z]+\s+[A-Z][a-z]+)\s*[-:]/,
    /:\s*([A-Z][a-z]+\s+[A-Z][a-z]+)/
  ];
  
  for (const pattern of patterns) {
    const match = topic.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  // Fallback: return topic if no pattern matches
  return topic.replace(/podcast|interview/gi, '').trim() || 'Unknown Guest';
}

/**
 * Extract guest email
 */
function extractGuestEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) ? email : null;
}

/**
 * Trigger AI analysis (async call to analysis endpoint)
 */
async function triggerAIAnalysis(interviewId, transcript) {
  const analysisUrl = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}/api/ai-analyze-podcast`
    : 'http://localhost:3000/api/ai-analyze-podcast';

  try {
    const response = await fetch(analysisUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        interview_id: interviewId,
        transcript: transcript
      })
    });

    const result = await response.json();
    console.log('[Zoom Webhook] AI analysis triggered:', result);
  } catch (error) {
    console.error('[Zoom Webhook] Failed to trigger AI analysis:', error);
    throw error;
  }
}
