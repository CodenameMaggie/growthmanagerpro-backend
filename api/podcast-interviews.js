const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET - Read all interviews
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('podcast_interviews')
        .select('*')
        .order('scheduled_date', { ascending: false });

      if (error) throw error;

      const stats = {
        totalInterviews: data.length,
        scheduledInterviews: data.filter(i => i.interview_status === 'scheduled').length,
        completedInterviews: data.filter(i => i.interview_status === 'completed').length,
        qualifiedGuests: data.filter(i => i.qualification_score >= 35).length,
        conversionRate: data.length > 0 ? Math.round((data.filter(i => i.qualification_score >= 35).length / data.length) * 100) : 0
      };

      return res.status(200).json({
        success: true,
        data: {
          interviews: data.map(interview => ({
            id: interview.id,
            guestName: interview.guest_name,
            guestEmail: interview.guest_email,
            company: interview.company_organization,
            scheduledDate: interview.scheduled_date,
            status: interview.interview_status,
            qualificationScore: interview.qualification_score,
            notes: interview.notes,
            created: interview.created_at
          })),
          stats
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // POST - Create new interview
  if (req.method === 'POST') {
    try {
      const { guestName, guestEmail, company, scheduledDate, status, qualificationScore, notes } = req.body;

      if (!guestName || !guestEmail) {
        return res.status(400).json({
          success: false,
          error: 'Guest name and email are required'
        });
      }

      const { data, error } = await supabase
        .from('podcast_interviews')
        .insert([{
          guest_name: guestName,
          guest_email: guestEmail,
          company_organization: company || null,
          scheduled_date: scheduledDate || null,
          interview_status: status || 'scheduled',
          qualification_score: qualificationScore || 0,
          notes: notes || null
        }])
        .select();

      if (error) throw error;

      return res.status(201).json({
        success: true,
        data: data[0],
        message: 'Interview created successfully'
      });

    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // PUT - Update existing interview
  if (req.method === 'PUT') {
    try {
      const { id, guestName, guestEmail, company, scheduledDate, status, qualificationScore, notes } = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Interview ID is required'
        });
      }

      const updateData = {};
      if (guestName) updateData.guest_name = guestName;
      if (guestEmail) updateData.guest_email = guestEmail;
      if (company !== undefined) updateData.company_organization = company;
      if (scheduledDate !== undefined) updateData.scheduled_date = scheduledDate;
      if (status) updateData.interview_status = status;
      if (qualificationScore !== undefined) updateData.qualification_score = qualificationScore;
      if (notes !== undefined) updateData.notes = notes;

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

      return res.status(200).json({
        success: true,
        data: data[0],
        message: 'Interview updated successfully'
      });

    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // DELETE - Remove interview
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
      console.error('Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
