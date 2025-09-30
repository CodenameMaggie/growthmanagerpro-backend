const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { data, error } = await supabase
      .from('podcast_interviews')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({
        success: false,
        error: 'Database query failed',
        details: error.message
      });
    }

    const interviews = data?.map(interview => ({
      id: interview.id,
      guestName: interview.guest_name,
      guestEmail: interview.guest_email,
      company: interview.company,
      scheduledDate: interview.scheduled_date,
      status: interview.status,
      qualificationScore: interview.qualification_score,
      created: interview.created_at
    })) || [];

    const stats = {
      totalInterviews: interviews.length,
      scheduledInterviews: interviews.filter(i => i.status === 'scheduled').length,
      qualifiedGuests: interviews.filter(i => i.qualificationScore >= 35).length,
      conversionRate: interviews.length > 0 
        ? Math.round((interviews.filter(i => i.qualificationScore >= 35).length / interviews.length) * 100) 
        : 0
    };

    return res.status(200).json({
      success: true,
      data: { interviews, stats },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};
