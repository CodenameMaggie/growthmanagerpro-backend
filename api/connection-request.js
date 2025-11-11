// API: /api/connection-request.js
// Handles client-advisor connection requests and auto-matching

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
        const {
            inviterEmail,
            inviterType, // 'client' or 'advisor'
            inviteeEmail,
            inviteeType, // 'client' or 'advisor'
            permissionLevel, // 'view_only', 'collaborative', 'trusted_partner', 'full_management'
            inviterName,
            inviteeName
        } = req.body;

        console.log('[Connection Request] Processing:', {
            inviterEmail,
            inviterType,
            inviteeEmail,
            inviteeType,
            permissionLevel
        });

        // 1. Check if there's already a pending invitation that matches (auto-connect scenario)
        const { data: existingInvites, error: inviteCheckError } = await supabase
            .from('connection_invitations')
            .select('*')
            .eq('status', 'pending')
            .or(`and(inviter_email.eq.${inviteeEmail},invitee_email.eq.${inviterEmail}),and(inviter_email.eq.${inviterEmail},invitee_email.eq.${inviteeEmail})`);

        if (inviteCheckError) {
            console.error('[Connection Request] Error checking existing invites:', inviteCheckError);
        }

        // If there's a matching pending invite, auto-connect!
        if (existingInvites && existingInvites.length > 0) {
            console.log('[Connection Request] MATCH FOUND! Auto-connecting...');
            
            const matchedInvite = existingInvites[0];
            
            // Update the invitation to accepted
            const { error: updateError } = await supabase
                .from('connection_invitations')
                .update({
                    status: 'auto_connected',
                    responded_at: new Date().toISOString()
                })
                .eq('id', matchedInvite.id);

            if (updateError) {
                console.error('[Connection Request] Error updating invite:', updateError);
            }

            // Create the advisor-client relationship
            await createRelationship(
                inviterEmail,
                inviteeEmail,
                inviterType,
                inviteeType,
                matchedInvite.permission_level || permissionLevel
            );

            // Send success emails to both parties
            await sendAutoConnectEmail(inviterEmail, inviteeEmail, inviterName, inviteeName);

            return res.json({
                success: true,
                status: 'auto_connected',
                message: '✓ Auto-connected! You and your advisor are now linked.',
                connectionId: matchedInvite.id
            });
        }

        // 2. Check if invitee exists on the platform
        const inviteeExists = await checkUserExists(inviteeEmail);

        if (inviteeExists) {
            console.log('[Connection Request] Invitee exists. Creating connection request...');
            
            // Create a connection request (they'll need to accept)
            const { data: invitation, error: insertError } = await supabase
                .from('connection_invitations')
                .insert({
                    inviter_email: inviterEmail,
                    inviter_type: inviterType,
                    invitee_email: inviteeEmail,
                    invitee_type: inviteeType,
                    permission_level: permissionLevel,
                    status: 'pending',
                    invited_at: new Date().toISOString()
                })
                .select()
                .single();

            if (insertError) {
                console.error('[Connection Request] Error creating invitation:', insertError);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to create connection request'
                });
            }

            // Send connection request email
            await sendConnectionRequestEmail(inviterEmail, inviteeEmail, inviterName, inviterType);

            return res.json({
                success: true,
                status: 'request_sent',
                message: `✓ Connection request sent to ${inviteeEmail}`,
                invitationId: invitation.id
            });
        }

        // 3. Invitee doesn't exist - send platform invitation
        console.log('[Connection Request] Invitee not found. Sending platform invitation...');
        
        const { data: invitation, error: insertError } = await supabase
            .from('connection_invitations')
            .insert({
                inviter_email: inviterEmail,
                inviter_type: inviterType,
                invitee_email: inviteeEmail,
                invitee_type: inviteeType,
                permission_level: permissionLevel,
                status: 'pending',
                invited_at: new Date().toISOString()
            })
            .select()
            .single();

        if (insertError) {
            console.error('[Connection Request] Error creating invitation:', insertError);
            return res.status(500).json({
                success: false,
                error: 'Failed to create invitation'
            });
        }

        // Send platform invitation email
        await sendPlatformInvitationEmail(inviterEmail, inviteeEmail, inviterName, inviterType, inviteeType);

        return res.json({
            success: true,
            status: 'invitation_sent',
            message: `✓ Platform invitation sent to ${inviteeEmail}`,
            invitationId: invitation.id
        });

    } catch (error) {
        console.error('[Connection Request] Server error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

// Helper Functions

async function checkUserExists(email) {
    try {
        // Check in users table
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, email')
            .eq('email', email)
            .single();

        if (user) return true;

        // Check in contacts table (for clients)
        const { data: contact, error: contactError } = await supabase
            .from('contacts')
            .select('id, email')
            .eq('email', email)
            .single();

        if (contact) return true;

        return false;
    } catch (error) {
        console.error('[checkUserExists] Error:', error);
        return false;
    }
}

async function createRelationship(inviterEmail, inviteeEmail, inviterType, inviteeType, permissionLevel) {
    try {
        // Get user IDs
        const inviterId = await getUserId(inviterEmail);
        const inviteeId = await getUserId(inviteeEmail);

        if (!inviterId || !inviteeId) {
            console.error('[createRelationship] Could not find user IDs');
            return;
        }

        // Determine advisor and client
        const advisorId = inviterType === 'advisor' ? inviterId : inviteeId;
        const clientId = inviterType === 'client' ? inviterId : inviteeId;

        // Create relationship
        const { data, error } = await supabase
            .from('advisor_client_relationships')
            .insert({
                advisor_id: advisorId,
                client_id: clientId,
                relationship_type: inviterType === 'advisor' ? 'advisor_invited' : 'client_invited',
                permission_level: permissionLevel,
                status: 'active',
                invited_by: inviterId,
                invited_at: new Date().toISOString(),
                accepted_at: new Date().toISOString()
            });

        if (error) {
            console.error('[createRelationship] Error:', error);
        } else {
            console.log('[createRelationship] Relationship created successfully');
        }
    } catch (error) {
        console.error('[createRelationship] Error:', error);
    }
}

async function getUserId(email) {
    try {
        // Check users table first
        const { data: user } = await supabase
            .from('users')
            .select('id')
            .eq('email', email)
            .single();

        if (user) return user.id;

        // Check contacts table
        const { data: contact } = await supabase
            .from('contacts')
            .select('id')
            .eq('email', email)
            .single();

        if (contact) return contact.id;

        return null;
    } catch (error) {
        console.error('[getUserId] Error:', error);
        return null;
    }
}

// Email Functions (placeholders - integrate with your email service)

async function sendAutoConnectEmail(email1, email2, name1, name2) {
    console.log(`[Email] Auto-connect notification to ${email1} and ${email2}`);
    // TODO: Integrate with email service (SendGrid, Resend, etc.)
    // Email content:
    // "Great news! You and [name] are now connected on Growth Manager Pro!"
}

async function sendConnectionRequestEmail(fromEmail, toEmail, fromName, fromType) {
    console.log(`[Email] Connection request from ${fromEmail} to ${toEmail}`);
    // TODO: Integrate with email service
    // Email content:
    // "[fromName] wants to connect with you as your [advisor/client] on Growth Manager Pro"
    // [Accept] [Decline] buttons
}

async function sendPlatformInvitationEmail(fromEmail, toEmail, fromName, fromType, toType) {
    console.log(`[Email] Platform invitation from ${fromEmail} to ${toEmail}`);
    // TODO: Integrate with email service
    // Email content:
    // "[fromName] has invited you to join Growth Manager Pro as their [advisor/client]"
    // [Sign Up] button with pre-filled connection data
}
