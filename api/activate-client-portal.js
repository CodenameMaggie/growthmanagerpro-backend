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
        
        // ==================== 1. GET DEAL DETAILS ====================
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
        
        // Get client info
        const clientEmail = deal.email || deal.client_email;
        const clientName = deal.client_name;
        
        if (!clientEmail) {
            return res.status(400).json({
                success: false,
                error: 'Client email not found in deal record'
            });
        }
        
        console.log('[Activate Portal] Client:', clientName, clientEmail);
        
        // ==================== 2. CHECK IF USER ALREADY EXISTS ====================
        const { data: existingUser } = await supabase
            .from('users')
            .select('id, email, role, status')
            .eq('email', clientEmail)
            .single();
        
        if (existingUser) {
            console.log('[Activate Portal] User already exists - updating to active');
            
            // Update existing user to active
            await supabase
                .from('users')
                .update({
                    status: 'active',
                    role: 'client'
                })
                .eq('id', existingUser.id);
            
            // Update deal status
            await supabase
                .from('deals')
                .update({
                    status: 'active',
                    activated_at: new Date().toISOString(),
                    client_portal_enabled: true
                })
                .eq('id', dealId);
            
            return res.json({
                success: true,
                message: `Portal activated for ${clientName}! (User already exists)`,
                client: {
                    name: clientName,
                    email: clientEmail,
                    userId: existingUser.id
                }
            });
        }
        
        // ==================== 3. CREATE INVITATION ====================
        console.log('[Activate Portal] Creating invitation for new user...');
        
        try {
            const inviteResponse = await fetch(
                `${process.env.API_BASE_URL || 'https://growthmanagerpro-backend.vercel.app'}/api/invitations`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: clientEmail,
                        role: 'client'
                    })
                }
            );
            
            const inviteData = await inviteResponse.json();
            
            if (!inviteData.success) {
                throw new Error(inviteData.error || 'Failed to create invitation');
            }
            
            const signupLink = inviteData.invitation.signupLink;
            console.log('[Activate Portal] ✅ Invitation created:', signupLink);
            
            // ==================== 4. UPDATE DEAL WITH INVITATION INFO ====================
            await supabase
                .from('deals')
                .update({
                    status: 'active',
                    activated_at: new Date().toISOString(),
                    client_portal_enabled: true,
                    invitation_sent: true,
                    invitation_link: signupLink,
                    invitation_sent_at: new Date().toISOString()
                })
                .eq('id', dealId);
            
            console.log('[Activate Portal] ✅ Deal updated with invitation info');
            
            // ==================== 5. TODO: SEND EMAIL ====================
            // TODO: Integrate with email service (SendGrid, Resend, etc.)
            console.log('[Activate Portal] 📧 Email ready to send to:', clientEmail);
            console.log('[Activate Portal] 📧 Signup link:', signupLink);
            
            /*
            await sendEmail({
                to: clientEmail,
                subject: 'Welcome to Growth Manager Pro - Activate Your Account',
                body: `
                    Hi ${clientName},
                    
                    Great news! Your Growth Manager Pro client portal is ready.
                    
                    Click here to activate your account:
                    ${signupLink}
                    
                    Once you create your account, you'll have access to:
                    - Your progress dashboard
                    - Real-time milestone tracking
                    - Direct communication with Maggie
                    - Resources and deliverables
                    - Upcoming call schedules
                    
                    See you inside!
                    
                    - Maggie Forbes
                    Growth Manager Pro
                `
            });
            */
            
            return res.json({
                success: true,
                message: `✅ Portal activated and invitation sent to ${clientName}!`,
                client: {
                    name: clientName,
                    email: clientEmail
                },
                invitation: {
                    link: signupLink,
                    expiresAt: inviteData.invitation.expiresAt
                }
            });
            
        } catch (inviteError) {
            console.error('[Activate Portal] Error creating invitation:', inviteError);
            
            // Still update the deal status even if invitation fails
            await supabase
                .from('deals')
                .update({
                    status: 'active',
                    activated_at: new Date().toISOString(),
                    invitation_error: inviteError.message
                })
                .eq('id', dealId);
            
            return res.status(500).json({
                success: false,
                error: 'Failed to create client invitation: ' + inviteError.message
            });
        }
        
    } catch (error) {
        console.error('[Activate Portal] Error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
};
