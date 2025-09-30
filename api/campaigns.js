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
        activeCampaigns: data.filter(c => c.status === 'Active').length,
        pausedCampaigns: data.filter(c => c.status === 'Paused').length,
        completedCampaigns: data.filter(c => c.status === 'Completed').length
      };

      return res.status(200).json({
        success: true,
        data: {
          campaigns: data.map(campaign => ({
            id: campaign.id,
            campaignName: campaign.campaign_name,
            campaignType: campaign.campaign_type,
            startDate: campaign.start_date,
            endDate: campaign.end_date,
            status: campaign.status,
            targetAudience: campaign.target_audience,
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

  return res.status(405).json({ error: 'Method not allowed' });
};
