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

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('discovery_calls')
        .select('*')
        .order('call_date', { ascending: false });

      if (error) throw error;

      const stats = {
        totalCalls: data.length,
        scheduledCalls: data.filter(d => d.call_status === 'Scheduled').length,
        completedCalls: data.filter(d => d.call_status === 'Completed').length
      };

      return res.status(200).json({
        success: true,
        data: {
          calls: data.map(call => ({
            id: call.id,
            contactName: call.contact_name,
            email: call.email,
            company: call.company,
            callDate: call.call_date,
            callStatus: call.call_status,
            notes: call.notes,
            nextSteps: call.next_steps,
            created: call.created_at
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

  return res.status(405).json({ error: 'Method not allowed' });
};
