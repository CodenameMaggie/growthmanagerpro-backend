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

  // ==================== GET - Read all tasks for dashboard ====================
  if (req.method === 'GET') {
    try {
      const tenantId = req.query.tenant_id || req.headers['x-tenant-id'];

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          error: 'Tenant ID is required'
        });
      }

      const { data, error } = await supabase
        .from('sprints')
        .select('*')
        .eq('tenant_id', tenantId)  // ✅ ADD TENANT FILTER
        .order('due_date', { ascending: true });

      if (error) throw error;

      // Transform data to match dashboard expectations
      return res.status(200).json({
        success: true,
        tasks: data.map(task => ({
          id: task.id,
          title: task.task_name,              // ← Map task_name to title
          description: task.notes,             // ← Map notes to description
          status: task.task_status,            // ← Keep as-is (dashboard accepts 'in_progress', 'completed')
          priority: task.priority,
          due_date: task.due_date,
          assigned_to: task.assigned_to,
          created_at: task.created_at
        }))
      });

    } catch (error) {
      console.error('Error fetching tasks for dashboard:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
