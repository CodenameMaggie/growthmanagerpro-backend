const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const zoomClientId = process.env.ZOOM_CLIENT_ID;
const zoomClientSecret = process.env.ZOOM_CLIENT_SECRET;
const zoomAccountId = process.env.ZOOM_ACCOUNT_ID;

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Zoom Webhook Handler - WITH AUTOMATIC VTT CLEANING
 * Handles: Podcast, Discovery, Strategy, and Pre-Qualification Calls
 * NOW: Automatically cleans VTT transcripts before database insertion
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
        // Handle video recordings
        if (file.file_type === 'MP4' || file.file_type === 'M4A') {
          const recordingUrl = await downloadRecording(file.download_url, accessToken);
          
          // Store recording URL immediately (don't wait for transcription)
          await updateCallRecord(callType, meetingId, topic, recordingUrl, null);
        }

        // Handle VTT transcript files - NEW: WITH AUTOMATIC CLEANING
        if (file.file_type === 'TRANSCRIPT' || file.recording_type === 'audio_transcript') {
          console.log('Processing VTT transcript file...');
          
          // Download VTT transcript
          const vttContent = await downloadTranscript(file.download_url, accessToken);
          
          // CLEAN the VTT content before saving
          const cleanedTranscript = cleanVTTTranscript(vttContent);
          
          console.log(`VTT cleaned: ${cleanedTranscript.length} characters, apostrophes removed`);
          
          // Update with cleaned transcript
          await updateCallRecord(callType, meetingId, topic, null, cleanedTranscript);

          // If pre-qual call, trigger AI analysis
          if (callType === 'prequal' && cleanedTranscript) {
            await triggerPreQualAnalysis(meetingId);
          }
        }
      }

      return res.status(200).json({ 
        success: true, 
        message: `${callType} call recording and transcript processed`,
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
 * NEW: Clean VTT transcript for SQL-safe insertion
 * Removes apostrophes, timestamps, and metadata
 */
function cleanVTTTranscript(vttContent) {
  const lines = vttContent.split('\n');
  let cleanedLines = [];

  for (let line of lines) {
    line = line.trim();

    // Skip VTT metadata
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

    // Remove problematic characters for SQL
    let cleanLine = line
      .replace(/'/g, '')    // Remove apostrophes
      .replace(/'/g, '')    // Remove fancy apostrophes
      .replace(/`/g, '')    // Remove backticks
      .replace(/"/g, '"')   // Normalize quotes
      .replace(/"/g, '"');  // Normalize quotes

    if (cleanLine) {
      cleanedLines.push(cleanLine);
    }
  }

  return cleanedLines.join('\n');
}

/**
 * NEW: Download transcript from Zoom
 */
async function downloadTranscript(downloadUrl, accessToken) {
  const response = await fetch(downloadUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  return await response.text();
}

/**
 * Determine call type from meeting topic
 */
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
 * Update call record in appropriate table
 * UPDATED: Handles separate recording URL and transcript updates
 */
async function updateCallRecord(callType, meetingId, topic, recordingUrl, transcript) {
  const updates = {
    zoom_meeting_id: meetingId,
    updated_at: new Date().toISOString()
  };

  // Add recording URL if provided
  if (recordingUrl) {
    updates.recording_url = recordingUrl;
    updates.call_status = 'recorded';
  }

  // Add transcript if provided (already cleaned!)
  if (transcript) {
    updates.transcript = transcript;
    updates.call_status = 'completed';
  }

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
