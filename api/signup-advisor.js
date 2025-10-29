// API: /api/signup-advisor.js
// Updated to handle client invitations

const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const {
            fullName,
            email,
            company,
            phone,
            specialization,
            password,
            hasClients,
            clientEmails
        } = req.body;

        console.log('[Advisor Signup] Processing:', { email, company, hasClients, clientCount: clientEmails?.length || 0 });

        // Validate required fields
        if (!fullName || !email || !company || !password) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
        }

        // Check if email already exists
        const { data: existingUser, error: checkError } = await supabase
            .from('users')
            .select('id')
            .eq('email', email)
            .single();

        if (existingUser) {
            return res.status(400).json({
                success: false,
                error: 'Email already registered'
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create advisor user account
        const { data: newUser, error: insertError } = await supabase
            .from('users')
            .insert({
                name: fullName,
                email: email,
                company: company,
                phone: phone || null,
                specialization: specialization || null,
                password_hash: hashedPassword,
                role: 'advisor',
                status: 'pending', // Requires admin approval
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (insertError) {
            console.error('[Advisor Signup] Insert error:', insertError);
            return res.status(500).json({
                success: false,
                error: 'Failed to create account'
            });
        }

        console.log('[Advisor Signup] User created:', newUser.id);

        // Handle client invitations if provided
        let clientsInvited = 0;
        if (hasClients && clientEmails && clientEmails.length > 0) {
            console.log('[Advisor Signup] Processing client invitations...');
            
            for (const clientEmail of clientEmails) {
                try {
                    const connectionResponse = await fetch(`${process.env.API_BASE_URL || 'https://growthmanagerpro-backend.vercel.app'}/api/connection-request`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            inviterEmail: email,
                            inviterType: 'advisor',
                            inviteeEmail: clientEmail,
                            inviteeType: 'client',
                            permissionLevel: 'full_management', // Advisor-invited clients get full management
                            inviterName: fullName
                        })
                    });

                    const connectionData = await connectionResponse.json();
                    
                    if (connectionData.success) {
                        clientsInvited++;
                        console.log('[Advisor Signup] Client invitation sent to:', clientEmail);
                    }
                } catch (connectionError) {
                    console.error('[Advisor Signup] Error inviting client:', clientEmail, connectionError);
                    // Continue with other invitations even if one fails
                }
            }
        }

        // Send approval notification email to admin (Maggie)
        // TODO: Integrate with email service
        console.log('[Advisor Signup] Sending approval notification to admin');

        return res.json({
            success: true,
            userId: newUser.id,
            email: newUser.email,
            clientsInvited: clientsInvited,
            message: 'Application submitted successfully. You will receive an email once approved.'
        });

    } catch (error) {
        console.error('[Advisor Signup] Server error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};
