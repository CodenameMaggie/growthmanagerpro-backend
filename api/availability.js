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
        .from('availability')
        .select('*')
        .order('date', { ascending: true });

      if (error) throw error;

      const stats = {
        totalSlots: data.length,
        availableSlots: data.filter(a => a.is_available).length,
        bookedSlots: data.filter(a => !a.is_available).length
      };

      return res.status(200).json({
        success: true,
        data: {
          availability: data.map(slot => ({
            id: slot.id,
            date: slot.date,
            timeSlot: slot.time_slot,
            isAvailable: slot.is_available,
            eventTitle: slot.event_title,
            eventDescription: slot.event_description,
            calendarEventId: slot.calendar_event_id,
            notes: slot.notes,
            created: slot.created_at
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
