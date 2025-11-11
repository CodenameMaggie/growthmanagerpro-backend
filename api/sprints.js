const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let type = req.query.type;
  
  if (!type) {
    const pathMatch = req.url.match(/\/api\/sprints\/([^?]+)/);
    type = pathMatch ? pathMatch[1] : null;
  }

  // ==================== ACTION ITEMS ====================
  if (type === 'action-items') {

    if (req.method === 'GET') {
      try {
        const tenantId = req.query.tenant_id || req.headers['x-tenant-id'];

        if (!tenantId) {
          return res.status(400).json({
            success: false,
            error: 'Tenant ID is required'
          });
        }

        const { data: allTasks } = await supabase
          .from('sprints')
          .select('*')
          .eq('tenant_id', tenantId)  // ✅ ADD TENANT FILTER
          .order('due_date', { ascending: true });

        const tasks = {
          podcast: [],
          discovery: [],
          strategy: [],
          client: []
        };

        // Get podcast exceptions
        const { data: podcastCalls } = await supabase
          .from('podcast_interviews')
          .select('*')
          .eq('tenant_id', tenantId)  // ✅ ADD TENANT FILTER
          .or('qualification_score.lt.35,manually_flagged.eq.true')
          .order('call_date', { ascending: false })
          .limit(10);

        if (podcastCalls) {
          tasks.podcast = podcastCalls.map(call => ({
            id: `podcast-${call.id}`,
            title: `${call.prospect_name} - Score ${call.qualification_score}, Needs Review`,
            details: `Review recording to assess fit despite low score`,
            date: call.call_date,
            completed: false
          }));
        }

        // Get discovery follow-ups
        const { data: discoveryCalls } = await supabase
          .from('discovery_calls')
          .select('*')
          .eq('tenant_id', tenantId)  // ✅ ADD TENANT FILTER
          .eq('needs_follow_up', true)
          .order('scheduled_date', { ascending: false })
          .limit(10);

        if (discoveryCalls) {
          tasks.discovery = discoveryCalls.map(call => ({
            id: `discovery-${call.id}`,
            title: `Create Growth Plan for ${call.prospect_name}`,
            details: `Discovery completed. Build custom proposal.`,
            date: call.scheduled_date,
            client: call.prospect_name,
            completed: false
          }));
        }

        // ✅ FIXED: Get strategy calls (not strategy_calls)
        const { data: strategyCalls } = await supabase
          .from('strategy_calls')
          .select('*')
          .eq('tenant_id', tenantId)  // ✅ ADD TENANT FILTER
          .eq('call_outcome', 'contract_signed')
          .eq('onboarded', false)
          .order('scheduled_date', { ascending: false })
          .limit(10);

        if (strategyCalls) {
          tasks.strategy = strategyCalls.map(call => ({
            id: `strategy-${call.id}`,
            title: `Onboard New Client: ${call.prospect_name}`,
            details: `Contract signed. Set up systems, send materials, schedule kickoff.`,
            date: call.scheduled_date,
            client: call.prospect_name,
            completed: false
          }));
        }

        // Get client tasks
        if (allTasks) {
          tasks.client = allTasks
            .filter(task => task.task_type === 'client' || task.contact_id)
            .map(task => ({
              id: task.id,
              title: task.task_name,
              details: task.notes || '',
              date: task.due_date,
              client: task.client_name,
              completed: task.task_status === 'completed'
            }));
        }

        return res.status(200).json({
          success: true,
          tasks
        });

      } catch (error) {
        console.error('Error fetching action items:', error);
        return res.status(500).json({ success: false, error: error.message });
      }
    }
  }

  // ==================== KICKOFF TRIGGER ====================
  if (type === 'trigger-kickoff') {

    if (req.method === 'POST') {
      try {
        const { clientId, clientName, programStartDate } = req.body;
        const tenantId = req.query.tenant_id || req.headers['x-tenant-id'];

        if (!tenantId) {
          return res.status(400).json({
            success: false,
            error: 'Tenant ID is required'
          });
        }

        if (!clientId || !clientName || !programStartDate) {
          return res.status(400).json({
            success: false,
            error: 'Client ID, name, and program start date required'
          });
        }

        const kickoffDate = new Date(programStartDate);
        kickoffDate.setDate(kickoffDate.getDate() + 1);

        // Create task
        const { data: kickoffTask, error: taskError } = await supabase
          .from('sprints')
          .insert([{
            task_name: `Kickoff Call - ${clientName}`,
            task_status: 'todo',
            task_type: 'client',
            priority: 'high',
            due_date: kickoffDate.toISOString().split('T')[0],
            contact_id: clientId,
            client_name: clientName,
            notes: `Initial kickoff call to launch ${clientName}'s program.`,
            tenant_id: tenantId,  // ✅ ADD TENANT ID
            created_at: new Date().toISOString()
          }])
          .select()
          .single();

        if (taskError) throw taskError;

        // Create call record
        const { data: kickoffCall } = await supabase
          .from('discovery_calls')
          .insert([{
            contact_id: clientId,
            prospect_name: clientName,
            call_type: 'kickoff',
            scheduled_date: kickoffDate.toISOString().split('T')[0],
            scheduled_time: '10:00 AM',
            status: 'scheduled',
            notes: 'Program kickoff - auto-scheduled',
            tenant_id: tenantId,  // ✅ ADD TENANT ID
            created_at: new Date().toISOString()
          }])
          .select()
          .single();

        return res.status(201).json({
          success: true,
          message: 'Kickoff call triggered',
          task: kickoffTask,
          call: kickoffCall
        });

      } catch (error) {
        console.error('Error triggering kickoff:', error);
        return res.status(500).json({ success: false, error: error.message });
      }
    }
  }

  // ==================== AUTO-TRIGGER CHECK ====================
  if (type === 'check-auto-triggers') {

    if (req.method === 'GET') {
      try {
        const tenantId = req.query.tenant_id || req.headers['x-tenant-id'];

        if (!tenantId) {
          return res.status(400).json({
            success: false,
            error: 'Tenant ID is required'
          });
        }

        // ✅ FIXED: Check 'contacts' table (not prospects)
        const { data: clients } = await supabase
          .from('contacts')
          .select('id, name, program_start_date')
          .eq('tenant_id', tenantId)  // ✅ ADD TENANT FILTER
          .not('program_start_date', 'is', null)
          .eq('kickoff_created', false);

        const triggered = [];

        for (const client of clients || []) {
          const kickoffDate = new Date(client.program_start_date);
          kickoffDate.setDate(kickoffDate.getDate() + 1);

          const { data: task } = await supabase
            .from('sprints')
            .insert([{
              task_name: `Kickoff Call - ${client.name}`,
              task_status: 'todo',
              task_type: 'client',
              priority: 'high',
              due_date: kickoffDate.toISOString().split('T')[0],
              contact_id: client.id,
              client_name: client.name,
              notes: `Initial kickoff call to launch ${client.name}'s program.`,
              tenant_id: tenantId,  // ✅ ADD TENANT ID
              created_at: new Date().toISOString()
            }])
            .select()
            .single();

          if (task) {
            await supabase
              .from('contacts')
              .update({ kickoff_created: true })
              .eq('id', client.id)
              .eq('tenant_id', tenantId);  // ✅ ADD TENANT CHECK

            triggered.push({
              clientId: client.id,
              clientName: client.name,
              taskId: task.id
            });
          }
        }

        return res.status(200).json({
          success: true,
          message: `Auto-triggered ${triggered.length} kickoff calls`,
          triggered
        });

      } catch (error) {
        console.error('Error checking triggers:', error);
        return res.status(500).json({ success: false, error: error.message });
      }
    }
  }

  // ==================== TASKS ====================
  if (type === 'tasks') {

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

        return res.status(200).json({
          success: true,
          tasks: data.map(task => ({
            id: task.id,
            title: task.task_name,
            status: task.task_status,
            priority: task.priority,
            due_date: task.due_date,
            assigned_to: task.assigned_to,
            contact_id: task.contact_id,
            client_name: task.client_name,
            notes: task.notes,
            created_at: task.created_at
          }))
        });
      } catch (error) {
        console.error('Error fetching tasks:', error);
        return res.status(500).json({ success: false, error: error.message });
      }
    }

    if (req.method === 'POST') {
      try {
        const { title, status, priority, due_date, assigned_to, contact_id, client_name, notes } = req.body;
        const tenantId = req.query.tenant_id || req.headers['x-tenant-id'];

        if (!tenantId) {
          return res.status(400).json({
            success: false,
            error: 'Tenant ID is required'
          });
        }

        if (!title) {
          return res.status(400).json({ success: false, error: 'Task title required' });
        }

        const { data, error } = await supabase
          .from('sprints')
          .insert([{
            task_name: title,
            task_status: status || 'todo',
            priority: priority || 'medium',
            due_date: due_date || null,
            assigned_to: assigned_to || null,
            contact_id: contact_id || null,
            client_name: client_name || null,
            notes: notes || null,
            tenant_id: tenantId  // ✅ ADD TENANT ID
          }])
          .select()
          .single();

        if (error) throw error;

        return res.status(201).json({
          success: true,
          task: data,
          message: 'Task created'
        });
      } catch (error) {
        console.error('Error creating task:', error);
        return res.status(500).json({ success: false, error: error.message });
      }
    }
   } // <-- End of tasks section

  // ==================== BLOCKERS ====================
  if (type === 'blockers') {

    if (req.method === 'GET') {
      try {
        const tenantId = req.query.tenant_id || req.headers['x-tenant-id'];

        if (!tenantId) {
          return res.status(400).json({
            success: false,
            error: 'Tenant ID is required'
          });
        }

        // Get tasks that are blocked
        const { data: blockedTasks } = await supabase
          .from('sprints')
          .select('*')
          .eq('tenant_id', tenantId)  // ✅ ADD TENANT FILTER
          .eq('task_status', 'blocked')
          .order('created_at', { ascending: false });

        // Get discovery calls that need follow-up
        const { data: blockedCalls } = await supabase
          .from('discovery_calls')
          .select('*')
          .eq('tenant_id', tenantId)  // ✅ ADD TENANT FILTER
          .eq('needs_follow_up', true)
          .is('follow_up_completed', null)
          .order('scheduled_date', { ascending: false })
          .limit(5);

        const blockers = [
          ...(blockedTasks || []).map(task => ({
            id: task.id,
            title: task.task_name,
            description: task.notes || 'Task is blocked',
            created_at: task.created_at
          })),
          ...(blockedCalls || []).map(call => ({
            id: `call-${call.id}`,
            title: `Follow-up needed: ${call.prospect_name}`,
            description: call.notes || 'Discovery call requires follow-up',
            created_at: call.scheduled_date
          }))
        ];

        return res.status(200).json({
          success: true,
          blockers: blockers
        });
      } catch (error) {
        console.error('Error fetching blockers:', error);
        return res.status(500).json({ success: false, error: error.message });
      }
    }
  }

  // ==================== FILES ====================
  if (type === 'files') {
    
    if (req.method === 'GET') {
      try {
        return res.status(200).json({
          success: true,
          files: []
        });
      } catch (error) {
        console.error('Error fetching files:', error);
        return res.status(500).json({ success: false, error: error.message });
      }
    }

    if (req.method === 'POST') {
      try {
        return res.status(501).json({
          success: false,
          error: 'File upload not yet implemented'
        });
      } catch (error) {
        console.error('Error uploading file:', error);
        return res.status(500).json({ success: false, error: error.message });
      }
    }
  }

  // ==================== MESSAGES ====================
  if (type === 'messages') {

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
          .from('messages')
          .select('*')
          .eq('tenant_id', tenantId)  // ✅ ADD TENANT FILTER
          .order('created_at', { ascending: false });

        if (error) throw error;

        return res.status(200).json({
          success: true,
          messages: data || []
        });
      } catch (error) {
        console.error('Error fetching messages:', error);
        return res.status(500).json({ success: false, error: error.message });
      }
    }

    if (req.method === 'POST') {
      try {
        const { author, content } = req.body;
        const tenantId = req.query.tenant_id || req.headers['x-tenant-id'];

        if (!tenantId) {
          return res.status(400).json({
            success: false,
            error: 'Tenant ID is required'
          });
        }

        if (!content) {
          return res.status(400).json({ success: false, error: 'Message content required' });
        }

        const { data, error } = await supabase
          .from('messages')
          .insert([{
            author: author || 'Anonymous',
            content: content,
            tenant_id: tenantId  // ✅ ADD TENANT ID
          }])
          .select()
          .single();

        if (error) throw error;

        return res.status(201).json({
          success: true,
          message: data
        });
      } catch (error) {
        console.error('Error creating message:', error);
        return res.status(500).json({ success: false, error: error.message });
      }
    }
  }

  // ==================== STATS ====================
  if (type === 'stats') {

    if (req.method === 'GET') {
      try {
        const tenantId = req.query.tenant_id || req.headers['x-tenant-id'];

        if (!tenantId) {
          return res.status(400).json({
            success: false,
            error: 'Tenant ID is required'
          });
        }

        const { data: tasks } = await supabase
          .from('sprints')
          .select('task_status')
          .eq('tenant_id', tenantId);  // ✅ ADD TENANT FILTER

        const tasksCompleted = tasks ? tasks.filter(t => t.task_status === 'completed').length : 0;
        const tasksTotal = tasks ? tasks.length : 0;

        const { count: podcastCount } = await supabase
          .from('podcast_interviews')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId);  // ✅ ADD TENANT FILTER

        const { count: discoveryCount } = await supabase
          .from('discovery_calls')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId);  // ✅ ADD TENANT FILTER

        // ✅ FIXED: Use 'contacts' table (not prospects)
        const { count: contactsCount } = await supabase
          .from('contacts')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId);  // ✅ ADD TENANT FILTER

        return res.status(200).json({
          success: true,
          stats: {
            podcast_calls: podcastCount || 0,
            discovery_calls: discoveryCount || 0,
            leads_generated: contactsCount || 0,
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

  return res.status(400).json({
    error: 'Invalid request. Use /api/sprints/tasks, /api/sprints/action-items, /api/sprints/trigger-kickoff, /api/sprints/check-auto-triggers, /api/sprints/messages, or /api/sprints/stats'
  });
};
