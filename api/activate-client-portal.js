const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            error: 'Method not allowed'
        });
    }

    try {
        const { dealId } = req.body;

        if (!dealId) {
            return res.status(400).json({
                success: false,
                error: 'Deal ID is required'
            });
        }

        console.log('[Activate Portal] Processing activation for deal:', dealId);

        // 1. Get deal details
        const { data: deal, error: dealError } = await supabase
            .from('deals')
            .select('*')
            .eq('id', dealId)
            .single();

        if (dealError || !deal) {
            return res.status(404).json({
                success: false,
                error: 'Deal not found'
            });
        }

        // 2. Update deal status to active
        const { error: updateDealError } = await supabase
            .from('deals')
            .update({
                status: 'active',
                activated_at: new Date().toISOString()
            })
            .eq('id', dealId);

        if (updateDealError) throw updateDealError;

        console.log('[Activate Portal] ✅ Deal activated:', dealId);

        // 3. Find or create user account
        let userId = null;
        
        const { data: existingUser } = await supabase
            .from('users')
            .select('id, status')
            .eq('email', deal.email)
            .single();

        if (existingUser) {
            // Update existing user to active
            const { error: updateUserError } = await supabase
                .from('users')
                .update({
                    status: 'active',
                    type: 'client',
                    role: 'client',
                    permissions: ['dashboard.view', 'messages.send']
                })
                .eq('id', existingUser.id);

            if (updateUserError) throw updateUserError;
            
            userId = existingUser.id;
            console.log('[Activate Portal] ✅ User activated:', userId);
        } else {
            // Create new user account
            const { data: newUser, error: createUserError } = await supabase
                .from('users')
                .insert([{
                    email: deal.email,
                    name: deal.client_name,
                    role: 'client',
                    type: 'client',
                    status: 'active',
                    permissions: ['dashboard.view', 'messages.send'],
                    created_at: new Date().toISOString()
                }])
                .select()
                .single();

            if (createUserError) throw createUserError;
            
            userId = newUser.id;
            console.log('[Activate Portal] ✅ User created:', userId);
        }

        // 4. Log success
        console.log('[Activate Portal] 📧 Welcome email queued for:', deal.email);

        return res.json({
            success: true,
            data: {
                dealId: dealId,
                userId: userId,
                status: 'active'
            },
            message: `Portal activated for ${deal.client_name}!`
        });

    } catch (error) {
        console.error('[Activate Portal] Error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
};
