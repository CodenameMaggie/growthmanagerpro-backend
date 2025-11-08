const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Tenant-ID');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ==================== GET - Read users ====================
  if (req.method === 'GET') {
    try {
      // Extract tenant_id from request (optional for admins)
      const tenantId = req.query.tenant_id || req.headers['x-tenant-id'];

      let query = supabase
        .from('users')
        .select('id, email, full_name, role, user_type, tenant_id, status, last_login, created_at');

      // If tenant_id provided, filter by it
      // Admins can omit tenant_id to see all users, or specify one to see that tenant's users
      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      
      if (error) throw error;

      // Transform data to match HTML expectations
      const users = (data || []).map(user => ({
        id: user.id,
        name: user.full_name,
        email: user.email,
        role: user.role,
        userType: user.user_type,
        tenantId: user.tenant_id,
        status: user.status || 'active',
        joined: user.created_at,
        last_active: user.last_login
      }));

      return res.status(200).json({
        success: true,
        users: users,
        tenant_filter: tenantId || 'all'
      });
      
    } catch (error) {
      console.error('[Users API] GET Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // ==================== POST - Create new user ====================
  if (req.method === 'POST') {
    try {
      // Extract tenant_id from request
      const tenantId = req.query.tenant_id || req.headers['x-tenant-id'];

      // For non-admin users, tenant_id is required
      // Admins can create users without tenant_id (global admins)
      const { email, password, full_name, role, user_type, require_tenant } = req.body;

      if (!email || !password || !full_name) {
        return res.status(400).json({
          success: false,
          error: 'Email, password, and full name are required'
        });
      }

      // If creating a non-admin user, tenant_id is required
      if (role !== 'admin' && !tenantId && require_tenant !== false) {
        return res.status(400).json({
          success: false,
          error: 'Tenant ID required for non-admin users'
        });
      }

      // Check if user already exists
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .single();
      
      if (existingUser) {
        return res.status(400).json({
          success: false,
          error: 'User with this email already exists'
        });
      }

      // Create user
      const insertData = {
        email,
        password, // In production, hash this!
        full_name,
        role: role || 'advisor',
        user_type: user_type || role || 'advisor',
        status: 'active'
      };

      // Add tenant_id if provided (null for admin users)
      if (tenantId) {
        insertData.tenant_id = tenantId;
      }

      const { data, error } = await supabase
        .from('users')
        .insert([insertData])
        .select()
        .single();
      
      if (error) throw error;

      return res.status(201).json({
        success: true,
        user: {
          id: data.id,
          name: data.full_name,
          email: data.email,
          role: data.role,
          userType: data.user_type,
          tenantId: data.tenant_id,
          status: data.status,
          joined: data.created_at,
          last_active: data.last_login
        },
        message: 'User created successfully'
      });
      
    } catch (error) {
      console.error('[Users API] POST Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // ==================== PUT - Update existing user ====================
  if (req.method === 'PUT') {
    try {
      const { id, email, full_name, role, user_type, status } = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'User ID is required'
        });
      }

      // 🚨 PROTECTION: NEVER modify maggie@maggieforbesstrategies.com
      if (email === 'maggie@maggieforbesstrategies.com') {
        return res.status(403).json({
          success: false,
          error: 'Cannot modify admin account'
        });
      }

      // Get existing user to check tenant
      const { data: existingUser, error: fetchError } = await supabase
        .from('users')
        .select('email, tenant_id, role')
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

      // Extract tenant_id from request
      const tenantId = req.query.tenant_id || req.headers['x-tenant-id'];

      // If tenant_id provided, verify user belongs to that tenant
      if (tenantId && existingUser.tenant_id !== tenantId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied - user belongs to different tenant'
        });
      }

      const updateData = {};
      if (full_name !== undefined) updateData.full_name = full_name;
      if (role !== undefined) updateData.role = role;
      if (user_type !== undefined) updateData.user_type = user_type;
      if (status !== undefined) updateData.status = status;

      const { data, error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return res.status(200).json({
        success: true,
        user: {
          id: data.id,
          name: data.full_name,
          email: data.email,
          role: data.role,
          userType: data.user_type,
          tenantId: data.tenant_id,
          status: data.status,
          joined: data.created_at,
          last_active: data.last_login
        },
        message: 'User updated successfully'
      });

    } catch (error) {
      console.error('[Users API] PUT Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // ==================== DELETE - Remove user ====================
  if (req.method === 'DELETE') {
    try {
      const { id } = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'User ID is required'
        });
      }

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

      // Extract tenant_id from request
      const tenantId = req.query.tenant_id || req.headers['x-tenant-id'];

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
      console.error('[Users API] DELETE Error:', error);
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
