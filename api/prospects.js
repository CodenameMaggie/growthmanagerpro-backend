const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

// ✅ File name: prospects.js (matches frontend API call)
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // ✅ Return EXACTLY what contacts.html expects
      return res.status(200).json({
        success: true,
        data: {
          // Frontend looks for: data.data?.prospects || data.prospects
          prospects: data.map(contact => ({
            id: contact.id,
            name: contact.name,
            email: contact.email,
            company: contact.company,
            phone: contact.phone,
            status: contact.status,
            source: contact.source,
            notes: contact.notes,
            // ✅ Match HTML line 981: last_contact_date or created_at
            last_contact_date: contact.last_contact_date,
            created_at: contact.created_at,
            // ✅ Match HTML line 979: instantly_campaign (optional)
            instantly_campaign: contact.instantly_campaign || null,
            // ✅ Match HTML line 938: zoomScheduled
            zoomScheduled: contact.zoom_scheduled || false
          }))
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error:', error);
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
          last_contact_date: new Date().toISOString(),
          instantly_campaign: null,
          zoom_scheduled: false
        }])
        .select();

      if (error) throw error;

      // ✅ Return in same format as GET
      return res.status(201).json({
        success: true,
        data: {
          id: data[0].id,
          name: data[0].name,
          email: data[0].email,
          company: data[0].company,
          phone: data[0].phone,
          status: data[0].status,
          source: data[0].source,
          notes: data[0].notes,
          last_contact_date: data[0].last_contact_date,
          created_at: data[0].created_at,
          instantly_campaign: data[0].instantly_campaign,
          zoomScheduled: data[0].zoom_scheduled
        },
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

      // ✅ Return in same format as GET
      return res.status(200).json({
        success: true,
        data: {
          id: data[0].id,
          name: data[0].name,
          email: data[0].email,
          company: data[0].company,
          phone: data[0].phone,
          status: data[0].status,
          source: data[0].source,
          notes: data[0].notes,
          last_contact_date: data[0].last_contact_date,
          created_at: data[0].created_at,
          instantly_campaign: data[0].instantly_campaign,
          zoomScheduled: data[0].zoom_scheduled
        },
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
