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

    try {
        // GET - Fetch all sales calls with stats
        if (req.method === 'GET') {
            const { data: calls, error } = await supabase
                .from('sales_calls')
                .select('*')
                .order('scheduled_date', { ascending: false });

            if (error) throw error;

            // Calculate stats
            const totalDeals = calls.length;
            const scheduledCalls = calls.filter(c => c.call_status === 'scheduled').length;
            const closedDeals = calls.filter(c => c.call_status === 'won').length;
            const pipelineValue = calls
                .filter(c => c.call_status !== 'lost')
                .reduce((sum, c) => sum + (parseFloat(c.deal_value) || 0), 0);

            // 🔧 TRANSFORM TO CAMELCASE - Match HTML expectations
            const transformedCalls = calls.map(call => ({
                id: call.id,
                prospectName: call.prospect_name,
                email: call.email,
                company: call.company,
                callDate: call.scheduled_date,
                dealValue: call.deal_value,
                callStatus: call.call_status,
                notes: call.notes,
                contactId: call.contact_id,
                pipelineCreated: call.pipeline_created,
                pipelineId: call.pipeline_id,
                created: call.created_at
            }));

            return res.status(200).json({
                success: true,
                data: {
                    calls: transformedCalls,
                    stats: {
                        totalDeals,
                        scheduledCalls,
                        closedDeals,
                        pipelineValue
                    }
                }
            });
        }

        // POST - Create new sales call
        if (req.method === 'POST') {
            const salesCallData = req.body;

            const { data: newCall, error } = await supabase
                .from('sales_calls')
                .insert([salesCallData])
                .select()
                .single();

            if (error) throw error;

            return res.status(201).json({
                success: true,
                data: newCall
            });
        }

        // PUT - Update sales call
        if (req.method === 'PUT') {
            const { id, ...updateData } = req.body;

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: 'Sales call ID is required'
                });
            }

            // Get the current sales call data
            const { data: currentCall, error: fetchError } = await supabase
                .from('sales_calls')
                .select('*')
                .eq('id', id)
                .single();

            if (fetchError) throw fetchError;

            // Update the sales call
            const { data: updatedCall, error: updateError } = await supabase
                .from('sales_calls')
                .update(updateData)
                .eq('id', id)
                .select()
                .single();

            if (updateError) throw updateError;

            // 🤖 AUTOMATION: If status changed to "won", auto-create pipeline entry
            const statusChangedToWon = 
                currentCall.call_status !== 'won' && 
                updateData.call_status === 'won' &&
                !currentCall.pipeline_created;

            if (statusChangedToWon) {
                console.log('[Sales Calls] 🤖 Auto-creating pipeline entry for won deal:', id);

                // Create pipeline entry
                const pipelineData = {
                    name: `Deal - ${updatedCall.prospect_name}`,
                    contact_id: updatedCall.contact_id,
                    value: updatedCall.deal_value || 0,
                    stage: 'closed',
                    status: 'won',
                    auto_created: true,
                    expected_close_date: updatedCall.scheduled_date,
                    sales_call_id: updatedCall.id,
                    expected_close_date: updatedCall.call_date,
                    notes: `Auto-created from sales call on ${new Date().toISOString()}`
                };

                const { data: pipelineEntry, error: pipelineError } = await supabase
                    .from('pipeline')
                    .insert([pipelineData])
                    .select()
                    .single();

                if (pipelineError) {
                    console.error('[Sales Calls] ❌ Error creating pipeline entry:', pipelineError);
                } else {
                    console.log('[Sales Calls] ✅ Pipeline entry created:', pipelineEntry.id);

                    // Mark sales call as having created pipeline entry
                    await supabase
                        .from('sales_calls')
                        .update({ 
                            pipeline_created: true,
                            pipeline_id: pipelineEntry.id 
                        })
                        .eq('id', id);
                    
                    // 📧 Send welcome email with weekly check-in link
                const emailBody = `
                Hi ${updatedCall.prospect_name},
                
                Welcome to the partnership! 🎉
                
                Let's schedule your weekly check-in calls:
                https://calendly.com/maggie-maggieforbesstrategies/weekly-check-in
                
                Looking forward to working together!
                Maggie
                `;
                
                console.log('[Sales Calls] 📧 TODO: 
                            // Create sprint task for new client onboarding
// Create sprint task
const { data: sprintTask, error: sprintError } = await supabase
    .from('sprints')
    .insert([{
        task_name: '🎉 New Client Onboarding: ${updatedCall.prospect_name}',
        task_status: 'todo',
        priority: 'high',
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        assigned_to: 'Maggie',
        notes: `Client: ${updatedCall.prospect_name}...`
    }])
    .select()
    .single();

if (!sprintError) {
    console.log('[Sales Calls] ✅ Sprint task created:', sprintTask.id);
}

// THEN send email (separate block)
try {
    const instantlyResponse = await fetch('https://api.instantly.ai/api/v1/email/send', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.INSTANTLY_API_KEY}`
        },
        body: JSON.stringify({
            to: updatedCall.email,
            subject: 'Welcome to the Partnership! 🎉',
            body: emailBody,
            from_email: 'maggie@maggieforbesstrategies.com'
        })
    });
    
    if (instantlyResponse.ok) {
        console.log('[Sales Calls] ✅ Welcome email sent');
    }
} catch (emailError) {
    console.error('[Sales Calls] ❌ Email error:', emailError);
}
        priority: 'high',
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
        assigned_to: 'Maggie',
        notes: `Client: ${updatedCall.prospect_name} (${updatedCall.company})\nDeal Value: $${updatedCall.deal_value}\nWeekly check-in link sent: https://calendly.com/maggie-maggieforbesstrategies/weekly-check-in`
    }])
            
    .select()
    .single();

if (!sprintError) {
    console.log('[Sales Calls] ✅ Sprint task created:', sprintTask.id);
}
            }
            return res.status(200).json({
                success: true,
                data: updatedCall
            });
        }

        // DELETE - Delete sales call
        if (req.method === 'DELETE') {
            const { id } = req.body;

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: 'Sales call ID is required'
                });
            }

            const { error } = await supabase
                .from('sales_calls')
                .delete()
                .eq('id', id);

            if (error) throw error;

            return res.status(200).json({
                success: true,
                message: 'Sales call deleted successfully'
            });
        }

        return res.status(405).json({
            success: false,
            error: 'Method not allowed'
        });

    } catch (error) {
        console.error('[Sales Calls] Error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
};
