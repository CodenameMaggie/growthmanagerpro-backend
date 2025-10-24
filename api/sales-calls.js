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

    try {
        // GET - Fetch all sales calls with stats
        if (req.method === 'GET') {
            const { data: calls, error } = await supabase
                .from('sales_calls')
                .select('*')
                .order('call_date', { ascending: false });

            if (error) throw error;

            // Calculate stats
            const totalDeals = calls.length;
            const scheduledCalls = calls.filter(c => c.call_status === 'scheduled').length;
            const closedDeals = calls.filter(c => c.call_status === 'won').length;
            const pipelineValue = calls
                .filter(c => c.call_status !== 'lost')
                .reduce((sum, c) => sum + (parseFloat(c.deal_value) || 0), 0);

            return res.status(200).json({
                success: true,
                data: {
                    calls,
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
                    source_type: 'sales_call',
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
