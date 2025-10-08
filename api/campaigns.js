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
        .from('campaigns')
        .select('*')
        .order('start_date', { ascending: false });

      if (error) throw error;

      const stats = {
        totalCampaigns: data.length,
        activeCampaigns: data.filter(c => c.campaign_status === 'active').length,
        totalLeads: data.reduce((sum, c) => sum + (parseInt(c.leads_generated) || 0), 0),
        totalResponses: data.reduce((sum, c) => sum + (parseInt(c.responses) || 0), 0)
      };

      return res.status(200).json({
        success: true,
        data: {
          campaigns: data.map(campaign => ({
            id: campaign.id,
            campaignName: campaign.campaign_name,
            campaignType: campaign.campaign_type,
            campaignStatus: campaign.campaign_status,
            startDate: campaign.start_date,
            endDate: campaign.end_date,
            leadsGenerated: campaign.leads_generated,
            responses: campaign.responses,
            notes: campaign.notes,
            created: campaign.created_at
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
      const { campaignName, campaignType, campaignStatus, startDate, endDate, leadsGenerated, responses, notes } = req.body;

      if (!campaignName) {
        return res.status(400).json({
          success: false,
          error: 'Campaign name is required'
        });
      }

      const { data, error } = await supabase
        .from('campaigns')
        .insert([{
          campaign_name: campaignName,
          campaign_type: campaignType || 'email',
          campaign_status: campaignStatus || 'active',
          start_date: startDate || null,
          end_date: endDate || null,
          leads_generated: leadsGenerated || 0,
          responses: responses || 0,
          notes: notes || null
        }])
        .select();

      if (error) throw error;

      return res.status(201).json({
        success: true,
        data: data[0],
        message: 'Campaign created successfully'
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
      const { id, campaignName, campaignType, campaignStatus, startDate, endDate, leadsGenerated, responses, notes } = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Campaign ID is required'
        });
      }

      const updateData = {};
      if (campaignName) updateData.campaign_name = campaignName;
      if (campaignType) updateData.campaign_type = campaignType;
      if (campaignStatus) updateData.campaign_status = campaignStatus;
      if (startDate !== undefined) updateData.start_date = startDate;
      if (endDate !== undefined) updateData.end_date = endDate;
      if (leadsGenerated !== undefined) updateData.leads_generated = leadsGenerated;
      if (responses !== undefined) updateData.responses = responses;
      if (notes !== undefined) updateData.notes = notes;

      const { data, error } = await supabase
        .from('campaigns')
        .update(updateData)
        .eq('id', id)
        .select();

      if (error) throw error;

      if (!data || data.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found'
        });
      }

      return res.status(200).json({
        success: true,
        data: data[0],
        message: 'Campaign updated successfully'
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
          error: 'Campaign ID is required'
        });
      }

      const { error } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return res.status(200).json({
        success: true,
        message: 'Campaign deleted successfully'
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
