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
        scheduledCalls: data.filter(c => c.call_status === 'scheduled').length,
        completedCalls: data.filter(c => c.call_status === 'completed').length,
        qualifiedCalls: data.filter(c => c.call_status === 'qualified').length,
        qualificationRate: data.length > 0 ? Math.round((data.filter(c => c.call_status === 'qualified').length / data.length) * 100) : 0
      };

      return res.status(200).json({
        success: true,
        data: {
          calls: data.map(call => ({
            id: call.id,
            contactName: call.contact_name,
            company: call.company,
            email: call.email,
            callDate: call.call_date,
            callStatus: call.call_status,
            callSource: call.call_source,
            notes: call.notes,
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

  if (req.method === 'POST') {
    try {
      const { contactName, company, email, callDate, callStatus, callSource, notes } = req.body;

      if (!contactName || !email) {
        return res.status(400).json({
          success: false,
          error: 'Contact name and email are required'
        });
      }

      const { data, error } = await supabase
        .from('discovery_calls')
        .insert([{
          contact_name: contactName,
          company: company || null,
          email: email,
          call_date: callDate || null,
          call_status: callStatus || 'scheduled',
          call_source: callSource || null,
          notes: notes || null
        }])
        .select();

      if (error) throw error;

      return res.status(201).json({
        success: true,
        data: data[0],
        message: 'Call created successfully'
      });

    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  if (req.method === 'PUT') {
    try {
      const { id, contactName, company, email, callDate, callStatus, callSource, notes } = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Call ID is required'
        });
      }

      const updateData = {};
      if (contactName) updateData.contact_name = contactName;
      if (company !== undefined) updateData.company = company;
      if (email) updateData.email = email;
      if (callDate !== undefined) updateData.call_date = callDate;
      if (callStatus) updateData.call_status = callStatus;
      if (callSource !== undefined) updateData.call_source = callSource;
      if (notes !== undefined) updateData.notes = notes;

      const { data, error } = await supabase
        .from('discovery_calls')
        .update(updateData)
        .eq('id', id)
        .select();

      if (error) throw error;

      if (!data || data.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Call not found'
        });
      }

      return res.status(200).json({
        success: true,
        data: data[0],
        message: 'Call updated successfully'
      });

    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { id } = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Call ID is required'
        });
      }

      const { error } = await supabase
        .from('discovery_calls')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return res.status(200).json({
        success: true,
        message: 'Call deleted successfully'
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
