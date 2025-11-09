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
      error: 'Call ID is required'
    });
  }

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('strategy_calls')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      if (!data) {
        return res.status(404).json({
          success: false,
          error: 'Call not found'
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
      const { 
        prospect_name,
        prospect_email,
        scheduled_date,
        call_outcome,
        recommended_tier,
        systems_needed,
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
      if (call_outcome !== undefined) updateData.call_outcome = call_outcome;
      if (recommended_tier) updateData.recommended_tier = recommended_tier;
      if (systems_needed) updateData.systems_needed = systems_needed;
      if (calendly_link !== undefined) updateData.calendly_link = calendly_link;
      if (calendly_invite_sent !== undefined) updateData.calendly_invite_sent = calendly_invite_sent;
      if (completed !== undefined) updateData.completed = completed;
      if (notes !== undefined) updateData.notes = notes;

      const { data, error } = await supabase
        .from('strategy_calls')
        .update(updateData)
        .eq('id', id)
        .select();

      if (error) throw error;

      if (!data || data.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Call not found'
        });
      }

      return res.status(200).json({
        success: true,
        data: data[0],
        message: 'Call updated successfully'
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
        .from('strategy_calls')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return res.status(200).json({
        success: true,
        message: 'Call deleted successfully'
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
```

---

## ✅ **Checklist:**
```
☐ 1. Create users/[id].js
☐ 2. Create deals/[id].js
☐ 3. Create pre-qualification-calls/[id].js
☐ 4. Create podcast-interviews/[id].js
☐ 5. Create discovery-calls/[id].js
☐ 6. Create strategy-calls/[id].js
☐ 7. Wait for Vercel to deploy (30-60 seconds after each commit)
☐ 8. Test editing on each page!
