const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Get ID from query params
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({
      success: false,
      error: 'Deal ID is required'
    });
  }

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      if (!data) {
        return res.status(404).json({
          success: false,
          error: 'Deal not found'
        });
      }

      return res.status(200).json({
        success: true,
        data: data
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
      const { 
        name, 
        company, 
        email,
        contract_value,
        payment_model,
        current_phase,
        progress_percentage,
        systems_delivered,
        leads_generated,
        revenue_generated,
        roi,
        status
      } = req.body;

      const updateData = {
        updated_at: new Date().toISOString()
      };
      
      if (name) updateData.name = name;
      if (company !== undefined) updateData.company = company;
      if (email) updateData.email = email;
      if (contract_value !== undefined) updateData.contract_value = contract_value;
      if (payment_model) updateData.payment_model = payment_model;
      if (current_phase) updateData.current_phase = current_phase;
      if (progress_percentage !== undefined) updateData.progress_percentage = progress_percentage;
      if (systems_delivered) updateData.systems_delivered = systems_delivered;
      if (leads_generated !== undefined) updateData.leads_generated = leads_generated;
      if (revenue_generated !== undefined) updateData.revenue_generated = revenue_generated;
      if (roi !== undefined) updateData.roi = roi;
      if (status) updateData.status = status;

      const { data, error } = await supabase
        .from('contacts')
        .update(updateData)
        .eq('id', id)
        .select();

      if (error) throw error;

      if (!data || data.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Deal not found'
        });
      }

      return res.status(200).json({
        success: true,
        data: data[0],
        message: 'Deal updated successfully'
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
      const { error } = await supabase
        .from('contacts')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return res.status(200).json({
        success: true,
        message: 'Deal deleted successfully'
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
