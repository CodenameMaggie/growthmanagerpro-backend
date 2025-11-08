const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Tenant-ID');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Get ID from query params (Vercel passes it this way)
  const { id } = req.query;
  
  if (!id) {
    return res.status(400).json({
      success: false,
      error: 'Contact ID is required'
    });
  }

  // Extract tenant_id - CRITICAL SECURITY CHECK
  const tenantId = req.query.tenant_id || req.headers['x-tenant-id'];

  if (!tenantId) {
    return res.status(400).json({
      success: false,
      error: 'Tenant ID required'
    });
  }

  // ==================== GET - Single contact ====================
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', tenantId)  // ← ADDED: Verify tenant ownership
        .single();

      if (error) throw error;

      if (!data) {
        return res.status(404).json({
          success: false,
          error: 'Contact not found or access denied'
        });
      }

      return res.status(200).json({
        success: true,
        data: data
      });

    } catch (error) {
      console.error('[Prospects [id]] GET Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // ==================== PUT - Update contact ====================
  if (req.method === 'PUT') {
    try {
      const { name, email, company, phone, status, source, notes } = req.body;

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
        .eq('tenant_id', tenantId)  // ← ADDED: Verify tenant ownership
        .select();

      if (error) throw error;

      if (!data || data.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Contact not found or access denied'
        });
      }

      return res.status(200).json({
        success: true,
        data: data[0],
        message: 'Contact updated successfully'
      });

    } catch (error) {
      console.error('[Prospects [id]] PUT Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // ==================== DELETE - Remove contact ====================
  if (req.method === 'DELETE') {
    try {
      const { error } = await supabase
        .from('contacts')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenantId);  // ← ADDED: Verify tenant ownership

      if (error) throw error;

      return res.status(200).json({
        success: true,
        message: 'Contact deleted successfully'
      });

    } catch (error) {
      console.error('[Prospects [id]] DELETE Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  return res.status(405).json({ 
    success: false,
    error: 'Method not allowed' 
  });
};
