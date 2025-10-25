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

  // ==================== GET - Read all users ====================
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, full_name, role, status, last_login, created_at')
        .order('created_at', { ascending: false });
      
      if (error) throw error;

      // Transform data to match HTML expectations
      const users = (data || []).map(user => ({
        id: user.id,
        name: user.full_name,           // ← Map full_name to name
        email: user.email,
        role: user.role,
        status: user.status || 'active', // ← Include status
        joined: user.created_at,         // ← Map created_at to joined
        last_active: user.last_login     // ← Map last_login to last_active
      }));

      return res.status(200).json({
        success: true,
        users: users  // ← Changed from 'data' to 'users'
      });
      
    } catch (error) {
      console.error('Error fetching users:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // ==================== POST - Create new user ====================
  if (req.method === 'POST') {
    try {
      const { email, password, full_name, role } = req.body;
      
      if (!email || !password || !full_name) {
        return res.status(400).json({
          success: false,
          error: 'Email, password, and full name are required'
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
      const { data, error } = await supabase
        .from('users')
        .insert([{
          email,
          password, // In production, hash this!
          full_name,
          role: role || 'advisor',
          status: 'active'  // ← Add default status
        }])
        .select()
        .single();
      
      if (error) throw error;

      return res.status(201).json({
        success: true,
        user: {  // ← Changed from 'data' to 'user'
          id: data.id,
          name: data.full_name,  // ← Map to 'name'
          email: data.email,
          role: data.role,
          status: data.status,
          joined: data.created_at,
          last_active: data.last_login
        },
        message: 'User created successfully'
      });
      
    } catch (error) {
      console.error('Error creating user:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
