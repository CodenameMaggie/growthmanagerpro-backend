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
      const [sprintsData, discoveryData, salesData, pipelineData, dealsData, contactsData, campaignsData, podcastData] = await Promise.all([
        supabase.from('sprints').select('*'),
        supabase.from('discovery_calls').select('*'),
        supabase.from('sales_calls').select('*'),
        supabase.from('pipeline').select('*'),
        supabase.from('deals').select('*'),
        supabase.from('contacts').select('*'),
        supabase.from('campaigns').select('*'),
        supabase.from('podcast_interviews').select('*')
      ]);

      const sprints = sprintsData.data || [];
      
      // ✅ FIX 1: Changed "name" to "title" to match frontend expectations
      const sprintStats = {
        total: sprints.length,
        finished: sprints.filter(s => s.task_status === 'completed' || s.task_status === 'finished').length,
        onTrack: sprints.filter(s => s.task_status === 'in_progress' || s.task_status === 'on-track').length,
        offTrack: sprints.filter(s => s.task_status === 'off-track').length,
        blocked: sprints.filter(s => s.task_status === 'blocked').length,
        recentTasks: sprints.slice(0, 5).map(task => ({
          id: task.id,
          title: task.task_name,  // ✅ CHANGED from "name" to "title"
          description: task.notes,
          status: task.task_status,
          priority: task.priority
        })),
        // ✅ FIX 5: Added blockers list
        blockers: sprints
          .filter(s => s.task_status === 'blocked')
          .map(s => s.task_name)
      };

      const podcastCalls = podcastData.data || [];
      const podcastStats = {
        total: podcastCalls.length,
        qualified: podcastCalls.filter(c => (c.qualification_score || 0) >= 35).length,
        avgScore: podcastCalls.length > 0 
          ? (podcastCalls.reduce((sum, c) => sum + (parseFloat(c.qualification_score) || 0), 0) / podcastCalls.length).toFixed(1)
          : '0.0',
        // ✅ FIX 3: Added processing count (set to 0 or calculate based on your logic)
        processing: podcastCalls.filter(c => c.status === 'processing' || c.status === 'pending').length,
        recentCalls: podcastCalls.slice(0, 5).map(call => ({
          id: call.id,
          prospect: call.prospect_name,
          company: call.company,
          score: call.qualification_score,
          date: call.call_date
        }))
      };

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

      const salesCalls = salesData.data || [];
      const salesStats = {
        total: salesCalls.length,
        closed: salesCalls.filter(c => c.deal_status === 'Closed Won').length,
        pending: salesCalls.filter(c => c.deal_status === 'Pending').length
      };

      // ✅ FIX 2: Restructured pipeline to return stages with prospects array
      const pipeline = pipelineData.data || [];
      const pipelineStages = [
        {
          name: 'Qualified',
          prospects: pipeline.filter(p => p.stage === 'Qualified').map(p => ({
            name: p.prospect_name || 'Unknown',
            company: p.company || '',
            notes: p.notes || ''
          }))
        },
        {
          name: 'Proposal',
          prospects: pipeline.filter(p => p.stage === 'Proposal').map(p => ({
            name: p.prospect_name || 'Unknown',
            company: p.company || '',
            notes: p.notes || ''
          }))
        },
        {
          name: 'Negotiation',
          prospects: pipeline.filter(p => p.stage === 'Negotiation').map(p => ({
            name: p.prospect_name || 'Unknown',
            company: p.company || '',
            notes: p.notes || ''
          }))
        },
        {
          name: 'Closing',
          prospects: pipeline.filter(p => p.stage === 'Closing').map(p => ({
            name: p.prospect_name || 'Unknown',
            company: p.company || '',
            notes: p.notes || ''
          }))
        }
      ];

      const pipelineStats = {
        total: pipeline.length,
        qualified: pipeline.filter(p => p.stage === 'Qualified').length,
        proposal: pipeline.filter(p => p.stage === 'Proposal').length,
        negotiation: pipeline.filter(p => p.stage === 'Negotiation').length,
        stages: pipelineStages  // ✅ Added stages array for frontend
      };

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

      const contacts = contactsData.data || [];
      const contactsStats = {
        total: contacts.length,
        leads: contacts.filter(c => c.status === 'Lead').length,
        prospects: contacts.filter(c => c.status === 'Prospect').length,
        customers: contacts.filter(c => c.status === 'Customer').length
      };

      const campaigns = campaignsData.data || [];
      const campaignsStats = {
        total: campaigns.length,
        active: campaigns.filter(c => c.campaign_status === 'active').length,
        totalLeads: campaigns.reduce((sum, c) => sum + (parseInt(c.leads_generated) || 0), 0)
      };

      // Calculate pipeline movement (prospects that moved stages in last 7 days)
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const pipelineMovement = pipeline.filter(p => {
        const date = new Date(p.updated_at || p.created_at);
        return date >= weekAgo;
      }).length;

      // Calculate monthly revenue (deals won this month)
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthlyRevenue = deals
        .filter(d => {
          const dealDate = new Date(d.close_date || d.created_at);
          return d.deal_status === 'won' && dealDate >= firstDayOfMonth;
        })
        .reduce((sum, d) => sum + (parseFloat(d.deal_value) || 0), 0);

      return res.status(200).json({
        success: true,
        data: {
          sprints: sprintStats,
          podcast: podcastStats,  // ✅ Added podcast stats
          discovery: discoveryStats,
          sales: salesStats,
          pipeline: pipelineStats,
          deals: dealsStats,
          contacts: contactsStats,
          campaigns: campaignsStats,
          summary: {
            totalRevenue: dealsStats.revenue,
            monthlyRevenue: monthlyRevenue,  // ✅ FIX 4: Added monthly revenue
            totalCalls: podcastStats.total + discoveryStats.total + salesStats.total,
            qualificationRate: podcastStats.total > 0 
              ? ((podcastStats.qualified / podcastStats.total) * 100).toFixed(0)
              : 0,
            pipelineMovement: pipelineMovement  // ✅ Added pipeline movement
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
