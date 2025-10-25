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
        // GET - Fetch all pipeline deals with stats
        if (req.method === 'GET') {
            const { data: deals, error } = await supabase
                .from('pipeline')
                .select(`
                    *,
                    contacts (
                        id,
                        name,
                        email,
                        company
                    )
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Enrich deals with contact data
            const enrichedDeals = deals.map(deal => ({
                ...deal,
                company: deal.contacts?.company || 'No company',
                contactName: deal.contacts?.name || 'Unknown'
            }));

            // 🔧 TRANSFORM TO CAMELCASE - Match HTML expectations
            const transformedDeals = enrichedDeals.map(deal => ({
                id: deal.id,
                name: deal.name,
                company: deal.company,              // Already enriched ✅
                contactName: deal.contactName,      // Already enriched ✅
                contactId: deal.contact_id,
                value: deal.value,
                stage: deal.stage,
                status: deal.status,
                autoCreated: deal.auto_created,
                sourceType: deal.source_type,
                salesCallId: deal.sales_call_id,
                expectedCloseDate: deal.expected_close_date,
                notes: deal.notes,
                createdAt: deal.created_at
            }));

            // Calculate stats
            const totalValue = deals.reduce((sum, d) => sum + (parseFloat(d.value) || 0), 0);
            const activeDeals = deals.filter(d => d.stage !== 'lost').length;
            const avgDealSize = activeDeals > 0 ? totalValue / activeDeals : 0;
            
            const closedDeals = deals.filter(d => d.stage === 'closed' && d.status === 'won').length;
            const advancedDeals = deals.filter(d => 
                ['proposal', 'negotiation', 'closed'].includes(d.stage)
            ).length;
            const winRate = advancedDeals > 0 ? (closedDeals / advancedDeals * 100) : 0;

            // Count automation stats
            const autoCreatedCount = deals.filter(d => d.auto_created === true).length;
            const manualCount = deals.filter(d => !d.auto_created).length;
            const fromPodcast = deals.filter(d => d.source_type === 'sales_call').length;

            return res.status(200).json({
                success: true,
                data: {
                    deals: transformedDeals,  // ✅ Use camelCase transformed data
                    stats: {
                        totalValue,
                        activeDeals,
                        avgDealSize,
                        winRate,
                        autoCreatedCount,
                        manualCount,
                        fromPodcast
                    }
                }
            });
        }

        // POST - Create new pipeline deal (manual or automated)
        if (req.method === 'POST') {
            const dealData = req.body;

            // If not specified, assume manual entry
            if (dealData.auto_created === undefined) {
                dealData.auto_created = false;
                dealData.source_type = dealData.source_type || 'manual';
            }

            const { data: newDeal, error } = await supabase
                .from('pipeline')
                .insert([dealData])
                .select()
                .single();

            if (error) throw error;

            console.log('[Pipeline] ✅ Deal created:', newDeal.id, 
                newDeal.auto_created ? '(Auto-created)' : '(Manual)');

            return res.status(201).json({
                success: true,
                data: newDeal
            });
        }

        // PUT - Update pipeline deal
        if (req.method === 'PUT') {
            const { id, ...updateData } = req.body;

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: 'Deal ID is required'
                });
            }

            const { data: updatedDeal, error } = await supabase
                .from('pipeline')
                .update(updateData)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;

            return res.status(200).json({
                success: true,
                data: updatedDeal
            });
        }

        // DELETE - Delete pipeline deal
        if (req.method === 'DELETE') {
            const { id } = req.body;

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: 'Deal ID is required'
                });
            }

            const { error } = await supabase
                .from('pipeline')
                .delete()
                .eq('id', id);

            if (error) throw error;

            return res.status(200).json({
                success: true,
                message: 'Deal deleted successfully'
            });
        }

        return res.status(405).json({
            success: false,
            error: 'Method not allowed'
        });

    } catch (error) {
        console.error('[Pipeline] Error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
};
