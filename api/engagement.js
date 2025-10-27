/** 
 * ENGAGEMENT SYSTEM API
 * 
 * Functions to manage engagement templates and auto-generate tasks
 * when clients sign on to a specific tier.
 * 
 * Usage:
 * - getEngagementTemplates() - Get all available tiers
 * - generateEngagementTasks(dealId, tierName, startDate) - Auto-create tasks for a client
 */

import { supabase } from './supabase-client.js';

/**
 * Get all engagement templates
 * @returns {Object} { success: boolean, data: array }
 */
export async function getEngagementTemplates() {
    try {
        const { data, error } = await supabase
            .from('engagement_templates')
            .select('*')
            .order('tier_name');

        if (error) throw error;
        
        console.log('✅ Fetched engagement templates:', data?.length);
        return { success: true, data };
    } catch (error) {
        console.error('❌ Error fetching engagement templates:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Generate tasks from engagement template
 * This is the main function that creates all week-by-week tasks when a deal closes
 * 
 * @param {string} dealId - The deal ID
 * @param {string} tierName - Engagement tier name (e.g., "Strategic Foundations")
 * @param {string} startDate - Start date for the engagement (YYYY-MM-DD format)
 * @returns {Object} { success: boolean, data: object }
 */
export async function generateEngagementTasks(dealId, tierName, startDate) {
    try {
        console.log('🚀 Starting task generation:', { dealId, tierName, startDate });

        // STEP 1: Get the deal to extract client info
        const { data: deal, error: dealError } = await supabase
            .from('deals')
            .select('*, contacts(*)')
            .eq('id', dealId)
            .single();

        if (dealError) throw dealError;
        if (!deal) throw new Error('Deal not found');

        const clientName = deal.contacts?.company || deal.contacts?.name || 'Client';
        console.log('✅ Found deal for client:', clientName);

        // STEP 2: Get the engagement template
        const { data: template, error: templateError } = await supabase
            .from('engagement_templates')
            .select('*')
            .eq('tier_name', tierName)
            .single();

        if (templateError) throw templateError;
        if (!template) throw new Error(`Template not found: ${tierName}`);
        
        console.log(`✅ Found template: ${template.duration_weeks} weeks`);

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
                status: 'client', // Mark as client
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
                    contact_id: deal.contact_id,
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

        return {
            success: true,
            data: {
                tasksCreated: insertedTasks.length,
                tasks: insertedTasks,
                engagement: {
                    tier: tierName,
                    startDate: startDate,
                    endDate: endDate.toISOString().split('T')[0],
                    durationWeeks: template.duration_weeks
                }
            }
        };
    } catch (error) {
        console.error('❌ Error generating engagement tasks:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get tasks for a specific engagement week
 * @param {string} dealId - The deal ID
 * @param {number} week - Week number (1-12, 1-52, etc.)
 * @returns {Object} { success: boolean, data: array }
 */
export async function getEngagementWeekTasks(dealId, week) {
    try {
        const { data, error } = await supabase
            .from('tasks')
            .select('*')
            .eq('deal_id', dealId)
            .eq('engagement_week', week)
            .order('priority', { ascending: false })
            .order('title');

        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('❌ Error fetching week tasks:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get all tasks for an engagement grouped by week
 * Useful for displaying the entire engagement timeline
 * 
 * @param {string} dealId - The deal ID
 * @returns {Object} { success: boolean, data: object }
 */
export async function getEngagementAllTasks(dealId) {
    try {
        const { data, error } = await supabase
            .from('tasks')
            .select('*')
            .eq('deal_id', dealId)
            .eq('auto_generated', true)
            .order('engagement_week')
            .order('priority', { ascending: false });

        if (error) throw error;

        // Group by week
        const tasksByWeek = {};
        data.forEach(task => {
            const week = task.engagement_week;
            if (!tasksByWeek[week]) {
                tasksByWeek[week] = [];
            }
            tasksByWeek[week].push(task);
        });

        return { success: true, data: tasksByWeek };
    } catch (error) {
        console.error('❌ Error fetching engagement tasks:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get current week tasks for all active engagements
 * This powers the "Current Week Engagements" section on sprints page
 * 
 * @returns {Object} { success: boolean, data: array }
 */
export async function getCurrentWeekEngagements() {
    try {
        // Get current date
        const today = new Date();
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6); // Saturday

        // Fetch all deals with active engagements
        const { data: deals, error: dealsError } = await supabase
            .from('deals')
            .select('*, contacts(*)')
            .eq('status', 'client')
            .not('engagement_tier', 'is', null)
            .eq('tasks_generated', true);

        if (dealsError) throw dealsError;

        if (!deals || deals.length === 0) {
            return { success: true, data: [] };
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

            if (tasksError) continue;
            if (!tasks || tasks.length === 0) continue;

            engagements.push({
                deal: deal,
                client: deal.contacts?.company || deal.contacts?.name || 'Client',
                currentWeek: currentWeek,
                tier: deal.engagement_tier,
                tasks: tasks
            });
        }

        return { success: true, data: engagements };
    } catch (error) {
        console.error('❌ Error fetching current week engagements:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Update task status
 * @param {string} taskId - The task ID
 * @param {string} status - New status ('not_started', 'in_progress', 'completed')
 * @returns {Object} { success: boolean }
 */
export async function updateTaskStatus(taskId, status) {
    try {
        const { error } = await supabase
            .from('tasks')
            .update({ 
                status: status,
                updated_at: new Date().toISOString()
            })
            .eq('id', taskId);

        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error('❌ Error updating task status:', error);
        return { success: false, error: error.message };
    }
}
