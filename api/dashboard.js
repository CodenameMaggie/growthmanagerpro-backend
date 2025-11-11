const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    console.log('[Dashboard API] Loading unified dashboard data...');

    // Extract tenant_id from request
    const tenantId = req.query.tenant_id || req.headers['x-tenant-id'];

    if (!tenantId) {
      console.error('[Dashboard API] Missing tenant_id in request');
      return res.status(400).json({
        success: false,
        error: 'Tenant ID is required'
      });
    }

    console.log('[Dashboard API] Loading data for tenant:', tenantId);

    // ==================== FETCH ALL DATA IN PARALLEL ====================
    // ✅ NOW WITH TENANT FILTERING - Each query filters by tenant_id
    const [sprintsResult, podcastResult, prequalResult, discoveryResult, strategyResult, pipelineResult, contactsResult] = await Promise.all([
      supabase.from('sprints').select('*').eq('tenant_id', tenantId).order('due_date', { ascending: true }),
      supabase.from('podcast_interviews').select('*').eq('tenant_id', tenantId).order('scheduled_date', { ascending: false }),
      supabase.from('pre_qualification_calls').select('*').eq('tenant_id', tenantId).order('scheduled_date', { ascending: false }),
      supabase.from('discovery_calls').select('*').eq('tenant_id', tenantId).order('call_date', { ascending: false }),
      supabase.from('strategy_calls').select('*').eq('tenant_id', tenantId).order('scheduled_date', { ascending: false }),
      supabase.from('pipeline').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
      supabase.from('contacts').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false })
    ]);

    const sprints = sprintsResult.data || [];
    const podcastCalls = podcastResult.data || [];
    const prequalCalls = prequalResult.data || [];
    const discoveryCalls = discoveryResult.data || [];
    const strategyCalls = strategyResult.data || [];
    const pipelineStages = pipelineResult.data || [];
    const allContacts = contactsResult.data || [];

    // Calculate new leads (contacts added in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const newLeads = allContacts.filter(c => {
      if (!c.created_at) return false;
      return new Date(c.created_at) > thirtyDaysAgo;
    });

    console.log('[Dashboard API] Data counts:', {
      sprints: sprints.length,
      podcast: podcastCalls.length,
      prequal: prequalCalls.length,
      discovery: discoveryCalls.length,
      strategy: strategyCalls.length,
      pipeline: pipelineStages.length,
      totalContacts: allContacts.length,
      newLeads: newLeads.length
    });

    // ==================== TASKS STATS ====================
    const tasksFinished = sprints.filter(t => t.task_status === 'completed' || t.task_status === 'finished').length;
    const tasksOnTrack = sprints.filter(t => t.task_status === 'on-track' || t.task_status === 'in-progress' || t.task_status === 'in_progress').length;
    const tasksOffTrack = sprints.filter(t => t.task_status === 'off-track' || t.task_status === 'off_track').length;
    const tasksBlocked = sprints.filter(t => t.task_status === 'blocked').length;

    // Recent tasks for display
    const recentTasks = sprints.slice(0, 5).map(task => ({
      id: task.id,
      title: task.task_name || 'Untitled Task',
      description: task.notes || 'No description',
      status: task.task_status || 'todo'
    }));

    // ==================== PODCAST + PREQUAL STATS ====================
    // Combine podcast interviews and pre-qualification calls
    // Note: pre_qualification_calls uses 'ai_score', podcast_interviews uses 'qualification_score'
    const allPodcastCalls = [
      ...podcastCalls.map(c => ({ ...c, score: c.qualification_score || 0 })),
      ...prequalCalls.map(c => ({ ...c, score: c.ai_score || 0 }))
    ];
    
    const podcastCallsCount = allPodcastCalls.length;
    const qualifiedCount = allPodcastCalls.filter(c => (c.score) >= 35).length;
    const avgScore = allPodcastCalls.length > 0 
      ? (allPodcastCalls.reduce((sum, c) => sum + (c.score), 0) / allPodcastCalls.length).toFixed(1)
      : '0.0';
    const qualificationRate = allPodcastCalls.length > 0 ? Math.round((qualifiedCount / allPodcastCalls.length) * 100) : 0;

    const recentPodcastCalls = allPodcastCalls.slice(0, 3).map(call => ({
      id: call.id,
      prospect: call.guest_name || 'Unknown',  // FIXED: uses guest_name not prospect_name
      date: call.scheduled_date || call.call_date,
      score: call.score,
      status: call.score >= 35 ? 'qualified' : 'not-qualified'
    }));

    // ==================== DISCOVERY STATS ====================
    const recentDiscoveryCalls = discoveryCalls.slice(0, 3).map(call => ({
      id: call.id,
      prospect: call.contact_name || call.guest_name || 'Unknown',  // FIXED: uses contact_name
      date: call.call_date,  // FIXED: call_date not scheduled_date
      score: call.ai_score || 0,
      outcome: call.call_status || 'pending'
    }));

    // ==================== PIPELINE STAGES ====================
    const pipelineData = pipelineStages.length > 0 
      ? pipelineStages.map(stage => ({
          name: stage.deal_stage || stage.stage || 'Stage',
          count: 1,
          prospects: []
        }))
      : [
          { name: 'New Leads', count: newLeads.length, prospects: [] },
          { name: 'Pre-Qualification', count: prequalCalls.length, prospects: [] },
          { name: 'Podcast Scheduled', count: podcastCalls.length, prospects: [] },
          { name: 'Qualified for Discovery', count: qualifiedCount, prospects: [] },
          { name: 'Discovery Scheduled', count: discoveryCalls.length, prospects: [] },
          { name: 'Strategy Call', count: strategyCalls.length, prospects: [] },
          { name: 'Proposal Sent', count: 0, prospects: [] },
          { name: 'Negotiation', count: 0, prospects: [] },
          { name: 'Closed Won', count: 0, prospects: [] }
        ];

    // ==================== BUILD RESPONSE ====================
    const dashboardData = {
      // Top stat cards
      stats: {
        tasksFinished,
        tasksOnTrack,
        tasksOffTrack,
        tasksBlocked,
        podcastCalls: podcastCallsCount,
        qualifiedForDiscovery: qualifiedCount,
        newLeads: newLeads.length,
        strategyCalls: strategyCalls.length,
        totalContacts: allContacts.length
      },

      // Sprint tasks section
      sprints: {
        recentTasks,
        total: sprints.length,
        completionRate: sprints.length > 0 ? Math.round((tasksFinished / sprints.length) * 100) : 0
      },

      // Podcast section (includes pre-qual calls)
      podcast: {
        totalCalls: podcastCallsCount,
        qualificationRate,
        avgScore,
        recentCalls: recentPodcastCalls
      },

      // Discovery section
      discovery: {
        totalCalls: discoveryCalls.length,
        recentCalls: recentDiscoveryCalls
      },

      // Strategy section
      strategy: {
        totalCalls: strategyCalls.length,
        recentCalls: strategyCalls.slice(0, 3).map(call => ({
          id: call.id,
          prospect: call.contact_name || call.guest_name || 'Unknown',
          date: call.scheduled_date,
          tier: call.recommended_tier || 'N/A'
        }))
      },

      // Pipeline section
      pipeline: {
        stages: pipelineData
      },

      // Summary metrics
      summary: {
        totalRevenue: 0,
        totalCalls: podcastCallsCount + discoveryCalls.length + strategyCalls.length,
        totalContacts: allContacts.length,
        qualificationRate,
        pipelineMovement: qualifiedCount
      }
    };

    console.log('[Dashboard API] ✅ Response built successfully');
    console.log('[Dashboard API] Summary:', {
      totalContacts: allContacts.length,
      newLeads: newLeads.length,
      totalCalls: dashboardData.summary.totalCalls,
      prequalCalls: prequalCalls.length,
      podcastCalls: podcastCalls.length,
      discoveryCalls: discoveryCalls.length,
      strategyCalls: strategyCalls.length
    });

    return res.status(200).json({
      success: true,
      data: dashboardData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Dashboard API] ❌ Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
};
