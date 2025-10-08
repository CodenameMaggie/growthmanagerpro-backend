const { createClient } = require('@supabase/supabase-js'); 

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    try {
      // Fetch data from all tables
      const [sprintsData, discoveryData, salesData, pipelineData, dealsData, contactsData, campaignsData] = await Promise.all([
        supabase.from('sprints').select('*'),
        supabase.from('discovery_calls').select('*'),
        supabase.from('sales_calls').select('*'),
        supabase.from('pipeline').select('*'),
        supabase.from('deals').select('*'),
        supabase.from('contacts').select('*'),
        supabase.from('campaigns').select('*')
      ]);

      // Sprint Tasks Stats
      const sprints = sprintsData.data || [];
      const sprintStats = {
        total: sprints.length,
        finished: sprints.filter(s => s.task_status === 'completed').length,
        onTrack: sprints.filter(s => s.task_status === 'in_progress').length,
        blocked: sprints.filter(s => s.task_status === 'todo' && s.priority === 'high').length,
        recentTasks: sprints.slice(0, 4).map(task => ({
          id: task.id,
          name: task.task_name,
          description: task.notes,
          status: task.task_status,
          priority: task.priority
        }))
      };

      // Discovery Calls Stats
      const discoveryCalls = discoveryData.data || [];
      const discoveryStats = {
        total: discoveryCalls.length,
        qualified: discoveryCalls.filter(c => c.call_outcome === 'Qualified').length,
        avgScore: discoveryCalls.length > 0 
          ? (discoveryCalls.reduce((sum, c) => sum + (parseFloat(c.qualification_score) || 0), 0) / discoveryCalls.length).toFixed(1)
          : 0,
        recentCalls: discoveryCalls.slice(0, 3).map(call => ({
          id: call.id,
          prospect: call.prospect_name,
          company: call.company,
          score: call.qualification_score,
          outcome: call.call_outcome,
          date: call.call_date
        }))
      };

      // Sales Calls Stats
      const salesCalls = salesData.data || [];
      const salesStats = {
        total: salesCalls.length,
        closed: salesCalls.filter(c => c.deal_status === 'Closed Won').length,
        pending: salesCalls.filter(c => c.deal_status === 'Pending').length
      };

      // Pipeline Stats
      const pipeline = pipelineData.data || [];
      const pipelineStats = {
        total: pipeline.length,
        qualified: pipeline.filter(p => p.stage === 'Qualified').length,
        proposal: pipeline.filter(p => p.stage === 'Proposal').length,
        negotiation: pipeline.filter(p => p.stage === 'Negotiation').length
      };

      // Deals Stats
      const deals = dealsData.data || [];
      const wonDeals = deals.filter(d => d.deal_status === 'won');
      const dealsStats = {
        total: deals.length,
        won: wonDeals.length,
        revenue: wonDeals.reduce((sum, d) => sum + (parseFloat(d.deal_value) || 0), 0),
        avgDealSize: wonDeals.length > 0 
          ? wonDeals.reduce((sum, d) => sum + (parseFloat(d.deal_value) || 0), 0) / wonDeals.length
          : 0
      };

      // Contacts Stats
      const contacts = contactsData.data || [];
      const contactsStats = {
        total: contacts.length,
        leads: contacts.filter(c => c.status === 'Lead').length,
        prospects: contacts.filter(c => c.status === 'Prospect').length,
        customers: contacts.filter(c => c.status === 'Customer').length
      };

      // Campaigns Stats
      const campaigns = campaignsData.data || [];
      const campaignsStats = {
        total: campaigns.length,
        active: campaigns.filter(c => c.campaign_status === 'active').length,
        totalLeads: campaigns.reduce((sum, c) => sum + (parseInt(c.leads_generated) || 0), 0)
      };

      return res.status(200).json({
        success: true,
        data: {
          sprints: sprintStats,
          discovery: discoveryStats,
          sales: salesStats,
          pipeline: pipelineStats,
          deals: dealsStats,
          contacts: contactsStats,
          campaigns: campaignsStats,
          summary: {
            totalRevenue: dealsStats.revenue,
            totalCalls: discoveryStats.total + salesStats.total,
            qualificationRate: discoveryStats.total > 0 
              ? ((discoveryStats.qualified / discoveryStats.total) * 100).toFixed(0)
              : 0,
            pipelineMovement: pipeline.filter(p => {
              const date = new Date(p.updated_at || p.created_at);
              const weekAgo = new Date();
              weekAgo.setDate(weekAgo.getDate() - 7);
              return date >= weekAgo;
            }).length
          }
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
