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
        .from('deals')
        .select('*')
        .order('close_date', { ascending: false });

      if (error) throw error;

      const stats = {
        totalDeals: data.length,
        wonDeals: data.filter(d => d.deal_status === 'won').length,
        totalRevenue: data.filter(d => d.deal_status === 'won').reduce((sum, d) => sum + (parseFloat(d.deal_value) || 0), 0),
        avgDealSize: data.filter(d => d.deal_status === 'won').length > 0 
          ? data.filter(d => d.deal_status === 'won').reduce((sum, d) => sum + (parseFloat(d.deal_value) || 0), 0) / data.filter(d => d.deal_status === 'won').length 
          : 0
      };

      return res.status(200).json({
        success: true,
        data: {
          deals: data.map(deal => ({
            id: deal.id,
            dealName: deal.deal_name,
            clientName: deal.client_name,
            company: deal.company,
            dealValue: deal.deal_value,
            dealStatus: deal.deal_status,
            closeDate: deal.close_date,
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
      const { dealName, clientName, company, dealValue, dealStatus, closeDate, notes } = req.body;

      if (!dealName || !clientName) {
        return res.status(400).json({
          success: false,
          error: 'Deal name and client name are required'
        });
      }

      const { data, error } = await supabase
        .from('deals')
        .insert([{
          deal_name: dealName,
          client_name: clientName,
          company: company || null,
          deal_value: dealValue || 0,
          deal_status: dealStatus || 'won',
          close_date: closeDate || null,
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
      const { id, dealName, clientName, company, dealValue, dealStatus, closeDate, notes } = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Deal ID is required'
        });
      }

      const updateData = {};
      if (dealName) updateData.deal_name = dealName;
      if (clientName) updateData.client_name = clientName;
      if (company !== undefined) updateData.company = company;
      if (dealValue !== undefined) updateData.deal_value = dealValue;
      if (dealStatus) updateData.deal_status = dealStatus;
      if (closeDate !== undefined) updateData.close_date = closeDate;
      if (notes !== undefined) updateData.notes = notes;

      const { data, error } = await supabase
        .from('deals')
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
        .from('deals')
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
