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
        .order('due_date', { ascending: true });

      if (error) throw error;

      const stats = {
        totalTasks: data.length,
        todoTasks: data.filter(t => t.task_status === 'todo').length,
        inProgressTasks: data.filter(t => t.task_status === 'in_progress').length,
        completedTasks: data.filter(t => t.task_status === 'completed').length
      };

      return res.status(200).json({
        success: true,
        data: {
          tasks: data.map(task => ({
            id: task.id,
            taskName: task.task_name,
            taskStatus: task.task_status,
            priority: task.priority,
            dueDate: task.due_date,
            assignedTo: task.assigned_to,
            notes: task.notes,
            created: task.created_at
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

  if (req.method === 'POST') {
    try {
      const { taskName, taskStatus, priority, dueDate, assignedTo, notes } = req.body;

      if (!taskName) {
        return res.status(400).json({
          success: false,
          error: 'Task name is required'
        });
      }

      const { data, error } = await supabase
        .from('sprints')
        .insert([{
          task_name: taskName,
          task_status: taskStatus || 'todo',
          priority: priority || 'medium',
          due_date: dueDate || null,
          assigned_to: assignedTo || null,
          notes: notes || null
        }])
        .select();

      if (error) throw error;

      return res.status(201).json({
        success: true,
        data: data[0],
        message: 'Task created successfully'
      });

    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  if (req.method === 'PUT') {
    try {
      const { id, taskName, taskStatus, priority, dueDate, assignedTo, notes } = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Task ID is required'
        });
      }

      const updateData = {};
      if (taskName) updateData.task_name = taskName;
      if (taskStatus) updateData.task_status = taskStatus;
      if (priority) updateData.priority = priority;
      if (dueDate !== undefined) updateData.due_date = dueDate;
      if (assignedTo !== undefined) updateData.assigned_to = assignedTo;
      if (notes !== undefined) updateData.notes = notes;

      const { data, error } = await supabase
        .from('sprints')
        .update(updateData)
        .eq('id', id)
        .select();

      if (error) throw error;

      if (!data || data.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Task not found'
        });
      }

      return res.status(200).json({
        success: true,
        data: data[0],
        message: 'Task updated successfully'
      });

    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { id } = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Task ID is required'
        });
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
      console.error('Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
