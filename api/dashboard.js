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

    // ==================== FETCH ALL DATA IN PARALLEL ====================
    const [sprintsResult, podcastResult, discoveryResult, strategyResult, pipelineResult, contactsResult] = await Promise.all([
      supabase.from('sprints').select('*').order('due_date', { ascending: true }),
      supabase.from('podcast_interviews').select('*').order('call_date', { ascending: false }),
      supabase.from('discovery_calls').select('*').order('scheduled_date', { ascending: false }),
      supabase.from('strategy_calls').select('*').order('scheduled_date', { ascending: false }),
      supabase.from('pipeline').select('*').order('stage_order', { ascending: true }),
      supabase.from('contacts').select('*').eq('status', 'new')
    ]);

    const sprints = sprintsResult.data || [];
    const podcastCalls = podcastResult.data || [];
    const discoveryCalls = discoveryResult.data || [];
    const strategyCalls = strategyResult.data || [];
    const pipelineStages = pipelineResult.data || [];
    const newLeads = contactsResult.data || [];

    console.log('[Dashboard API] Data counts:', {
      sprints: sprints.length,
      podcast: podcastCalls.length,
      discovery: discoveryCalls.length,
      strategy: strategyCalls.length,
      pipeline: pipelineStages.length,
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

    // ==================== PODCAST STATS ====================
    const podcastCallsCount = podcastCalls.length;
    const qualifiedCount = podcastCalls.filter(c => (c.qualification_score || 0) >= 35).length;
    const avgScore = podcastCalls.length > 0 
      ? (podcastCalls.reduce((sum, c) => sum + (c.qualification_score || 0), 0) / podcastCalls.length).toFixed(1)
      : '0.0';
    const qualificationRate = podcastCalls.length > 0 ? Math.round((qualifiedCount / podcastCalls.length) * 100) : 0;

    const recentPodcastCalls = podcastCalls.slice(0, 3).map(call => ({
      id: call.id,
      prospect: call.prospect_name || 'Unknown',
      date: call.call_date,
      score: call.qualification_score || 0,
      status: (call.qualification_score || 0) >= 35 ? 'qualified' : 'not-qualified'
    }));

    // ==================== DISCOVERY STATS ====================
    const recentDiscoveryCalls = discoveryCalls.slice(0, 3).map(call => ({
      id: call.id,
      prospect: call.prospect_name || 'Unknown',
      date: call.scheduled_date,
      score: call.qualification_score || 0,
      outcome: call.call_outcome || 'pending'
    }));

    // ==================== PIPELINE STAGES ====================
    const pipelineData = pipelineStages.length > 0 
      ? pipelineStages.map(stage => ({
          name: stage.stage_name || 'Stage',
          count: stage.prospect_count || 0,
          prospects: [] // Can be expanded later with actual prospects
        }))
      : [
          { name: 'Pre-Qualification', count: 0, prospects: [] },
          { name: 'Podcast Scheduled', count: podcastCallsCount, prospects: [] },
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
        strategyCalls: strategyCalls.length
      },

      // Sprint tasks section
      sprints: {
        recentTasks,
        total: sprints.length,
        completionRate: sprints.length > 0 ? Math.round((tasksFinished / sprints.length) * 100) : 0
      },

      // Podcast section
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
          prospect: call.prospect_name || 'Unknown',
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
        totalRevenue: 0, // Can be calculated from deals table
        totalCalls: podcastCallsCount + discoveryCalls.length + strategyCalls.length,
        qualificationRate,
        pipelineMovement: qualifiedCount
      }
    };

    console.log('[Dashboard API] ✅ Response built successfully');

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
