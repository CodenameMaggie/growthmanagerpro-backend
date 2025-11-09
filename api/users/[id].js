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
      error: 'User ID is required'
    });
  }

  // Extract tenant_id from request (optional for admins viewing all users)
  const tenantId = req.query.tenant_id || req.headers['x-tenant-id'];

  // ==================== GET - Read single user ====================
  if (req.method === 'GET') {
    try {
      let query = supabase
        .from('users')
        .select('id, email, full_name, role, status, user_type, tenant_id, advisor_id, permissions, last_login, created_at')
        .eq('id', id);

      // If tenant_id provided, filter by it (non-admins should always provide this)
      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      }

      const { data, error } = await query.single();

      if (error) throw error;

      if (!data) {
        return res.status(404).json({
          success: false,
          error: 'User not found or access denied'
        });
      }

      return res.status(200).json({
        success: true,
        data: data
      });

    } catch (error) {
      console.error('[User [id]] GET Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // ==================== PUT - Update single user ====================
  if (req.method === 'PUT') {
    try {
      const { email, full_name, role, status } = req.body;

      // 🚨 PROTECTION: NEVER modify maggie@maggieforbesstrategies.com
      if (email === 'maggie@maggieforbesstrategies.com') {
        return res.status(403).json({
          success: false,
          error: 'Cannot modify admin account'
        });
      }

      // Get existing user to check email and tenant
      const { data: existingUser, error: fetchError } = await supabase
        .from('users')
        .select('email, tenant_id')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      if (!existingUser) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // 🚨 DOUBLE PROTECTION: Check email from database too
      if (existingUser.email === 'maggie@maggieforbesstrategies.com') {
        return res.status(403).json({
          success: false,
          error: 'Cannot modify admin account'
        });
      }

      // If tenant_id provided, verify user belongs to that tenant
      if (tenantId && existingUser.tenant_id !== tenantId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied - user belongs to different tenant'
        });
      }

      const updateData = {
        updated_at: new Date().toISOString()
      };
      
      if (email) updateData.email = email;
      if (full_name) updateData.full_name = full_name;
      if (role) updateData.role = role;
      if (status) updateData.status = status;

      const { data, error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', id)
        .select();

      if (error) throw error;

      if (!data || data.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'User not found or access denied'
        });
      }

      return res.status(200).json({
        success: true,
        data: data[0],
        message: 'User updated successfully'
      });

    } catch (error) {
      console.error('[User [id]] PUT Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // ==================== DELETE - Remove single user ====================
  if (req.method === 'DELETE') {
    try {
      // Get user to check if it's admin account
      const { data: existingUser, error: fetchError } = await supabase
        .from('users')
        .select('email, tenant_id')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      // 🚨 PROTECTION: NEVER delete maggie@maggieforbesstrategies.com
      if (existingUser.email === 'maggie@maggieforbesstrategies.com') {
        return res.status(403).json({
          success: false,
          error: 'Cannot delete admin account'
        });
      }

      // If tenant_id provided, verify user belongs to that tenant
      if (tenantId && existingUser.tenant_id !== tenantId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied - user belongs to different tenant'
        });
      }

      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return res.status(200).json({
        success: true,
        message: 'User deleted successfully'
      });

    } catch (error) {
      console.error('[User [id]] DELETE Error:', error);
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
