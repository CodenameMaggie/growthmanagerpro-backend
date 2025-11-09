const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Tenant-ID');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // ... rest of your code

  // Extract user ID from URL
  const userId = req.url.split('/').pop().split('?')[0];

  // GET single user
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, full_name, role, last_login, created_at')
        .eq('id', userId)
        .single();

      if (error) throw error;

      if (!data) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      return res.status(200).json({
        success: true,
        data
      });
    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // PUT - Update user
  if (req.method === 'PUT') {
    try {
      const updates = {};
      
      if (req.body.email) updates.email = req.body.email;
      if (req.body.full_name) updates.full_name = req.body.full_name;
      if (req.body.role) updates.role = req.body.role;
      if (req.body.password) updates.password = req.body.password; // In production, hash this!
      
      updates.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;

      return res.status(200).json({
        success: true,
        data: {
          id: data.id,
          email: data.email,
          full_name: data.full_name,
          role: data.role
        },
        message: 'User updated successfully'
      });

    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // DELETE user
  if (req.method === 'DELETE') {
    try {
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', userId);

      if (error) throw error;

      return res.status(200).json({
        success: true,
        message: 'User deleted successfully'
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

  // Extract user ID from URL
  const userId = req.url.split('/').pop().split('?')[0];

  // GET single user
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, full_name, role, last_login, created_at')
        .eq('id', userId)
        .single();

      if (error) throw error;

      if (!data) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      return res.status(200).json({
        success: true,
        data
      });
    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // PUT - Update user
  if (req.method === 'PUT') {
    try {
      const updates = {};
      
      if (req.body.email) updates.email = req.body.email;
      if (req.body.full_name) updates.full_name = req.body.full_name;
      if (req.body.role) updates.role = req.body.role;
      if (req.body.password) updates.password = req.body.password; // In production, hash this!
      
      updates.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;

      return res.status(200).json({
        success: true,
        data: {
          id: data.id,
          email: data.email,
          full_name: data.full_name,
          role: data.role
        },
        message: 'User updated successfully'
      });

    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // DELETE user
  if (req.method === 'DELETE') {
    try {
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', userId);

      if (error) throw error;

      return res.status(200).json({
        success: true,
        message: 'User deleted successfully'
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
