const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Tenant-ID');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        // ==================== GET - Read all strategy calls ====================
        if (req.method === 'GET') {
            // Extract tenant_id from request
            const tenantId = req.query.tenant_id || req.headers['x-tenant-id'];

            if (!tenantId) {
                return res.status(400).json({
                    success: false,
                    error: 'Tenant ID required'
                });
            }

            const { data: calls, error } = await supabase
                .from('strategy_calls')
                .select('*')
                .eq('tenant_id', tenantId)  // ← ADDED: Filter by tenant
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

        // ==================== POST - Create new strategy call ====================
        if (req.method === 'POST') {
            // Extract tenant_id from request
            const tenantId = req.query.tenant_id || req.headers['x-tenant-id'];

            if (!tenantId) {
                return res.status(400).json({
                    success: false,
                    error: 'Tenant ID required'
                });
            }

            const { 
                prospectName, 
                email, 
                company, 
                callDate, 
                dealValue, 
                callStatus, 
                recommendedTier,
                recommendedSystems,
                notes,
                contactId
            } = req.body;

            if (!prospectName || !email) {
                return res.status(400).json({
                    success: false,
                    error: 'Prospect name and email are required'
                });
            }

            const { data, error } = await supabase
                .from('strategy_calls')
                .insert([{
                    tenant_id: tenantId,  // ← ADDED: Set tenant_id
                    prospect_name: prospectName,
                    email: email,
                    company: company || null,
                    scheduled_date: callDate || null,
                    deal_value: dealValue || 0,
                    call_status: callStatus || 'scheduled',
                    recommended_tier: recommendedTier || null,
                    recommended_systems: recommendedSystems || null,
                    notes: notes || null,
                    contact_id: contactId || null
                }])
                .select()
                .single();

            if (error) throw error;

            return res.status(201).json({
                success: true,
                data: data,
                message: 'Strategy call created successfully'
            });
        }

        // ==================== PUT - Update existing strategy call ====================
        if (req.method === 'PUT') {
            // Extract tenant_id from request
            const tenantId = req.query.tenant_id || req.headers['x-tenant-id'];

            if (!tenantId) {
                return res.status(400).json({
                    success: false,
                    error: 'Tenant ID required'
                });
            }

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
                .eq('tenant_id', tenantId)  // ← ADDED: Verify tenant ownership
                .select()
                .single();

            if (updateError) throw updateError;

            if (!updatedCall) {
                return res.status(404).json({
                    success: false,
                    error: 'Strategy call not found or access denied'
                });
            }

            return res.status(200).json({
                success: true,
                data: updatedCall
            });
        }

        // ==================== DELETE - Remove strategy call ====================
        if (req.method === 'DELETE') {
            // Extract tenant_id from request
            const tenantId = req.query.tenant_id || req.headers['x-tenant-id'];

            if (!tenantId) {
                return res.status(400).json({
                    success: false,
                    error: 'Tenant ID required'
                });
            }

            const { id } = req.body;

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: 'Strategy call ID is required'
                });
            }

            const { error } = await supabase
                .from('strategy_calls')
                .delete()
                .eq('id', id)
                .eq('tenant_id', tenantId);  // ← ADDED: Verify tenant ownership

            if (error) throw error;

            return res.status(200).json({
                success: true,
                message: 'Strategy call deleted successfully'
            });
        }

        return res.status(405).json({
            success: false,
            error: 'Method not allowed'
        });

    } catch (error) {
        console.error('[Strategy Calls API] Error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
};
