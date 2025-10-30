const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const zoomClientId = process.env.ZOOM_CLIENT_ID;
const zoomClientSecret = process.env.ZOOM_CLIENT_SECRET;
const zoomAccountId = process.env.ZOOM_ACCOUNT_ID;

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Zoom Webhook Handler - Unified for All Call Types
 * Handles: Podcast, Discovery, Strategy, and Pre-Qualification Calls
 */
module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { event, payload } = req.body;

    // Handle recording completed event
    if (event === 'recording.completed') {
      const meetingId = payload.object.id;
      const topic = payload.object.topic;
      const recordingFiles = payload.object.recording_files;

      console.log(`Recording completed for meeting: ${meetingId} - ${topic}`);

      // Determine call type from meeting topic
      const callType = determineCallType(topic);
      
      if (!callType) {
        console.log('Meeting topic does not match any tracked call types');
        return res.status(200).json({ message: 'Not a tracked call type' });
      }

      // Get Zoom access token
      const accessToken = await getZoomAccessToken();

      // Process each recording file
      for (const file of recordingFiles) {
        if (file.file_type === 'MP4' || file.file_type === 'M4A') {
          // Download recording
          const recordingUrl = await downloadRecording(file.download_url, accessToken);
          
          // Transcribe recording
          const transcript = await transcribeRecording(recordingUrl);

          // Update the appropriate database table
          await updateCallRecord(callType, meetingId, topic, recordingUrl, transcript);

          // If pre-qual call and transcription successful, trigger AI analysis
          if (callType === 'prequal' && transcript) {
            await triggerPreQualAnalysis(meetingId);
          }
        }
      }

      return res.status(200).json({ 
        success: true, 
        message: `${callType} call recording processed`,
        meetingId 
      });
    }

    // Handle other events
    return res.status(200).json({ message: 'Event received but not processed' });

  } catch (error) {
    console.error('Zoom webhook error:', error);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * Determine call type from meeting topic
 */
function determineCallType(topic) {
  const topicLower = topic.toLowerCase();
  
 if (topicLower.includes('pre-qual') || topicLower.includes('prequal') || topicLower.includes('pre qual') || topicLower.includes('pre-podcast')) {
    return 'prequal';
}
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

/**
 * Get Zoom OAuth access token
 */
async function getZoomAccessToken() {
  const credentials = Buffer.from(`${zoomClientId}:${zoomClientSecret}`).toString('base64');
  
  const response = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${zoomAccountId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });

  const data = await response.json();
  return data.access_token;
}

/**
 * Download recording from Zoom
 */
async function downloadRecording(downloadUrl, accessToken) {
  const response = await fetch(downloadUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  const buffer = await response.arrayBuffer();
  
  // Upload to Supabase storage
  const fileName = `recordings/${Date.now()}-${Math.random().toString(36).substring(7)}.mp4`;
  
  const { data, error } = await supabase.storage
    .from('call-recordings')
    .upload(fileName, buffer, {
      contentType: 'video/mp4'
    });

  if (error) throw error;

  const { data: urlData } = supabase.storage
    .from('call-recordings')
    .getPublicUrl(fileName);

  return urlData.publicUrl;
}

/**
 * Transcribe recording using your transcription service
 * Replace with your actual transcription service (Deepgram, Assembly AI, etc.)
 */
async function transcribeRecording(recordingUrl) {
  // TODO: Implement actual transcription service
  // Example with Deepgram:
  /*
  const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
  const response = await fetch('https://api.deepgram.com/v1/listen', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${deepgramApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      url: recordingUrl,
      punctuate: true,
      utterances: true
    })
  });
  
  const result = await response.json();
  return result.results.channels[0].alternatives[0].transcript;
  */
  
  console.log('Transcription would happen here for:', recordingUrl);
  return null; // Return null until transcription is implemented
}

/**
 * Update call record in appropriate table
 */
async function updateCallRecord(callType, meetingId, topic, recordingUrl, transcript) {
  const updates = {
    zoom_meeting_id: meetingId,
    recording_url: recordingUrl,
    transcript: transcript,
    call_status: transcript ? 'completed' : 'recorded',
    updated_at: new Date().toISOString()
  };

  let tableName;
  let matchField = 'zoom_meeting_id';

  switch (callType) {
    case 'prequal':
      tableName = 'pre_qualification_calls';
      break;
    case 'podcast':
      tableName = 'podcast_calls';
      break;
    case 'discovery':
      tableName = 'discovery_calls';
      break;
    case 'strategy':
      tableName = 'strategy_calls';
      break;
    default:
      throw new Error(`Unknown call type: ${callType}`);
  }

  // Try to find existing record by meeting ID
  const { data: existing } = await supabase
    .from(tableName)
    .select('id')
    .eq(matchField, meetingId)
    .single();

  if (existing) {
    // Update existing record
    const { error } = await supabase
      .from(tableName)
      .update(updates)
      .eq('id', existing.id);

    if (error) throw error;
    console.log(`Updated ${callType} call record:`, existing.id);
  } else {
    // Create new record if it doesn't exist
    const { error } = await supabase
      .from(tableName)
      .insert({
        ...updates,
        created_at: new Date().toISOString()
      });

    if (error) throw error;
    console.log(`Created new ${callType} call record for meeting:`, meetingId);
  }
}

/**
 * Trigger AI analysis for pre-qualification calls
 */
async function triggerPreQualAnalysis(meetingId) {
  try {
    // Get the pre-qual call record
    const { data: call, error } = await supabase
      .from('pre_qualification_calls')
      .select('*')
      .eq('zoom_meeting_id', meetingId)
      .single();

    if (error || !call) {
      console.error('Could not find pre-qual call:', error);
      return;
    }

    // Call the AI analysis API
    const analysisUrl = `${process.env.VERCEL_URL || 'http://localhost:3000'}/api/ai-analyze-prequal`;
    
    const response = await fetch(analysisUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        callId: call.id
      })
    });

    if (!response.ok) {
      throw new Error(`AI analysis failed: ${response.statusText}`);
    }

    const result = await response.json();
    console.log('Pre-qual AI analysis triggered:', result);

  } catch (error) {
    console.error('Error triggering pre-qual analysis:', error);
  }
}
