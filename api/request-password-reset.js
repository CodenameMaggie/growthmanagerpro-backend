const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Tenant-ID');
  
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
        error: 'Email required'
      });
    }

    // Check if user exists
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, full_name')
      .eq('email', email.toLowerCase())
      .single();

    // Always return success (security: don't reveal if email exists)
    if (userError || !user) {
      console.log('User not found, but returning success for security');
      return res.status(200).json({
        success: true,
        message: 'If account exists, reset link sent'
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 3600000); // 1 hour

    // Store token in database
    const { error: updateError } = await supabase
      .from('users')
      .update({
        reset_token: resetToken,
        reset_expires: resetExpires.toISOString()
      })
      .eq('id', user.id);

    if (updateError) throw updateError;

    // TODO: Send email with reset link
    // For now, log the link (in production, use SendGrid/Mailgun)
    const resetLink = `https://growthmanagerpro.com/reset-password.html?token=${resetToken}`;
    console.log('Password reset link:', resetLink);
    console.log('For user:', email);

    // In production, send email here:
    // await sendEmail({
    //   to: email,
    //   subject: 'Reset Your Password',
    //   html: `Click here to reset: ${resetLink}`
    // });

    return res.status(200).json({
      success: true,
      message: 'If account exists, reset link sent',
      // Remove this in production:
      dev_reset_link: resetLink
    });

  } catch (error) {
    console.error('Password reset request error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process request'
    });
  }
};
