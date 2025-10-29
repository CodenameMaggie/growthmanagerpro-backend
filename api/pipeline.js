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
        // GET - Fetch all contacts organized by pipeline stage
        if (req.method === 'GET') {
            // Fetch all contacts with their current stage
            const { data: contacts, error } = await supabase
                .from('contacts')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Define pipeline stages in order
            const stages = [
                { name: 'New Lead', key: 'lead', icon: '🆕' },
                { name: 'Podcast Interview', key: 'podcast', icon: '🎙️' },
                { name: 'Discovery Call', key: 'discovery', icon: '🔍' },
                { name: 'Sales Call', key: 'sales', icon: '💼' },
                { name: 'Proposal', key: 'proposal', icon: '📄' },
                { name: 'Negotiation', key: 'negotiation', icon: '🤝' },
                { name: 'Closed Won', key: 'closed', icon: '✅' },
                { name: 'Lost', key: 'lost', icon: '❌' }
            ];

            // Organize contacts by stage
            const pipeline = stages.map(stage => {
                // Filter contacts in this stage
                const stageContacts = (contacts || []).filter(contact => {
                    const contactStage = contact.stage || contact.status || 'lead';
                    return contactStage.toLowerCase() === stage.key;
                });

                return {
                    name: stage.name,
                    key: stage.key,
                    icon: stage.icon,
                    count: stageContacts.length,
                    prospects: stageContacts.map(contact => ({
                        id: contact.id,
                        name: contact.name,
                        company: contact.company || 'No company',
                        email: contact.email,
                        phone: contact.phone,
                        stage: contact.stage || contact.status,
                        notes: contact.notes,
                        lastActivity: contact.last_activity || contact.updated_at,
                        createdAt: contact.created_at
                    }))
                };
            });

            // Calculate overall stats
            const totalContacts = contacts?.length || 0;
            const activeContacts = contacts?.filter(c => 
                !['lost', 'closed'].includes((c.stage || c.status || '').toLowerCase())
            ).length || 0;
            
            const closedWon = contacts?.filter(c => 
                (c.stage || c.status || '').toLowerCase() === 'closed'
            ).length || 0;

            const conversionRate = totalContacts > 0 
                ? ((closedWon / totalContacts) * 100).toFixed(1) 
                : 0;

            return res.status(200).json({
                success: true,
                data: {
                    stages: pipeline,
                    stats: {
                        totalContacts,
                        activeContacts,
                        closedWon,
                        conversionRate: parseFloat(conversionRate),
                        stageBreakdown: pipeline.map(s => ({
                            stage: s.name,
                            count: s.count
                        }))
                    }
                }
            });
        }

        // POST - Move contact to different stage
        if (req.method === 'POST') {
            const { contactId, stage, notes } = req.body;

            if (!contactId || !stage) {
                return res.status(400).json({
                    success: false,
                    error: 'Contact ID and stage are required'
                });
            }

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
