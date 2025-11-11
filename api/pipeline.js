const { createClient } = require('@supabase/supabase-js');
const {
  getStoredSender,
  getAssignedSender,
  storeSenderAssignment,
  getNextAvailablePool,
  SENDER_POOLS
} = require('./instantly-manager');

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
        // GET - Fetch all contacts organized by 5-stage pipeline
        if (req.method === 'GET') {
            // Extract tenant_id from request
            const tenantId = req.query.tenant_id || req.headers['x-tenant-id'];

            if (!tenantId) {
                console.error('[Pipeline] Missing tenant_id in request');
                return res.status(400).json({
                    success: false,
                    error: 'Tenant ID is required'
                });
            }

            console.log('[Pipeline] Loading pipeline data for tenant:', tenantId);

            // Define the 7 pipeline stages (added Pre-Qual Calls and Proposals)
const stageDefinitions = [
    {
        name: 'Pre-Qual Calls',
        key: 'prequal',
        icon: '📞',
        source: 'pre_qualification_calls',
        filter: { call_status: ['completed', 'recorded'] }
    },
    {
        name: 'Podcast Interview',
        key: 'podcast',
        icon: '🎙️',
        source: 'podcast_interviews',
        filter: {}  // Show all podcast interviews
    },
    {
        name: 'Discovery Call',
        key: 'discovery',
        icon: '🔍',
        source: 'discovery_calls',
        filter: {}  // Show all discovery calls
    },
    {
        name: 'Strategy Call',
        key: 'strategy',
        icon: '💼',
        source: 'strategy_calls',
        filter: {}  // Show all strategy calls
    },
    {
        name: 'Proposals',
        key: 'proposal',
        icon: '📄',
        source: 'proposals',
        filter: { status: ['draft', 'ready', 'sent', 'viewed', 'negotiating'] }  // Show active proposals
    },
    {
        name: 'Active Deals',
        key: 'deals',
        icon: '🤝',
        source: 'deals',
        filter: { status: ['active', 'pending', 'open'] }
    }
];

            // Fetch data for each stage
            const stages = await Promise.all(stageDefinitions.map(async (stageDef) => {
                try {
                    // ✅ START WITH TENANT FILTERING
                    let query = supabase
                        .from(stageDef.source)
                        .select('*')
                        .eq('tenant_id', tenantId);  // ✅ ADD TENANT FILTER FIRST

                    // Apply additional filters
                    Object.entries(stageDef.filter).forEach(([field, value]) => {
                        if (Array.isArray(value)) {
                            query = query.in(field, value);
                        } else {
                            query = query.eq(field, value);
                        }
                    });

                    const { data, error } = await query;

                    if (error) {
                        console.error(`[Pipeline] Error fetching ${stageDef.key}:`, error);
                        return {
                            ...stageDef,
                            count: 0,
                            prospects: []
                        };
                    }

                   // Transform data to standard format
                    const prospects = (data || []).map(item => ({
                        id: item.id,
                        name: item.name || item.guest_name || item.client_name || item.contact_name || item.prospect_name || 'Unnamed',
                        email: item.email || item.guest_email || item.client_email || '',
                        company: item.company || item.guest_company || item.client_company || '',
                        phone: item.phone || '',
                        score: item.ai_score || item.podcast_score || item.qualification_score || 0,
                        podcastScore: item.ai_score || item.podcast_score || 0,
                        createdAt: item.created_at || item.interview_date || item.call_date || item.scheduled_date,
                        updatedAt: item.updated_at || item.created_at,
                        stage: stageDef.key,
                        notes: item.notes || item.internal_notes || '',
                        assignedSender: item.assigned_sender_email || null,
                        callStatus: item.call_status || item.status || null,
                        proposalNumber: item.proposal_number || null,  // ← Added for proposals
                        proposalValue: item.total_contract_value || null  // ← Added for proposals
                    }));

                    return {
                        name: stageDef.name,
                        key: stageDef.key,
                        icon: stageDef.icon,
                        count: prospects.length,
                        prospects: prospects
                    };

                } catch (error) {
                    console.error(`[Pipeline] Error processing ${stageDef.key}:`, error);
                    return {
                        ...stageDef,
                        count: 0,
                        prospects: []
                    };
                }
            }));

            // Calculate statistics
            const totalContacts = stages.reduce((sum, stage) => sum + stage.count, 0);
            const activeContacts = stages
                .filter(s => s.key !== 'deals')
                .reduce((sum, stage) => sum + stage.count, 0);
            
            const closedWon = stages.find(s => s.key === 'deals')?.count || 0;
            const fromPodcast = stages.find(s => s.key === 'podcast')?.count || 0;
            const conversionRate = totalContacts > 0 ? (closedWon / totalContacts * 100) : 0;

            return res.status(200).json({
                success: true,
                data: {
                    stages: stages,
                    stats: {
                        totalContacts,
                        activeContacts,
                        closedWon,
                        fromPodcast,
                        conversionRate: parseFloat(conversionRate.toFixed(2))
                    }
                },
                timestamp: new Date().toISOString()
            });
        }

        // POST - Move contact to different stage (SENDER-AWARE)
        if (req.method === 'POST') {
            const { contactId, stage, notes, email } = req.body;
            const tenantId = req.query.tenant_id || req.headers['x-tenant-id'];

            if (!tenantId) {
                return res.status(400).json({
                    success: false,
                    error: 'Tenant ID is required'
                });
            }

            if (!contactId || !stage) {
                return res.status(400).json({
                    success: false,
                    error: 'Contact ID and stage are required'
                });
            }

            console.log(`[Pipeline] Moving contact ${contactId} to stage: ${stage} (tenant: ${tenantId})`);

            // ============================================
            // SENDER TRACKING LOGIC
            // ============================================
            let contactEmail = email;

            // If email not provided, fetch it (with tenant check)
            if (!contactEmail) {
                const { data: contact } = await supabase
                    .from('contacts')
                    .select('email')
                    .eq('id', contactId)
                    .eq('tenant_id', tenantId)  // ✅ ADD TENANT CHECK
                    .single();

                contactEmail = contact?.email;
            }

            if (contactEmail) {
                // Check if sender is already tracked
                let senderEmail = await getStoredSender(contactEmail);
                
                if (!senderEmail) {
                    console.log('[Pipeline] No sender stored, checking Instantly...');
                    senderEmail = await getAssignedSender(contactEmail);
                    
                    if (senderEmail) {
                        console.log('[Pipeline] Found sender from Instantly:', senderEmail);
                        await storeSenderAssignment(contactEmail, senderEmail);
                    } else if (stage === 'podcast' || stage === 'discovery') {
                        // Assign sender for early stages
                        console.log('[Pipeline] Assigning new sender for stage:', stage);
                        const pool = await getNextAvailablePool();
                        const poolSenders = SENDER_POOLS[pool].senders;
                        senderEmail = poolSenders[0];
                        
                        console.log('[Pipeline] Assigned Pool', pool, 'sender:', senderEmail);
                        await storeSenderAssignment(contactEmail, senderEmail);
                    }
                }
                
                if (senderEmail) {
                    console.log('[Pipeline] Contact tracked with sender:', senderEmail);
                }
            }

            // ============================================
            // UPDATE CONTACT STAGE
            // ============================================
            const updateData = {
                stage: stage,
                updated_at: new Date().toISOString()
            };

            if (notes) {
                updateData.notes = notes;
            }

            const { data: updatedContact, error } = await supabase
                .from('contacts')
                .update(updateData)
                .eq('id', contactId)
                .eq('tenant_id', tenantId)  // ✅ ADD TENANT CHECK
                .select()
                .single();

            if (error) throw error;

            console.log('[Pipeline] ✅ Contact moved to stage:', updatedContact.name, '→', stage);

            return res.status(200).json({
                success: true,
                data: updatedContact
            });
        }

        // PUT - Update contact details
        if (req.method === 'PUT') {
            const { id, ...updateData } = req.body;
            const tenantId = req.query.tenant_id || req.headers['x-tenant-id'];

            if (!tenantId) {
                return res.status(400).json({
                    success: false,
                    error: 'Tenant ID is required'
                });
            }

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: 'Contact ID is required'
                });
            }

            updateData.updated_at = new Date().toISOString();

            const { data: updatedContact, error } = await supabase
                .from('contacts')
                .update(updateData)
                .eq('id', id)
                .eq('tenant_id', tenantId)  // ✅ ADD TENANT CHECK
                .select()
                .single();

            if (error) throw error;

            return res.status(200).json({
                success: true,
                data: updatedContact
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
