const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ==================== GET DISCUSSION NOTES ====================
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('advisor_discussions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      return res.status(200).json({
        success: true,
        notes: data || []
      });
    } catch (error) {
      console.error('Error fetching advisor discussion:', error);
      return res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }

  // ==================== POST NEW NOTE ====================
  if (req.method === 'POST') {
    try {
      const { content, author, role } = req.body;

      if (!content) {
        return res.status(400).json({
          success: false,
          error: 'Message content required'
        });
      }

      const { data, error } = await supabase
        .from('advisor_discussions')
        .insert([{
          content: content,
          author: author || 'Anonymous',
          role: role || 'advisor',
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;

      return res.status(201).json({
        success: true,
        note: data
      });
    } catch (error) {
      console.error('Error posting note:', error);
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
