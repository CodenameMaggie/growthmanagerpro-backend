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

  // Get ID from query params
  const { id } = req.query;
  
  if (!id) {
    return res.status(400).json({
      success: false,
      error: 'Call ID is required'
    });
  }

  // Extract tenant_id from request
  const tenantId = req.query.tenant_id || req.headers['x-tenant-id'];

  if (!tenantId) {
    return res.status(400).json({
      success: false,
      error: 'Tenant ID required'
    });
  }

  // ==================== GET - Read single discovery call ====================
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('discovery_calls')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', tenantId)  // ← ADDED: Verify tenant ownership
        .single();

      if (error) throw error;

      if (!data) {
        return res.status(404).json({
          success: false,
          error: 'Call not found or access denied'
        });
      }

      return res.status(200).json({
        success: true,
        data: data
      });

    } catch (error) {
      console.error('[Discovery Call [id]] GET Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // ==================== PUT - Update single discovery call ====================
  if (req.method === 'PUT') {
    try {
      const { 
        prospect_name,
        prospect_email,
        scheduled_date,
        calendly_link,
        calendly_invite_sent,
        completed,
        notes
      } = req.body;

      const updateData = {
        updated_at: new Date().toISOString()
      };
      
      if (prospect_name) updateData.prospect_name = prospect_name;
      if (prospect_email) updateData.prospect_email = prospect_email;
      if (scheduled_date) updateData.scheduled_date = scheduled_date;
      if (calendly_link !== undefined) updateData.calendly_link = calendly_link;
      if (calendly_invite_sent !== undefined) updateData.calendly_invite_sent = calendly_invite_sent;
      if (completed !== undefined) updateData.completed = completed;
      if (notes !== undefined) updateData.notes = notes;

      const { data, error } = await supabase
        .from('discovery_calls')
        .update(updateData)
        .eq('id', id)
        .eq('tenant_id', tenantId)  // ← ADDED: Verify tenant ownership
        .select();

      if (error) throw error;

      if (!data || data.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Call not found or access denied'
        });
      }

      return res.status(200).json({
        success: true,
        data: data[0],
        message: 'Call updated successfully'
      });

    } catch (error) {
      console.error('[Discovery Call [id]] PUT Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // ==================== DELETE - Remove single discovery call ====================
  if (req.method === 'DELETE') {
    try {
      const { error } = await supabase
        .from('discovery_calls')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenantId);  // ← ADDED: Verify tenant ownership

      if (error) throw error;

      return res.status(200).json({
        success: true,
        message: 'Call deleted successfully'
      });

    } catch (error) {
      console.error('[Discovery Call [id]] DELETE Error:', error);
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
