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
        if (req.method === 'GET') {
            const { data: calls, error } = await supabase
                .from('strategy_calls')
                .select('*')
                .order('scheduled_date', { ascending: false });

            if (error) throw error;

            const totalDeals = calls.length;
            const scheduledCalls = calls.filter(c => c.call_status === 'scheduled').length;
            const closedDeals = calls.filter(c => c.call_status === 'won').length;
            const pipelineValue = calls
                .filter(c => c.call_status !== 'lost')
                .reduce((sum, c) => sum + (parseFloat(c.deal_value) || 0), 0);

            const transformedCalls = calls.map(call => ({
                id: call.id,
                prospectName: call.prospect_name,
                email: call.email,
                company: call.company,
                callDate: call.scheduled_date,
                dealValue: call.deal_value,
                callStatus: call.call_status,
                recommendedTier: call.recommended_tier,
                recommendedSystems: call.recommended_systems,
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

        if (req.method === 'PUT') {
            const { id, ...updateData } = req.body;

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: 'Strategy call ID is required'
                });
            }

            const { data: updatedCall, error: updateError } = await supabase
                .from('strategy_calls')
                .update(updateData)
                .eq('id', id)
                .select()
                .single();

            if (updateError) throw updateError;

            return res.status(200).json({
                success: true,
                data: updatedCall
            });
        }

        return res.status(405).json({
            success: false,
            error: 'Method not allowed'
        });

    } catch (error) {
        console.error('[Strategy Calls] Error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
};
