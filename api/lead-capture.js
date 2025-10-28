const { createClient } = require('@supabase/supabase-js');

// API endpoint for capturing leads from maggieforbesstrategies.com landing page
// Creates new prospects in Growth Manager Pro system

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  // Set CORS headers - allow requests from your landing page
  res.setHeader('Access-Control-Allow-Origin', '*'); // In production, use: 'https://maggieforbesstrategies.com'
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed. Use POST.' 
    });
  }

  try {
    const { name, company, email, message, source, utm_source, utm_campaign, utm_medium } = req.body;

    // Validation
    if (!name || !email || !message) {
      return res.status(400).json({ 
        success: false, 
        error: 'Name, email, and message are required' 
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid email address' 
      });
    }

    // Check if prospect already exists
    const { data: existingProspect } = await supabase
      .from('prospects')
      .select('id, name, email')
      .eq('email', email.toLowerCase())
      .single();

    if (existingProspect) {
      // Update existing prospect with new inquiry
      const { error: updateError } = await supabase
        .from('prospects')
        .update({
          notes: `${existingProspect.notes || ''}\n\n[${new Date().toISOString()}] New inquiry from landing page:\n${message}`,
          last_contacted: new Date().toISOString(),
          status: 'new-lead' // Reset to new lead if they inquired again
        })
        .eq('id', existingProspect.id);

      if (updateError) {
        console.error('Error updating existing prospect:', updateError);
        throw new Error('Failed to update prospect');
      }

      return res.status(200).json({
        success: true,
        message: 'Thank you! We\'ll be in touch within 48 hours.',
        prospectId: existingProspect.id,
        isExisting: true
      });
    }

    // Create new prospect as INTERVIEW LEAD for podcast automation
    const prospectData = {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      company: company?.trim() || null,
      notes: message.trim(),
      source: source || 'growthmanagerpro.com',
      source_details: 'Landing Page → Podcast Interview Booking',
      status: 'interview', // Mark as interview lead
      pipeline_stage: 'podcast',
      lead_type: 'interview', // Interview type for podcast automation
      lead_score: 0, // Will be scored after podcast interview
      created_at: new Date().toISOString(),
      last_contacted: new Date().toISOString(),
      // UTM tracking
      utm_source: utm_source || null,
      utm_campaign: utm_campaign || null,
      utm_medium: utm_medium || null,
      // Interview-specific flags
      interview_requested: true,
      interview_status: 'calendly-redirect'
    };

    const { data: newProspect, error: insertError } = await supabase
      .from('prospects')
      .insert([prospectData])
      .select()
      .single();

    if (insertError) {
      console.error('Error creating prospect:', insertError);
      throw new Error('Failed to create prospect');
    }

    console.log('[Lead Capture] ✅ Interview lead created for podcast automation:', {
      id: newProspect.id,
      name: newProspect.name,
      email: newProspect.email,
      status: 'interview',
      type: 'interview',
      calendlyRedirect: true
    });

    // TODO: Send confirmation email to lead (optional)
    // TODO: Send notification to Maggie (Slack, email, SMS)

    return res.status(200).json({
      success: true,
      message: 'Success! Redirecting to book your podcast interview...',
      prospectId: newProspect.id,
      isExisting: false,
      redirectUrl: 'https://calendly.com/maggie-maggieforbesstrategies/podcast-call-1'
    });

  } catch (error) {
    console.error('[Lead Capture] ❌ Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Something went wrong. Please try again or email maggie@maggieforbes.com directly.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
