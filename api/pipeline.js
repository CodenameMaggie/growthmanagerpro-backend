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
        .from('pipeline')
        .select('*')
        .order('expected_close_date', { ascending: true });

      if (error) throw error;

      const stats = {
        totalDeals: data.length,
        pipelineValue: data.reduce((sum, d) => sum + (parseFloat(d.deal_value) || 0), 0),
        weightedValue: data.reduce((sum, d) => sum + ((parseFloat(d.deal_value) || 0) * (parseFloat(d.probability) || 0) / 100), 0),
        avgDealSize: data.length > 0 ? data.reduce((sum, d) => sum + (parseFloat(d.deal_value) || 0), 0) / data.length : 0
      };

      return res.status(200).json({
        success: true,
        data: {
          deals: data.map(deal => ({
            id: deal.id,
            dealName: deal.deal_name,
            contactName: deal.contact_name,
            company: deal.company,
            value: deal.deal_value,
            stage: deal.deal_stage,
            probability: deal.probability,
            expectedClose: deal.expected_close_date,
            notes: deal.notes,
            created: deal.created_at
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
      const { dealName, contactName, company, value, stage, probability, expectedClose, notes } = req.body;

      if (!dealName || !contactName) {
        return res.status(400).json({
          success: false,
          error: 'Deal name and contact name are required'
        });
      }

      const { data, error } = await supabase
        .from('pipeline')
        .insert([{
          deal_name: dealName,
          contact_name: contactName,
          company: company || null,
          deal_value: value || 0,
          deal_stage: stage || 'discovery',
          probability: probability || 0,
          expected_close_date: expectedClose || null,
          notes: notes || null
        }])
        .select();

      if (error) throw error;

      return res.status(201).json({
        success: true,
        data: data[0],
        message: 'Deal created successfully'
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
      const { id, dealName, contactName, company, value, stage, probability, expectedClose, notes } = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Deal ID is required'
        });
      }

      const updateData = {};
      if (dealName) updateData.deal_name = dealName;
      if (contactName) updateData.contact_name = contactName;
      if (company !== undefined) updateData.company = company;
      if (value !== undefined) updateData.deal_value = value;
      if (stage) updateData.deal_stage = stage;
      if (probability !== undefined) updateData.probability = probability;
      if (expectedClose !== undefined) updateData.expected_close_date = expectedClose;
      if (notes !== undefined) updateData.notes = notes;

      const { data, error } = await supabase
        .from('pipeline')
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
      const { id } = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Deal ID is required'
        });
      }

      const { error } = await supabase
        .from('pipeline')
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
