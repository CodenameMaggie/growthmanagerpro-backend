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
  // /api/engagement?type=templates
  // /api/engagement?type=generate
  // /api/engagement?type=current-week
  const { type } = req.query;

  // ==================== GET TEMPLATES ====================
  if (type === 'templates') {
    if (req.method === 'GET') {
      try {
        const { data, error } = await supabase
          .from('engagement_templates')
          .select('*')
          .order('tier_name');

        if (error) throw error;

        return res.status(200).json({
          success: true,
          templates: data || []
        });
      } catch (error) {
        console.error('Error fetching engagement templates:', error);
        return res.status(500).json({ success: false, error: error.message });
      }
    }
  }

  // ==================== GENERATE TASKS ====================
  if (type === 'generate') {
    if (req.method === 'POST') {
      try {
        const { dealId, tierName, startDate } = req.body;

        if (!dealId || !tierName || !startDate) {
          return res.status(400).json({
            success: false,
            error: 'dealId, tierName, and startDate are required'
          });
        }

        console.log('🚀 Starting task generation:', { dealId, tierName, startDate });

        // STEP 1: Get the deal to extract client info
        const { data: deal, error: dealError } = await supabase
          .from('deals')
          .select('*')
          .eq('id', dealId)
          .single();

        if (dealError) throw dealError;
        if (!deal) throw new Error('Deal not found');

        const clientName = deal.client_name || deal.contact_name || 'Client';
        console.log('✅ Found deal for client:', clientName);

       // STEP 2: Get the engagement template
console.log('🔍 Looking for template:', tierName, '(length:', tierName.length, ')');
const { data: template, error: templateError } = await supabase
  .from('engagement_templates')
  .select('*')
  .eq('tier_name', tierName)
  .single();

console.log('📋 Template result:', { template, error: templateError });
        // STEP 3: Calculate end date
        const start = new Date(startDate);
        const endDate = new Date(start);
        endDate.setDate(endDate.getDate() + (template.duration_weeks * 7));

        console.log('📅 Engagement dates:', {
          start: startDate,
          end: endDate.toISOString().split('T')[0],
          weeks: template.duration_weeks
        });

        // STEP 4: Update deal with engagement info
       const { error: updateError } = await supabase
  .from('deals')
  .update({
    engagement_tier: tierName,
    engagement_start_date: startDate,
    engagement_end_date: endDate.toISOString().split('T')[0],
    tasks_generated: true,
    status: 'active',  // ← CORRECT VALUE!
    updated_at: new Date().toISOString()
  })
  .eq('id', dealId);

        if (updateError) throw updateError;
        console.log('✅ Updated deal with engagement info');

        // STEP 5: Generate tasks from template
        const tasksToInsert = [];
        const tasksJson = template.tasks;

        tasksJson.forEach(weekData => {
          weekData.tasks.forEach(taskTemplate => {
            // Calculate due date for this week
            const dueDate = new Date(start);
            dueDate.setDate(dueDate.getDate() + ((weekData.week - 1) * 7));

            // Replace {client_name} placeholder with actual client name
            const title = taskTemplate.title.replace('{client_name}', clientName);
            const description = taskTemplate.description.replace('{client_name}', clientName);

            tasksToInsert.push({
              deal_id: dealId,
              title: title,
              description: description,
              status: 'not_started',
              priority: taskTemplate.priority || 'medium',
              due_date: dueDate.toISOString().split('T')[0],
              engagement_week: weekData.week,
              engagement_tier: tierName,
              auto_generated: true,
              estimated_hours: taskTemplate.estimated_hours || null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
          });
        });

        console.log(`📝 Preparing to insert ${tasksToInsert.length} tasks`);

        // STEP 6: Insert all tasks
        const { data: insertedTasks, error: insertError } = await supabase
          .from('tasks')
          .insert(tasksToInsert)
          .select();

        if (insertError) throw insertError;

        console.log(`✅ Successfully created ${insertedTasks.length} tasks!`);

        return res.status(201).json({
          success: true,
          data: {
            tasksCreated: insertedTasks.length,
            engagement: {
              tier: tierName,
              startDate: startDate,
              endDate: endDate.toISOString().split('T')[0],
              durationWeeks: template.duration_weeks
            }
          },
          message: `Successfully generated ${insertedTasks.length} tasks for ${clientName}`
        });

      } catch (error) {
        console.error('❌ Error generating engagement tasks:', error);
        return res.status(500).json({ success: false, error: error.message });
      }
    }
  }

  // ==================== GET CURRENT WEEK ENGAGEMENTS ====================
  if (type === 'current-week') {
    if (req.method === 'GET') {
      try {
        // Get current date
        const today = new Date();

        // Fetch all deals with active engagements
        const { data: deals, error: dealsError } = await supabase
          .from('deals')
          .select('*')
          .eq('status', 'client')
          .not('engagement_tier', 'is', null)
          .eq('tasks_generated', true);

        if (dealsError) throw dealsError;

        if (!deals || deals.length === 0) {
          return res.status(200).json({ success: true, engagements: [] });
        }

        // For each deal, calculate current week and get tasks
        const engagements = [];

        for (const deal of deals) {
          // Calculate which week we're in
          const startDate = new Date(deal.engagement_start_date);
          const diffTime = today - startDate;
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
          const currentWeek = Math.floor(diffDays / 7) + 1;

          // Get tasks for this week
          const { data: tasks, error: tasksError } = await supabase
            .from('tasks')
            .select('*')
            .eq('deal_id', deal.id)
            .eq('engagement_week', currentWeek)
            .order('priority', { ascending: false });

          if (tasksError) {
            console.error('Error fetching tasks for deal:', deal.id, tasksError);
            continue;
          }

          if (!tasks || tasks.length === 0) continue;

          engagements.push({
            dealId: deal.id,
            client: deal.client_name || deal.contact_name || 'Client',
            currentWeek: currentWeek,
            tier: deal.engagement_tier,
            startDate: deal.engagement_start_date,
            tasks: tasks
          });
        }

        return res.status(200).json({
          success: true,
          engagements: engagements
        });

      } catch (error) {
        console.error('❌ Error fetching current week engagements:', error);
        return res.status(500).json({ success: false, error: error.message });
      }
    }
  }

  // ==================== UPDATE TASK STATUS ====================
  if (type === 'update-task') {
    if (req.method === 'PUT') {
      try {
        const { taskId, status } = req.body;

        if (!taskId || !status) {
          return res.status(400).json({
            success: false,
            error: 'taskId and status are required'
          });
        }

        const { error } = await supabase
          .from('tasks')
          .update({ 
            status: status,
            updated_at: new Date().toISOString()
          })
          .eq('id', taskId);

        if (error) throw error;

        return res.status(200).json({
          success: true,
          message: 'Task status updated successfully'
        });

      } catch (error) {
        console.error('❌ Error updating task status:', error);
        return res.status(500).json({ success: false, error: error.message });
      }
    }
  }

  // If no type specified or invalid type
  return res.status(400).json({
    error: 'Invalid request. Use ?type=templates, ?type=generate, ?type=current-week, or ?type=update-task'
  });
};
