const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

// Helper function to auto-create discovery call when qualified
async function autoCreateDiscoveryCall(interview) {
  try {
    // Check if already created
    if (interview.discovery_call_created) {
      console.log(`[Auto-Create] Discovery call already exists for interview ${interview.id}`);
      return null;
    }

    // Check qualification
    if (!interview.qualified_for_discovery || interview.overall_score < 35) {
      console.log(`[Auto-Create] Interview ${interview.id} not qualified (score: ${interview.overall_score})`);
      return null;
    }

    console.log(`[Auto-Create] Creating discovery call for ${interview.guest_name} (score: ${interview.overall_score})`);

    // Create discovery call
    const { data: discoveryCall, error: createError } = await supabase
      .from('discovery_calls')
      .insert([{
        contact_name: interview.guest_name,
        company: interview.company,
        email: interview.guest_email,
        call_status: 'scheduled',
        call_source: 'podcast_qualified',
        notes: `Auto-created from podcast interview. AI Score: ${interview.overall_score}/50. ${interview.ai_analysis || ''}`
      }])
      .select()
      .single();

    if (createError) throw createError;

    // Update interview to mark discovery call as created
    const { error: updateError } = await supabase
      .from('podcast_interviews')
      .update({
        discovery_call_created: true,
        discovery_call_id: discoveryCall.id
      })
      .eq('id', interview.id);

    if (updateError) throw updateError;

    console.log(`[Auto-Create] ✅ Discovery call ${discoveryCall.id} created for interview ${interview.id}`);
    return discoveryCall;

  } catch (error) {
    console.error('[Auto-Create] Error creating discovery call:', error);
    return null;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ==================== GET - Read all interviews with AI analysis ====================
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('podcast_interviews')
        .select('*')
        .order('scheduled_date', { ascending: false });

      if (error) throw error;

      // Calculate statistics including AI scores
      const analyzedInterviews = data.filter(i => i.overall_score !== null);
      
      const stats = {
        totalInterviews: data.length,
        scheduledInterviews: data.filter(i => i.interview_status === 'scheduled').length,
        completedInterviews: data.filter(i => i.interview_status === 'completed' || i.interview_status === 'analyzed').length,
        analyzedInterviews: analyzedInterviews.length,
        qualifiedGuests: data.filter(i => i.qualified_for_discovery === true).length,
        averageScore: analyzedInterviews.length > 0
          ? (analyzedInterviews.reduce((sum, i) => sum + (i.overall_score || 0), 0) / analyzedInterviews.length).toFixed(2)
          : 0,
        conversionRate: data.length > 0 
          ? Math.round((data.filter(i => i.qualified_for_discovery === true).length / data.length) * 100) 
          : 0,
        autoProgressedToDiscovery: data.filter(i => i.discovery_call_created === true).length
      };

      // Map to frontend-friendly format
      const interviews = data.map(interview => ({
        id: interview.id,
        guestName: interview.guest_name,
        guestEmail: interview.guest_email,
        company: interview.company,
        jobTitle: interview.job_title,
        scheduledDate: interview.scheduled_date,
        status: interview.interview_status,
        
        // Zoom data
        zoomMeetingId: interview.zoom_meeting_id,
        zoomRecordingUrl: interview.zoom_recording_url,
        meetingDuration: interview.meeting_duration,
        transcriptText: interview.transcript_text,
        
        // AI Analysis scores
        overallScore: interview.overall_score,
        introScore: interview.intro_score,
        questionsFlowScore: interview.questions_flow_score,
        closeNextStepsScore: interview.close_next_steps_score,
        aiAnalysis: interview.ai_analysis,
        
        // Qualification & Progression
        qualifiedForDiscovery: interview.qualified_for_discovery,
        discoveryCallCreated: interview.discovery_call_created,
        discoveryCallId: interview.discovery_call_id,
        
        // Metadata
        analyzedAt: interview.analyzed_at,
        created: interview.created_at
      }));

      return res.status(200).json({
        success: true,
        data: {
          interviews,
          stats
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('[Podcast Interviews API] GET Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // ==================== POST - Create new interview ====================
  if (req.method === 'POST') {
    try {
      const { 
        guestName, 
        guestEmail, 
        company, 
        jobTitle,
        scheduledDate, 
        status, 
        notes,
        zoomMeetingId 
      } = req.body;

      if (!guestName || !guestEmail) {
        return res.status(400).json({
          success: false,
          error: 'Guest name and email are required'
        });
      }

      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(guestEmail)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid email format'
        });
      }

      const { data, error } = await supabase
        .from('podcast_interviews')
        .insert([{
          guest_name: guestName,
          guest_email: guestEmail,
          company: company || null,
          job_title: jobTitle || null,
          scheduled_date: scheduledDate || null,
          interview_status: status || 'scheduled',
          notes: notes || null,
          zoom_meeting_id: zoomMeetingId || null
        }])
        .select();

      if (error) throw error;

      const newInterview = {
        id: data[0].id,
        guestName: data[0].guest_name,
        guestEmail: data[0].guest_email,
        company: data[0].company,
        jobTitle: data[0].job_title,
        scheduledDate: data[0].scheduled_date,
        status: data[0].interview_status,
        zoomMeetingId: data[0].zoom_meeting_id,
        created: data[0].created_at
      };

      return res.status(201).json({
        success: true,
        data: newInterview,
        message: 'Podcast interview created successfully'
      });

    } catch (error) {
      console.error('[Podcast Interviews API] POST Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // ==================== PUT - Update existing interview ====================
  if (req.method === 'PUT') {
    try {
      const { 
        id, 
        guestName, 
        guestEmail, 
        company, 
        jobTitle,
        scheduledDate, 
        status, 
        notes,
        zoomMeetingId,
        overallScore,
        introScore,
        questionsFlowScore,
        closeNextStepsScore,
        aiAnalysis,
        qualifiedForDiscovery
      } = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Interview ID is required'
        });
      }

      const updateData = {};
      if (guestName !== undefined) updateData.guest_name = guestName;
      if (guestEmail !== undefined) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(guestEmail)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid email format'
          });
        }
        updateData.guest_email = guestEmail;
      }
      if (company !== undefined) updateData.company = company;
      if (jobTitle !== undefined) updateData.job_title = jobTitle;
      if (scheduledDate !== undefined) updateData.scheduled_date = scheduledDate;
      if (status !== undefined) updateData.interview_status = status;
      if (notes !== undefined) updateData.notes = notes;
      if (zoomMeetingId !== undefined) updateData.zoom_meeting_id = zoomMeetingId;
      
      // AI scoring fields
      if (overallScore !== undefined) updateData.overall_score = overallScore;
      if (introScore !== undefined) updateData.intro_score = introScore;
      if (questionsFlowScore !== undefined) updateData.questions_flow_score = questionsFlowScore;
      if (closeNextStepsScore !== undefined) updateData.close_next_steps_score = closeNextStepsScore;
      if (aiAnalysis !== undefined) updateData.ai_analysis = aiAnalysis;
      if (qualifiedForDiscovery !== undefined) updateData.qualified_for_discovery = qualifiedForDiscovery;
      
      // Set analyzed_at timestamp if AI scores are being updated
      if (overallScore !== undefined) {
        updateData.analyzed_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('podcast_interviews')
        .update(updateData)
        .eq('id', id)
        .select();

      if (error) throw error;

      if (!data || data.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Interview not found'
        });
      }

      const updatedInterview = data[0];

      // 🚀 AUTO-CREATE DISCOVERY CALL if qualified
      let discoveryCallCreated = null;
      if (updatedInterview.qualified_for_discovery && updatedInterview.overall_score >= 35) {
        discoveryCallCreated = await autoCreateDiscoveryCall(updatedInterview);
      }

      return res.status(200).json({
        success: true,
        data: {
          id: updatedInterview.id,
          guestName: updatedInterview.guest_name,
          guestEmail: updatedInterview.guest_email,
          company: updatedInterview.company,
          jobTitle: updatedInterview.job_title,
          scheduledDate: updatedInterview.scheduled_date,
          status: updatedInterview.interview_status,
          overallScore: updatedInterview.overall_score,
          qualifiedForDiscovery: updatedInterview.qualified_for_discovery,
          discoveryCallCreated: updatedInterview.discovery_call_created,
          discoveryCallId: updatedInterview.discovery_call_id,
          created: updatedInterview.created_at
        },
        message: 'Interview updated successfully',
        automation: discoveryCallCreated ? {
          discoveryCallCreated: true,
          discoveryCallId: discoveryCallCreated.id
        } : null
      });

    } catch (error) {
      console.error('[Podcast Interviews API] PUT Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // ==================== DELETE - Remove interview ====================
  if (req.method === 'DELETE') {
    try {
      const { id } = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Interview ID is required'
        });
      }

      const { error } = await supabase
        .from('podcast_interviews')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return res.status(200).json({
        success: true,
        message: 'Interview deleted successfully'
      });

    } catch (error) {
      console.error('[Podcast Interviews API] DELETE Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  return res.status(405).json({ 
    success: false,
    error: 'Method not allowed' 
  });
};
