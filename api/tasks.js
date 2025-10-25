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
      const { data, error } = await supabase
        .from('sprints')
        .select('*')
        .order('due_date', { ascending: true });

      if (error) throw error;

      // Map to what dashboard expects
      return res.status(200).json({
        success: true,
        tasks: data.map(task => ({
          id: task.id,
          title: task.task_name,
          description: task.notes,
          status: task.task_status,  // Maps: 'completed', 'in_progress' → dashboard accepts both
          priority: task.priority,
          due_date: task.due_date,
          assigned_to: task.assigned_to
        }))
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
