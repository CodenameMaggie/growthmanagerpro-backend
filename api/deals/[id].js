// /api/deals/[id].js - Get single deal by ID
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Tenant-ID');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // ... rest of your code

  // Extract tenant_id
  const tenantId = req.query.tenant_id || req.headers['x-tenant-id'];
  
  if (!tenantId) {
    return res.status(400).json({
      success: false,
      error: 'Tenant ID required'
    });
  }

  // Get deal ID from URL
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({
      success: false,
      error: 'Deal ID required'
    });
  }

  // GET - Fetch single deal
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('deals')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();

      if (error) throw error;

      if (!data) {
        return res.status(404).json({
          success: false,
          error: 'Deal not found'
        });
      }

      return res.status(200).json({
        success: true,
        deal: data
      });

    } catch (error) {
      console.error('Error fetching deal:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // PUT - Update deal
  if (req.method === 'PUT') {
    try {
      const updates = req.body;

      // Remove tenant_id and id from updates (shouldn't be changed)
      delete updates.tenant_id;
      delete updates.id;

      const { data, error } = await supabase
        .from('deals')
        .update(updates)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (error) throw error;

      return res.status(200).json({
        success: true,
        deal: data
      });

    } catch (error) {
      console.error('Error updating deal:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // DELETE - Delete deal
  if (req.method === 'DELETE') {
    try {
      const { error } = await supabase
        .from('deals')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenantId);

      if (error) throw error;

      return res.status(200).json({
        success: true,
        message: 'Deal deleted'
      });

    } catch (error) {
      console.error('Error deleting deal:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
