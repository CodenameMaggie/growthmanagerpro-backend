// API: /api/signup-client.js
// Updated to handle advisor connections

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
            password,
            hasAdvisor,
            advisorEmail,
            permissionLevel
        } = req.body;

        console.log('[Client Signup] Processing:', { email, company, hasAdvisor });

        // Validate required fields
        if (!fullName || !email || !company || !password) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
        }

        // Check if email already exists
        const { data: existingContact, error: checkError } = await supabase
            .from('contacts')
            .select('id')
            .eq('email', email)
            .single();

        if (existingContact) {
            return res.status(400).json({
                success: false,
                error: 'Email already registered'
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create contact record
        const { data: newContact, error: insertError } = await supabase
            .from('contacts')
            .insert({
                name: fullName,
                email: email,
                company: company,
                phone: phone || null,
                password_hash: hashedPassword,
                status: 'pending', // Will be activated when you approve them
                source: 'client_signup',
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (insertError) {
            console.error('[Client Signup] Insert error:', insertError);
            return res.status(500).json({
                success: false,
                error: 'Failed to create account'
            });
        }

        console.log('[Client Signup] Contact created:', newContact.id);

        // Handle advisor connection if provided
        let connectionMessage = '';
        if (hasAdvisor && advisorEmail) {
            try {
                console.log('[Client Signup] Processing advisor connection...');
                
                const connectionResponse = await fetch(`${process.env.API_BASE_URL || 'https://growthmanagerpro-backend.vercel.app'}/api/connection-request`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        inviterEmail: email,
                        inviterType: 'client',
                        inviteeEmail: advisorEmail,
                        inviteeType: 'advisor',
                        permissionLevel: permissionLevel || 'collaborative',
                        inviterName: fullName
                    })
                });

                const connectionData = await connectionResponse.json();
                
                if (connectionData.success) {
                    if (connectionData.status === 'auto_connected') {
                        connectionMessage = 'Connected with your advisor!';
                    } else if (connectionData.status === 'request_sent') {
                        connectionMessage = 'Connection request sent to your advisor!';
                    } else if (connectionData.status === 'invitation_sent') {
                        connectionMessage = 'Invitation sent to your advisor!';
                    }
                    console.log('[Client Signup] Connection status:', connectionData.status);
                }
            } catch (connectionError) {
                console.error('[Client Signup] Connection error:', connectionError);
                // Don't fail the signup if connection fails
                connectionMessage = 'Note: Could not connect advisor at this time.';
            }
        }

        return res.json({
            success: true,
            contactId: newContact.id,
            email: newContact.email,
            connectionMessage: connectionMessage || undefined
        });

    } catch (error) {
        console.error('[Client Signup] Server error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};
