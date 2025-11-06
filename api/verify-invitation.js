// API: /api/verify-invitation.js
// Verifies if a pending invitation exists for the given email address

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
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
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'Email address is required'
            });
        }

        console.log('[Verify Invitation] Checking email:', email);

        // Look up pending invitation by email
        const { data: invitation, error: invitationError } = await supabase
            .from('invitations')
            .select(`
                *,
                tenants (
                    id,
                    business_name,
                    subdomain
                )
            `)
            .eq('email', email.toLowerCase().trim())
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (invitationError || !invitation) {
            console.log('[Verify Invitation] No invitation found:', email);
            return res.status(404).json({
                success: false,
                error: 'No pending invitation found for this email address. Please contact your administrator.'
            });
        }

        // Check if invitation is expired
        const expiresAt = new Date(invitation.expires_at);
        const now = new Date();

        if (expiresAt < now) {
            console.log('[Verify Invitation] Invitation expired:', email);
            return res.status(400).json({
                success: false,
                error: 'This invitation has expired. Please request a new invitation from your administrator.'
            });
        }

        // Return the token so user can proceed to signup-invited.html
        console.log('[Verify Invitation] Success for:', email);
        
        return res.json({
            success: true,
            token: invitation.token,
            message: 'Invitation verified successfully'
        });

    } catch (error) {
        console.error('[Verify Invitation] Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to verify invitation. Please try again.'
        });
    }
};
