const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
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

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, full_name, role, status, last_login, created_at')
        .eq('id', id)
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
        data: data
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
      const { email, full_name, role, status } = req.body;

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
          error: 'User not found'
        });
      }

      return res.status(200).json({
        success: true,
        data: data[0],
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

  if (req.method === 'DELETE') {
    try {
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
      console.error('Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
