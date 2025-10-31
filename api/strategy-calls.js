const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
  // ============================================
  // CORS HEADERS - CRITICAL FOR FRONTEND ACCESS
  // ============================================
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // GET - Fetch all strategy/strategy calls
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('strategy_calls')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[Strategy Calls API] Error fetching calls:', error);
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json(data);
    }

    // POST - Create new strategy call
    if (req.method === 'POST') {
      const callData = req.body;

      const { data, error } = await supabase
        .from('strategy_calls')
        .insert(callData)
        .select()
        .single();

      if (error) {
        console.error('[Strategy Calls API] Error creating call:', error);
        return res.status(500).json({ error: error.message });
      }

      return res.status(201).json(data);
    }

    // PUT - Update strategy call
    if (req.method === 'PUT') {
      const { id, ...updates } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Call ID required' });
      }

      const { data, error } = await supabase
        .from('strategy_calls')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('[Strategy Calls API] Error updating call:', error);
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json(data);
    }

    // DELETE - Delete strategy call
    if (req.method === 'DELETE') {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({ error: 'Call ID required' });
      }

      const { error } = await supabase
        .from('strategy_calls')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('[Strategy Calls API] Error deleting call:', error);
        return res.status(500).json({ error: error.message });
      }

     return res.status(200).json({
  success: true,
  data: {
    calls: transformedCalls,
    stats: { ... }
  }
}); 

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('[Strategy Calls API] Fatal error:', error);
    return res.status(500).json({ error: error.message });
  }
};
