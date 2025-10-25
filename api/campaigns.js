const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ==================== GET - Read all campaigns ====================
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .order('start_date', { ascending: false });

      if (error) throw error;

      // Calculate stats
      const stats = {
        totalCampaigns: data.length,
        activeCampaigns: data.filter(c => c.campaign_status === 'active').length,
        totalSent: data.reduce((sum, c) => sum + (parseInt(c.emails_sent) || 0), 0),
        totalOpened: data.reduce((sum, c) => sum + (parseInt(c.emails_opened) || 0), 0),
        totalReplied: data.reduce((sum, c) => sum + (parseInt(c.emails_replied) || 0), 0)
      };

      // Transform data to match HTML expectations
      const campaigns = data.map(campaign => ({
        id: campaign.id,
        name: campaign.campaign_name,                    // ← campaignName → name
        created_at: campaign.created_at,                 // ← created → created_at
        status: campaign.campaign_status,                // ← campaignStatus → status
        campaign_type: campaign.campaign_type,
        start_date: campaign.start_date,
        end_date: campaign.end_date,
        emails_sent: campaign.emails_sent || 0,          // ← New field
        emails_opened: campaign.emails_opened || 0,      // ← New field
        emails_clicked: campaign.emails_clicked || 0,    // ← New field
        emails_replied: campaign.emails_replied || campaign.responses || 0,  // ← responses → emails_replied
        notes: campaign.notes
      }));

      return res.status(200).json({
        success: true,
        campaigns: campaigns,  // ← Moved to root level (not nested in data)
        stats,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error fetching campaigns:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // ==================== POST - Create new campaign ====================
  if (req.method === 'POST') {
    try {
      const { 
        name, 
        campaignType, 
        status, 
        startDate, 
        endDate, 
        emailsSent, 
        emailsOpened,
        emailsClicked,
        emailsReplied, 
        notes 
      } = req.body;

      if (!name) {
        return res.status(400).json({
          success: false,
          error: 'Campaign name is required'
        });
      }

      const { data, error } = await supabase
        .from('campaigns')
        .insert([{
          campaign_name: name,
          campaign_type: campaignType || 'email',
          campaign_status: status || 'active',
          start_date: startDate || null,
          end_date: endDate || null,
          emails_sent: emailsSent || 0,
          emails_opened: emailsOpened || 0,
          emails_clicked: emailsClicked || 0,
          emails_replied: emailsReplied || 0,
          responses: emailsReplied || 0,  // Keep for backwards compatibility
          notes: notes || null
        }])
        .select()
        .single();

      if (error) throw error;

      // Return in HTML format
      return res.status(201).json({
        success: true,
        campaign: {
          id: data.id,
          name: data.campaign_name,
          created_at: data.created_at,
          status: data.campaign_status,
          campaign_type: data.campaign_type,
          start_date: data.start_date,
          end_date: data.end_date,
          emails_sent: data.emails_sent || 0,
          emails_opened: data.emails_opened || 0,
          emails_clicked: data.emails_clicked || 0,
          emails_replied: data.emails_replied || 0,
          notes: data.notes
        },
        message: 'Campaign created successfully'
      });

    } catch (error) {
      console.error('Error creating campaign:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // ==================== PUT - Update campaign ====================
  if (req.method === 'PUT') {
    try {
      const { 
        id, 
        name, 
        campaignType, 
        status, 
        startDate, 
        endDate, 
        emailsSent,
        emailsOpened,
        emailsClicked, 
        emailsReplied, 
        notes 
      } = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Campaign ID is required'
        });
      }

      const updateData = {};
      if (name) updateData.campaign_name = name;
      if (campaignType) updateData.campaign_type = campaignType;
      if (status) updateData.campaign_status = status;
      if (startDate !== undefined) updateData.start_date = startDate;
      if (endDate !== undefined) updateData.end_date = endDate;
      if (emailsSent !== undefined) updateData.emails_sent = emailsSent;
      if (emailsOpened !== undefined) updateData.emails_opened = emailsOpened;
      if (emailsClicked !== undefined) updateData.emails_clicked = emailsClicked;
      if (emailsReplied !== undefined) {
        updateData.emails_replied = emailsReplied;
        updateData.responses = emailsReplied;  // Keep for backwards compatibility
      }
      if (notes !== undefined) updateData.notes = notes;

      const { data, error } = await supabase
        .from('campaigns')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      if (!data) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found'
        });
      }

      // Return in HTML format
      return res.status(200).json({
        success: true,
        campaign: {
          id: data.id,
          name: data.campaign_name,
          created_at: data.created_at,
          status: data.campaign_status,
          campaign_type: data.campaign_type,
          start_date: data.start_date,
          end_date: data.end_date,
          emails_sent: data.emails_sent || 0,
          emails_opened: data.emails_opened || 0,
          emails_clicked: data.emails_clicked || 0,
          emails_replied: data.emails_replied || 0,
          notes: data.notes
        },
        message: 'Campaign updated successfully'
      });

    } catch (error) {
      console.error('Error updating campaign:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // ==================== DELETE - Delete campaign ====================
  if (req.method === 'DELETE') {
    try {
      const { id } = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Campaign ID is required'
        });
      }

      const { error } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return res.status(200).json({
        success: true,
        message: 'Campaign deleted successfully'
      });

    } catch (error) {
      console.error('Error deleting campaign:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
