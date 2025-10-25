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

  // ==================== GET - Read availability settings ====================
  if (req.method === 'GET') {
    try {
      // Get the user's availability settings
      // Note: In production, you'd filter by user_id. For now, get the most recent settings.
      const { data, error } = await supabase
        .from('availability')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        // If no settings exist yet, return default settings
        if (error.code === 'PGRST116') {
          return res.status(200).json({
            success: true,
            settings: {
              workingHours: {
                monday: { enabled: true, start: '09:00', end: '17:00' },
                tuesday: { enabled: true, start: '09:00', end: '17:00' },
                wednesday: { enabled: true, start: '09:00', end: '17:00' },
                thursday: { enabled: true, start: '09:00', end: '17:00' },
                friday: { enabled: true, start: '09:00', end: '17:00' },
                saturday: { enabled: false, start: '09:00', end: '17:00' },
                sunday: { enabled: false, start: '09:00', end: '17:00' }
              },
              bufferTime: 10,
              timezone: 'America/Vancouver'
            },
            message: 'Using default settings'
          });
        }
        throw error;
      }

      // Transform to camelCase for frontend
      const settings = {
        workingHours: data.working_hours,
        bufferTime: data.buffer_time,
        timezone: data.timezone,
        calendlyConnected: data.calendly_connected || false,
        zoomConnected: data.zoom_connected || false,
        lastSyncedAt: data.last_synced_at,
        updated: data.updated_at
      };

      return res.status(200).json({
        success: true,
        settings,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('[Availability API] GET Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // ==================== POST - Save availability settings ====================
  if (req.method === 'POST') {
    try {
      const { working_hours, buffer_time, timezone } = req.body;

      if (!working_hours) {
        return res.status(400).json({
          success: false,
          error: 'Working hours are required'
        });
      }

      // Validate working hours structure
      const requiredDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      const isValid = requiredDays.every(day => {
        const dayData = working_hours[day];
        return dayData && 
               typeof dayData.enabled === 'boolean' &&
               dayData.start && 
               dayData.end;
      });

      if (!isValid) {
        return res.status(400).json({
          success: false,
          error: 'Invalid working hours format'
        });
      }

      // Check if settings already exist
      const { data: existing } = await supabase
        .from('availability')
        .select('id')
        .limit(1)
        .single();

      if (existing) {
        // Update existing settings
        const { data, error } = await supabase
          .from('availability')
          .update({
            working_hours: working_hours,
            buffer_time: buffer_time || 10,
            timezone: timezone || 'America/Vancouver',
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;

        return res.status(200).json({
          success: true,
          data: {
            id: data.id,
            workingHours: data.working_hours,
            bufferTime: data.buffer_time,
            timezone: data.timezone,
            updated: data.updated_at
          },
          message: 'Availability settings updated successfully'
        });

      } else {
        // Create new settings
        const { data, error } = await supabase
          .from('availability')
          .insert([{
            working_hours: working_hours,
            buffer_time: buffer_time || 10,
            timezone: timezone || 'America/Vancouver'
          }])
          .select()
          .single();

        if (error) throw error;

        return res.status(201).json({
          success: true,
          data: {
            id: data.id,
            workingHours: data.working_hours,
            bufferTime: data.buffer_time,
            timezone: data.timezone,
            updated: data.updated_at
          },
          message: 'Availability settings created successfully'
        });
      }

    } catch (error) {
      console.error('[Availability API] POST Error:', error);
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
