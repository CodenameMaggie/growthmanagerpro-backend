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

  if (req.method === 'GET') {
    try {
      console.log('[Prospects API] Fetching contacts with pipeline stages...');

      // Try to use the pipeline function
      const { data: pipelineData, error: pipelineError } = await supabase.rpc('get_contacts_with_pipeline');

      // If function works, use it
      if (!pipelineError && pipelineData) {
        console.log(`[Prospects API] ✅ Fetched ${pipelineData.length} contacts with pipeline tracking`);
        
        return res.status(200).json({
          success: true,
          data: {
            prospects: pipelineData.map(contact => ({
              // Core fields
              id: contact.id,
              name: contact.name,
              email: contact.email,
              company: contact.company,
              phone: contact.phone,
              status: contact.status,
              source: contact.source,
              notes: contact.notes,
              last_contact_date: contact.last_contact_date,
              created_at: contact.created_at,
              updated_at: contact.updated_at,
              
              // Pipeline fields (from function)
              current_campaign: contact.current_campaign,
              pipeline_stage: contact.pipeline_stage,
              in_pipeline: contact.in_pipeline,
              
              // Engagement fields (default values for now)
              last_email_sent: null,
              last_email_opened: null,
              last_email_clicked: null,
              email_open_count: 0,
              email_click_count: 0,
              has_replied: false,
              reply_date: null,
              email_status: 'unknown',
              last_engagement_date: null,
              engagement_synced_at: null,
              assigned_sender_email: null,
              
              // Legacy fields
              instantly_campaign: null,
              zoomScheduled: false
            }))
          },
          timestamp: new Date().toISOString(),
          using_pipeline_tracking: true
        });
      }

      // Fallback to simple query
      console.log('[Prospects API] ⚠️ Pipeline function not available, using fallback...');
      
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      console.log(`[Prospects API] Fetched ${data.length} contacts (fallback mode)`);

      return res.status(200).json({
        success: true,
        data: {
          prospects: data.map(contact => ({
            id: contact.id,
            name: contact.name,
            email: contact.email,
            company: contact.company,
            phone: contact.phone,
            status: contact.status,
            source: contact.source,
            notes: contact.notes,
            last_contact_date: contact.last_contact_date,
            created_at: contact.created_at,
            updated_at: contact.updated_at,
            
            // Fallback values
            current_campaign: null,
            pipeline_stage: null,
            in_pipeline: false,
            
            last_email_sent: null,
            last_email_opened: null,
            last_email_clicked: null,
            email_open_count: 0,
            email_click_count: 0,
            has_replied: false,
            reply_date: null,
            email_status: 'unknown',
            last_engagement_date: null,
            engagement_synced_at: null,
            assigned_sender_email: null,
            
            instantly_campaign: null,
            zoomScheduled: false
          }))
        },
        timestamp: new Date().toISOString(),
        using_pipeline_tracking: false,
        note: 'Pipeline function not available - contacts shown without pipeline stages'
      });

    } catch (error) {
      console.error('[Prospects API] Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  if (req.method === 'POST') {
    try {
      const { name, email, company, phone, status, source, notes } = req.body;

      if (!name || !email) {
        return res.status(400).json({
          success: false,
          error: 'Name and email are required'
        });
      }

      const { data, error } = await supabase
        .from('contacts')
        .insert([{
          name: name,
          email: email,
          company: company || null,
          phone: phone || null,
          status: status || 'new',
          source: source || 'manual',
          notes: notes || null,
          last_contact_date: new Date().toISOString()
        }])
        .select();

      if (error) throw error;

      return res.status(201).json({
        success: true,
        data: data[0],
        message: 'Contact created successfully'
      });

    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  if (req.method === 'PUT') {
    try {
      const { id, name, email, company, phone, status, source, notes } = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Contact ID is required'
        });
      }

      const updateData = {
        last_contact_date: new Date().toISOString()
      };
      
      if (name) updateData.name = name;
      if (email) updateData.email = email;
      if (company !== undefined) updateData.company = company;
      if (phone !== undefined) updateData.phone = phone;
      if (status) updateData.status = status;
      if (source) updateData.source = source;
      if (notes !== undefined) updateData.notes = notes;

      const { data, error } = await supabase
        .from('contacts')
        .update(updateData)
        .eq('id', id)
        .select();

      if (error) throw error;

      if (!data || data.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Contact not found'
        });
      }

      return res.status(200).json({
        success: true,
        data: data[0],
        message: 'Contact updated successfully'
      });

    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { id } = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Contact ID is required'
        });
      }

      const { error } = await supabase
        .from('contacts')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return res.status(200).json({
        success: true,
        message: 'Contact deleted successfully'
      });

    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
