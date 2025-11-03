const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Manual Zoom Recording Import
 * 
 * POST /api/zoom-manual-import
 * Body: { "meetingId": "84467687494", "callType": "discovery" }
 * 
 * Fetches an existing Zoom recording and processes it through the pipeline
 */
module.exports = async (req, res) => {
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
    const { meetingId, callType } = req.body;

    if (!meetingId) {
      return res.status(400).json({ 
        success: false,
        error: 'meetingId is required' 
      });
    }

    console.log(`[Manual Import] Fetching Zoom recording: ${meetingId}`);

    // Get Zoom access token
    const accessToken = await getZoomAccessToken();

    // Fetch recording data from Zoom
    const recordingData = await getZoomRecording(meetingId, accessToken);

    console.log(`[Manual Import] Recording found: ${recordingData.topic}`);

    // Determine call type (use provided or auto-detect)
    const detectedCallType = callType || determineCallType(recordingData.topic);

    if (!detectedCallType) {
      return res.status(400).json({
        success: false,
        error: 'Could not determine call type',
        topic: recordingData.topic,
        hint: 'Provide callType in body: prequal, podcast, discovery, or strategy'
      });
    }

    console.log(`[Manual Import] Call type: ${detectedCallType}`);

    // Process recording files
    let recordingUrl = null;
    let transcript = null;

    for (const file of recordingData.recording_files) {
      // Download transcript
      if (file.file_type === 'TRANSCRIPT' || file.recording_type === 'audio_transcript') {
        console.log(`[Manual Import] Downloading transcript...`);
        const vttContent = await downloadTranscript(file.download_url, accessToken);
        transcript = cleanVTTTranscript(vttContent);
        console.log(`[Manual Import] ✅ Transcript downloaded (${transcript.length} chars)`);
      }

      // Store Zoom recording URL (don't download - files are too large)
      if (file.file_type === 'MP4' || file.file_type === 'M4A') {
        console.log(`[Manual Import] Storing Zoom recording URL...`);
        recordingUrl = file.download_url; // Just store the Zoom URL
        console.log(`[Manual Import] ✅ Recording URL stored`);
      }
    }

    if (!transcript) {
      return res.status(400).json({
        success: false,
        error: 'No transcript found for this recording',
        hint: 'Enable cloud recording transcription in Zoom settings'
      });
    }

    // Find existing call record by meeting ID or create new one
    const callRecord = await findOrCreateCallRecord(
      supabase,
      detectedCallType,
      meetingId,
      recordingData.topic,
      recordingUrl,
      transcript
    );

    console.log(`[Manual Import] ✅ Call record: ${callRecord.id}`);

    // Trigger AI analysis
    console.log(`[Manual Import] Triggering AI analysis...`);
    const analysisResult = await triggerAIAnalysis(detectedCallType, callRecord.id, transcript);
    console.log(`[Manual Import] ✅ AI analysis complete`);

    return res.status(200).json({
      success: true,
      message: `${detectedCallType} call imported and analyzed`,
      data: {
        callType: detectedCallType,
        callId: callRecord.id,
        meetingId,
        topic: recordingData.topic,
        duration: recordingData.duration,
        recordingUrl,
        transcriptLength: transcript.length,
        analysisResult
      }
    });

  } catch (error) {
    console.error('[Manual Import] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// ============================================
// HELPER FUNCTIONS
// ============================================

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

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Zoom auth failed: ${error}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function getZoomRecording(meetingId, accessToken) {
  const response = await fetch(
    `https://api.zoom.us/v2/meetings/${meetingId}/recordings`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get recording: ${response.status} ${error}`);
  }

  return await response.json();
}

async function downloadTranscript(downloadUrl, accessToken) {
  const response = await fetch(downloadUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to download transcript: ${response.status}`);
  }
  
  return await response.text();
}

function cleanVTTTranscript(vttContent) {
  const lines = vttContent.split('\n');
  let cleanedLines = [];

  for (let line of lines) {
    line = line.trim();

    // Skip VTT formatting lines
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

    // Clean special characters
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

async function downloadAndStoreRecording(supabase, downloadUrl, accessToken) {
  const response = await fetch(downloadUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    throw new Error(`Failed to download recording: ${response.status}`);
  }

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
  if (topicLower.includes('strategy') || topicLower.includes('sales')) {
    return 'strategy';
  }
  
  return null;
}

async function findOrCreateCallRecord(supabase, callType, meetingId, topic, recordingUrl, transcript) {
  let tableName;
  let updates = {
    zoom_meeting_id: meetingId,
    updated_at: new Date().toISOString()
  };

  switch (callType) {
    case 'prequal':
      tableName = 'pre_qualification_calls';
      updates.call_status = 'completed';
      if (recordingUrl) updates.recording_url = recordingUrl;
      if (transcript) updates.transcript = transcript;
      break;
    case 'podcast':
      tableName = 'podcast_interviews';
      if (recordingUrl) updates.zoom_recording_url = recordingUrl;
      if (transcript) updates.transcript_text = transcript;
      updates.interview_status = 'completed';
      break;
    case 'discovery':
      tableName = 'discovery_calls';
      // Discovery calls don't store recording URL, just transcript
      if (transcript) updates.transcript = transcript;
      updates.status = 'Completed';
      // Extract name from topic or use default
      if (!updates.contact_name) {
        updates.contact_name = topic.replace(/discovery|call|meeting|-|:/gi, '').trim() || 'Import from Zoom';
      }
      break;
    case 'strategy':
      tableName = 'strategy_calls';
      // Strategy calls don't store recording URL, just transcript
      if (transcript) updates.transcript = transcript;
      updates.status = 'Completed';
      // Extract name from topic or use default
      if (!updates.contact_name) {
        updates.contact_name = topic.replace(/strategy|sales|call|meeting|-|:/gi, '').trim() || 'Import from Zoom';
      }
      break;
    default:
      throw new Error(`Unknown call type: ${callType}`);
  }

  // Try to find existing record by meeting ID
  const { data: existing } = await supabase
    .from(tableName)
    .select('*')
    .eq('zoom_meeting_id', meetingId)
    .maybeSingle();

  if (existing) {
    // Update existing
    const { data, error } = await supabase
      .from(tableName)
      .update(updates)
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw error;
    console.log(`[Manual Import] Updated existing ${tableName} record`);
    return data;
  } else {
    // Create new
    const { data, error } = await supabase
      .from(tableName)
      .insert({
        ...updates,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    console.log(`[Manual Import] Created new ${tableName} record`);
    return data;
  }
}

async function triggerAIAnalysis(callType, callId, transcript) {
  const actions = {
    'prequal': 'analyze-prequal',
    'podcast': 'analyze-podcast',
    'discovery': 'analyze-discovery',
    'strategy': 'analyze-strategy'
  };

  const action = actions[callType];
  if (!action) {
    throw new Error(`No AI analyzer for call type: ${callType}`);
  }

  const body = callType === 'prequal' 
    ? { action, callId }
    : { action, [`${callType}_call_id`]: callId, transcript };

  const response = await fetch('https://growthmanagerpro-backend.vercel.app/api/ai-analyzer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AI analysis failed: ${error}`);
  }

  return await response.json();
}
