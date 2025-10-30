const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * GET Pre-Qualification Calls
 * Fetches all pre-qualification calls with contact information and stats
 * 
 * Endpoint: GET /api/pre-qualification-calls
 */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('[Pre-Qual Calls API] Fetching all pre-qualification calls...');

    // Fetch all pre-qual calls with contact information
    const { data: calls, error: callsError } = await supabase
      .from('pre_qualification_calls')
      .select('*, contacts(*)')
      .order('created_at', { ascending: false });

    if (callsError) {
      console.error('[Pre-Qual Calls API] Error fetching calls:', callsError);
      throw callsError;
    }

    // Transform data to match frontend expectations (camelCase)
    const transformedCalls = calls.map(call => ({
      id: call.id,
      guestName: call.guest_name,
      guestEmail: call.guest_email,
      company: call.company,
      scheduledDate: call.scheduled_date,
      callStatus: call.call_status,
      recordingUrl: call.recording_url,
      transcript: call.transcript,
      aiScore: call.ai_score,
      revenueSignals: call.revenue_signals,
      growthChallenges: call.growth_challenges,
      budgetAuthority: call.budget_authority,
      timeline: call.timeline,
      engagementLevel: call.engagement_level,
      podcastTopics: call.podcast_topics,
      redFlags: call.red_flags,
      strengths: call.strengths,
      notes: call.notes,
      podcastInvitationSent: call.podcast_invitation_sent,
      podcastInvitationSentAt: call.podcast_invitation_sent_at,
      zoomMeetingId: call.zoom_meeting_id,
      source: call.source,
      analyzedAt: call.analyzed_at,
      createdAt: call.created_at,
      contactId: call.contact_id,
      contact: call.contacts
    }));

    // Calculate statistics
    const stats = {
      totalCalls: transformedCalls.length,
      qualifiedCalls: transformedCalls.filter(c => c.aiScore >= 35).length,
      averageScore: calculateAverageScore(transformedCalls),
      podcastInvitesSent: transformedCalls.filter(c => c.podcastInvitationSent).length,
      callsByStatus: {
        scheduled: transformedCalls.filter(c => c.callStatus === 'scheduled').length,
        recorded: transformedCalls.filter(c => c.callStatus === 'recorded').length,
        completed: transformedCalls.filter(c => c.callStatus === 'completed').length,
        qualified: transformedCalls.filter(c => c.callStatus === 'qualified').length,
        not_qualified: transformedCalls.filter(c => c.callStatus === 'not_qualified').length,
        cancelled: transformedCalls.filter(c => c.callStatus === 'cancelled').length
      }
    };

    console.log('[Pre-Qual Calls API] ✅ Fetched', transformedCalls.length, 'calls');

    return res.status(200).json({
      success: true,
      data: {
        calls: transformedCalls,
        stats
      }
    });

  } catch (error) {
    console.error('[Pre-Qual Calls API] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};

/**
 * Calculate average AI score from calls
 */
function calculateAverageScore(calls) {
  const scoredCalls = calls.filter(c => c.aiScore !== null && c.aiScore !== undefined);
  
  if (scoredCalls.length === 0) {
    return 0;
  }

  const total = scoredCalls.reduce((sum, call) => sum + call.aiScore, 0);
  return Math.round(total / scoredCalls.length);
}
