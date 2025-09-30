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
        pipelineValue: data.reduce((sum, d) => sum + (parseFloat(d.value) || 0), 0),
        weightedValue: data.reduce((sum, d) => sum + ((parseFloat(d.value) || 0) * (d.probability || 0) / 100), 0),
        avgDealSize: data.length > 0 ? data.reduce((sum, d) => sum + (parseFloat(d.value) || 0), 0) / data.length : 0
      };

      return res.status(200).json({
        success: true,
        data: {
          deals: data.map(deal => ({
            id: deal.id,
            dealName: deal.deal_name,
            company: deal.company,
            contactName: deal.contact_name,
            value: deal.value,
            stage: deal.stage,
            probability: deal.probability,
            expectedCloseDate: deal.expected_close_date,
            lastContact: deal.last_contact,
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

  return res.status(405).json({ error: 'Method not allowed' });
};
