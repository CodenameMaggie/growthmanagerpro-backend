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
        .from('sprints')
        .select('*')
        .order('start_date', { ascending: false });

      if (error) throw error;

      const stats = {
        totalSprints: data.length,
        activeSprints: data.filter(s => s.status === 'Active').length,
        completedSprints: data.filter(s => s.status === 'Completed').length,
        totalTasksCompleted: data.reduce((sum, s) => sum + (s.tasks_completed || 0), 0),
        totalTasksRemaining: data.reduce((sum, s) => sum + (s.tasks_remaining || 0), 0)
      };

      return res.status(200).json({
        success: true,
        data: {
          sprints: data.map(sprint => ({
            id: sprint.id,
            sprintName: sprint.sprint_name,
            startDate: sprint.start_date,
            endDate: sprint.end_date,
            goal: sprint.goal,
            status: sprint.status,
            teamMembers: sprint.team_members,
            tasksCompleted: sprint.tasks_completed,
            tasksRemaining: sprint.tasks_remaining,
            created: sprint.created_at
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
