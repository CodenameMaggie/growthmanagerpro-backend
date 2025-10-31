const crypto = require('crypto');

/**
 * PRODUCTION ZOOM WEBHOOK
 * Handles validation + recording processing
 */
module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { event, payload } = req.body;

    // ============================================
    // HANDLE VALIDATION IMMEDIATELY (< 3 seconds)
    // ============================================
    if (event === 'endpoint.url_validation') {
      const plainToken = payload.plainToken;
      const zoomWebhookSecret = process.env.ZOOM_WEBHOOK_SECRET;
      
      if (!zoomWebhookSecret) {
        return res.status(500).json({ error: 'Webhook secret not configured' });
      }
      
      const encryptedToken = crypto
        .createHmac('sha256', zoomWebhookSecret)
        .update(plainToken)
        .digest('hex');
      
      res.setHeader('Content-Type', 'application/json');
      return res.status(200).json({
        plainToken: plainToken,
        encryptedToken: encryptedToken
      });
    }

    // ============================================
    // HANDLE RECORDING COMPLETED
    // ============================================
    if (event === 'recording.completed') {
      // Only import Supabase AFTER validation is done
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      const meetingId = payload.object.id;
      const topic = payload.object.topic;
      const recordingFiles = payload.object.recording_files;

      console.log(`[Zoom Webhook] Recording completed: ${meetingId} - ${topic}`);

      // Determine call type from meeting topic
      const callType = determineCallType(topic);
      
      if (!callType) {
        console.log(`[Zoom Webhook] Not a tracked call type: ${topic}`);
        return res.status(200).json({ message: 'Not a tracked call type' });
      }

      console.log(`[Zoom Webhook] Call type: ${callType}`);

      // Get Zoom access token
      const accessToken = await getZoomAccessToken();

      // Process each recording file
      for (const file of recordingFiles) {
        // Handle VTT transcript files
        if (file.file_type === 'TRANSCRIPT' || file.recording_type === 'audio_transcript') {
          console.log(`[Zoom Webhook] Processing transcript for ${callType} call`);
          
          const vttContent = await downloadTranscript(file.download_url, accessToken);
          const cleanedTranscript = cleanVTTTranscript(vttContent);
          
          await updateCallRecord(supabase, callType, meetingId, topic, null, cleanedTranscript);
          
          // Auto-trigger AI analysis
          if (cleanedTranscript) {
            await triggerAIAnalysis(callType, meetingId);
          }
        }

        // Handle video recordings
        if (file.file_type === 'MP4' || file.file_type === 'M4A') {
          console.log(`[Zoom Webhook] Processing recording for ${callType} call`);
          
          const recordingUrl = await downloadRecording(supabase, file.download_url, accessToken);
          await updateCallRecord(supabase, callType, meetingId, topic, recordingUrl, null);
        }
      }

      return res.status(200).json({ 
        success: true, 
        message: `${callType} call processed`,
        meetingId 
      });
    }

    // Handle other events
    return res.status(200).json({ message: 'Event received' });

  } catch (error) {
    console.error('[Zoom Webhook] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// ============================================
// HELPER FUNCTIONS
// ============================================

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
  if (topicLower.includes('strategy') || topicLower.includes('strategy call')) {
    return 'strategy';  // ✅ USES "strategy" not "strategy"
  }
  
  return null;
}

function cleanVTTTranscript(vttContent) {
  const lines = vttContent.split('\n');
  let cleanedLines = [];

  for (let line of lines) {
    line = line.trim();

    if (
      line === 'WEBVTT' ||
      line === '' ||
      line.match(/^\d+$/) ||
      line.match(/\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}/) ||
      line.startsWith('NOTE') ||
      line.startsWith('Kind:') ||
      line.startsWith('Language:')
    ) {
      continue;
    }

    let cleanLine = line
      .replace(/'/g, '')
      .replace(/'/g, '')
      .replace(/`/g, '')
      .replace(/"/g, '"')
      .replace(/"/g, '"');

    if (cleanLine) {
      cleanedLines.push(cleanLine);
    }
  }

  return cleanedLines.join('\n');
}

async function downloadTranscript(downloadUrl, accessToken) {
  const response = await fetch(downloadUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  return await response.text();
}

async function getZoomAccessToken() {
  const credentials = Buffer.from(
    `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`
  ).toString('base64');
  
  const response = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${process.env.ZOOM_ACCOUNT_ID}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }
  );

  const data = await response.json();
  return data.access_token;
}

async function downloadRecording(supabase, downloadUrl, accessToken) {
  const response = await fetch(downloadUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  const buffer = await response.arrayBuffer();
  const fileName = `recordings/${Date.now()}-${Math.random().toString(36).substring(7)}.mp4`;
  
  const { error } = await supabase.storage
    .from('call-recordings')
    .upload(fileName, buffer, { contentType: 'video/mp4' });

  if (error) throw error;

  const { data: urlData } = supabase.storage
    .from('call-recordings')
    .getPublicUrl(fileName);

  return urlData.publicUrl;
}

async function updateCallRecord(supabase, callType, meetingId, topic, recordingUrl, transcript) {
  const updates = {
    zoom_meeting_id: meetingId,
    updated_at: new Date().toISOString()
  };

  if (recordingUrl) {
    updates.recording_url = recordingUrl;
    updates.call_status = 'recorded';
  }

  if (transcript) {
    updates.call_status = 'completed';
  }

  let tableName;
  switch (callType) {
    case 'prequal':
      tableName = 'pre_qualification_calls';
      if (transcript) updates.transcript = transcript;
      break;
    case 'podcast':
      tableName = 'podcast_interviews';
      if (transcript) updates.transcript_text = transcript;
      break;
    case 'discovery':
      tableName = 'discovery_calls';
      if (transcript) updates.transcript = transcript;
      break;
    case 'strategy':  // ✅ USES "strategy" not "strategy"
      tableName = 'strategy_calls';  // ✅ Correct table name
      if (transcript) updates.transcript = transcript;
      break;
    default:
      throw new Error(`Unknown call type: ${callType}`);
  }

  console.log(`[Zoom Webhook] Updating ${tableName} for meeting ${meetingId}`);

  const { data: existing } = await supabase
    .from(tableName)
    .select('id')
    .eq('zoom_meeting_id', meetingId)
    .single();

  if (existing) {
    await supabase
      .from(tableName)
      .update(updates)
      .eq('id', existing.id);
    
    console.log(`[Zoom Webhook] Updated existing record ${existing.id}`);
  } else {
    await supabase
      .from(tableName)
      .insert({ ...updates, created_at: new Date().toISOString() });
    
    console.log(`[Zoom Webhook] Created new record`);
  }
}

async function triggerAIAnalysis(callType, meetingId) {
  const actions = {
    'prequal': 'analyze-prequal',
    'podcast': 'analyze-podcast',
    'discovery': 'analyze-discovery',
    'strategy': 'analyze-strategy'  // ✅ USES "strategy" not "strategy"
  };

  const action = actions[callType];
  if (!action) return;

  try {
    console.log(`[Zoom Webhook] Triggering AI analysis: ${action}`);
    
    await fetch('https://growthmanagerpro-backend.vercel.app/api/ai-analyzer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: action,
        callId: meetingId
      })
    });
    
    console.log(`[Zoom Webhook] AI analysis triggered for ${callType}`);
  } catch (error) {
    console.error('[Zoom Webhook] AI analysis trigger failed:', error);
  }
}
