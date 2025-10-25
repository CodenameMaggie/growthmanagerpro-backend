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

  // Route based on 'type' query parameter
  // /api/sprints?type=tasks
  // /api/sprints?type=blockers
  // /api/sprints?type=files
  // /api/sprints?type=stats
  const { type } = req.query;

  // ==================== TASKS ROUTES ====================
  if (type === 'tasks') {
    
    // GET all tasks
    if (req.method === 'GET') {
      try {
        const { data, error } = await supabase
          .from('sprints')
          .select('*')
          .order('due_date', { ascending: true });

        if (error) throw error;

        return res.status(200).json({
          success: true,
          tasks: data.map(task => ({
            id: task.id,
            title: task.task_name,
            status: task.task_status,
            priority: task.priority,
            due_date: task.due_date,
            assigned_to: task.assigned_to,
            notes: task.notes,
            created_at: task.created_at
          }))
        });
      } catch (error) {
        console.error('Error fetching tasks:', error);
        return res.status(500).json({ success: false, error: error.message });
      }
    }

    // POST - Create task
    if (req.method === 'POST') {
      try {
        const { title, status, priority, due_date, assigned_to, notes } = req.body;

        if (!title) {
          return res.status(400).json({ success: false, error: 'Task title is required' });
        }

        const { data, error } = await supabase
          .from('sprints')
          .insert([{
            task_name: title,
            task_status: status || 'todo',
            priority: priority || 'medium',
            due_date: due_date || null,
            assigned_to: assigned_to || null,
            notes: notes || null
          }])
          .select()
          .single();

        if (error) throw error;

        return res.status(201).json({
          success: true,
          task: {
            id: data.id,
            title: data.task_name,
            status: data.task_status,
            priority: data.priority,
            due_date: data.due_date,
            assigned_to: data.assigned_to,
            notes: data.notes
          },
          message: 'Task created successfully'
        });
      } catch (error) {
        console.error('Error creating task:', error);
        return res.status(500).json({ success: false, error: error.message });
      }
    }

    // PUT - Update task
    if (req.method === 'PUT') {
      try {
        const { id, title, status, priority, due_date, assigned_to, notes } = req.body;

        if (!id) {
          return res.status(400).json({ success: false, error: 'Task ID is required' });
        }

        const updateData = {};
        if (title) updateData.task_name = title;
        if (status) updateData.task_status = status;
        if (priority) updateData.priority = priority;
        if (due_date !== undefined) updateData.due_date = due_date;
        if (assigned_to !== undefined) updateData.assigned_to = assigned_to;
        if (notes !== undefined) updateData.notes = notes;

        const { data, error } = await supabase
          .from('sprints')
          .update(updateData)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        return res.status(200).json({
          success: true,
          task: {
            id: data.id,
            title: data.task_name,
            status: data.task_status,
            priority: data.priority,
            due_date: data.due_date,
            assigned_to: data.assigned_to,
            notes: data.notes
          },
          message: 'Task updated successfully'
        });
      } catch (error) {
        console.error('Error updating task:', error);
        return res.status(500).json({ success: false, error: error.message });
      }
    }

    // DELETE - Delete task
    if (req.method === 'DELETE') {
      try {
        const { id } = req.body;

        if (!id) {
          return res.status(400).json({ success: false, error: 'Task ID is required' });
        }

        const { error } = await supabase
          .from('sprints')
          .delete()
          .eq('id', id);

        if (error) throw error;

        return res.status(200).json({
          success: true,
          message: 'Task deleted successfully'
        });
      } catch (error) {
        console.error('Error deleting task:', error);
        return res.status(500).json({ success: false, error: error.message });
      }
    }
  }

  // ==================== BLOCKERS ROUTES ====================
  if (type === 'blockers') {
    
    // GET all blockers
    if (req.method === 'GET') {
      try {
        const { data, error } = await supabase
          .from('blockers')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;

        return res.status(200).json({
          success: true,
          blockers: data || []
        });
      } catch (error) {
        console.error('Error fetching blockers:', error);
        return res.status(500).json({ success: false, error: error.message });
      }
    }

    // POST - Create blocker
    if (req.method === 'POST') {
      try {
        const { title, description } = req.body;

        if (!title) {
          return res.status(400).json({ success: false, error: 'Blocker title is required' });
        }

        const { data, error } = await supabase
          .from('blockers')
          .insert([{ title, description: description || null }])
          .select()
          .single();

        if (error) throw error;

        return res.status(201).json({
          success: true,
          blocker: data,
          message: 'Blocker created successfully'
        });
      } catch (error) {
        console.error('Error creating blocker:', error);
        return res.status(500).json({ success: false, error: error.message });
      }
    }

    // DELETE - Resolve blocker
    if (req.method === 'DELETE') {
      try {
        const { id } = req.body;

        if (!id) {
          return res.status(400).json({ success: false, error: 'Blocker ID is required' });
        }

        const { error } = await supabase
          .from('blockers')
          .delete()
          .eq('id', id);

        if (error) throw error;

        return res.status(200).json({
          success: true,
          message: 'Blocker resolved successfully'
        });
      } catch (error) {
        console.error('Error deleting blocker:', error);
        return res.status(500).json({ success: false, error: error.message });
      }
    }
  }

  // ==================== FILES ROUTES ====================
  if (type === 'files') {
    
    // GET all files
    if (req.method === 'GET') {
      try {
        // TODO: Implement file storage system
        // For now, return empty array
        return res.status(200).json({
          success: true,
          files: []  // File upload feature coming soon
        });
      } catch (error) {
        console.error('Error fetching files:', error);
        return res.status(500).json({ success: false, error: error.message });
      }
    }

    // POST - Upload file
    if (req.method === 'POST') {
      return res.status(501).json({
        success: false,
        message: 'File upload feature coming soon!'
      });
    }
  }

  // ==================== STATS ROUTES ====================
  if (type === 'stats') {
    
    // GET aggregated stats
    if (req.method === 'GET') {
      try {
        // Get task stats from sprints table
        const { data: tasks, error: tasksError } = await supabase
          .from('sprints')
          .select('task_status');

        if (tasksError) throw tasksError;

        const tasksCompleted = tasks ? tasks.filter(t => t.task_status === 'completed').length : 0;
        const tasksTotal = tasks ? tasks.length : 0;

        // Get podcast calls count
        const { count: podcastCount, error: podcastError } = await supabase
          .from('podcast_interviews')
          .select('*', { count: 'exact', head: true });

        if (podcastError) console.error('Podcast error:', podcastError);

        // Get discovery calls count
        const { count: discoveryCount, error: discoveryError } = await supabase
          .from('discovery_calls')
          .select('*', { count: 'exact', head: true });

        if (discoveryError) console.error('Discovery error:', discoveryError);

        // Get leads from prospects
        const { count: leadsCount, error: leadsError } = await supabase
          .from('prospects')
          .select('*', { count: 'exact', head: true });

        if (leadsError) console.error('Prospects error:', leadsError);

        return res.status(200).json({
          success: true,
          stats: {
            podcast_calls: podcastCount || 0,
            discovery_calls: discoveryCount || 0,
            leads_generated: leadsCount || 0,
            tasks_completed: tasksCompleted,
            tasks_total: tasksTotal
          }
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
        return res.status(500).json({ success: false, error: error.message });
      }
    }
  }

  // If no type specified or invalid type
  return res.status(400).json({
    error: 'Invalid request. Use ?type=tasks, ?type=blockers, ?type=files, or ?type=stats'
  });
};
