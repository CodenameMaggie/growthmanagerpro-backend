const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

// Helper function to auto-create sales call when discovery is completed
async function autoCreateSalesCall(discoveryCall) {
  try {
    // Check if already created
    if (discoveryCall.sales_call_created) {
      console.log(`[Auto-Create] Sales call already exists for discovery call ${discoveryCall.id}`);
      return null;
    }

    // Only create if status is completed or qualified
    if (discoveryCall.call_status !== 'completed' && discoveryCall.call_status !== 'qualified') {
      console.log(`[Auto-Create] Discovery call ${discoveryCall.id} not completed (status: ${discoveryCall.call_status})`);
      return null;
    }

    console.log(`[Auto-Create] Creating sales call for ${discoveryCall.contact_name}`);

    // Create sales call
    const { data: salesCall, error: createError } = await supabase
      .from('sales_calls')
      .insert([{
        prospect_name: discoveryCall.contact_name,
        company: discoveryCall.company,
        email: discoveryCall.email,
        call_status: 'scheduled',
        deal_value: 0,
        notes: `Auto-created from discovery call. ${discoveryCall.notes || ''}`
      }])
      .select()
      .single();

    if (createError) throw createError;

    // Update discovery call to mark sales call as created
    const { error: updateError } = await supabase
      .from('discovery_calls')
      .update({
        sales_call_created: true,
        sales_call_id: salesCall.id
      })
      .eq('id', discoveryCall.id);

    if (updateError) throw updateError;

    console.log(`[Auto-Create] ✅ Sales call ${salesCall.id} created for discovery call ${discoveryCall.id}`);
    return salesCall;

  } catch (error) {
    console.error('[Auto-Create] Error creating sales call:', error);
    return null;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ==================== GET - Read all discovery calls ====================
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('discovery_calls')
        .select('*')
        .order('call_date', { ascending: false });

      if (error) throw error;

      const stats = {
        totalCalls: data.length,
        scheduledCalls: data.filter(c => c.call_status === 'scheduled').length,
        completedCalls: data.filter(c => c.call_status === 'completed').length,
        qualifiedCalls: data.filter(c => c.call_status === 'qualified').length,
        qualificationRate: data.length > 0 ? Math.round((data.filter(c => c.call_status === 'qualified').length / data.length) * 100) : 0,
        autoProgressedToSales: data.filter(c => c.sales_call_created === true).length
      };

      return res.status(200).json({
        success: true,
        data: {
          calls: data.map(call => ({
            id: call.id,
            contactName: call.contact_name,
            company: call.company,
            email: call.email,
            callDate: call.call_date,
            callStatus: call.call_status,
            callSource: call.call_source,
            notes: call.notes,
            salesCallCreated: call.sales_call_created,
            salesCallId: call.sales_call_id,
            created: call.created_at
          })),
          stats
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('[Discovery Calls API] GET Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // ==================== POST - Create new discovery call ====================
  if (req.method === 'POST') {
    try {
      const { contactName, company, email, callDate, callStatus, callSource, notes } = req.body;

      if (!contactName || !email) {
        return res.status(400).json({
          success: false,
          error: 'Contact name and email are required'
        });
      }

      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid email format'
        });
      }

      const { data, error } = await supabase
        .from('discovery_calls')
        .insert([{
          contact_name: contactName,
          company: company || null,
          email: email,
          call_date: callDate || null,
          call_status: callStatus || 'scheduled',
          call_source: callSource || null,
          notes: notes || null
        }])
        .select();

      if (error) throw error;

      return res.status(201).json({
        success: true,
        data: data[0],
        message: 'Discovery call created successfully'
      });

    } catch (error) {
      console.error('[Discovery Calls API] POST Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // ==================== PUT - Update existing discovery call ====================
  if (req.method === 'PUT') {
    try {
      const { id, contactName, company, email, callDate, callStatus, callSource, notes } = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Call ID is required'
        });
      }

      const updateData = {};
      if (contactName !== undefined) updateData.contact_name = contactName;
      if (company !== undefined) updateData.company = company;
      if (email !== undefined) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid email format'
          });
        }
        updateData.email = email;
      }
      if (callDate !== undefined) updateData.call_date = callDate;
      if (callStatus !== undefined) updateData.call_status = callStatus;
      if (callSource !== undefined) updateData.call_source = callSource;
      if (notes !== undefined) updateData.notes = notes;

      const { data, error } = await supabase
        .from('discovery_calls')
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

      const updatedCall = data[0];

      // 🚀 AUTO-CREATE SALES CALL if completed/qualified
      let salesCallCreated = null;
      if (updatedCall.call_status === 'completed' || updatedCall.call_status === 'qualified') {
        salesCallCreated = await autoCreateSalesCall(updatedCall);
      }

      return res.status(200).json({
        success: true,
        data: {
          id: updatedCall.id,
          contactName: updatedCall.contact_name,
          company: updatedCall.company,
          email: updatedCall.email,
          callDate: updatedCall.call_date,
          callStatus: updatedCall.call_status,
          salesCallCreated: updatedCall.sales_call_created,
          salesCallId: updatedCall.sales_call_id,
          created: updatedCall.created_at
        },
        message: 'Discovery call updated successfully',
        automation: salesCallCreated ? {
          salesCallCreated: true,
          salesCallId: salesCallCreated.id
        } : null
      });

    } catch (error) {
      console.error('[Discovery Calls API] PUT Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // ==================== DELETE - Remove discovery call ====================
  if (req.method === 'DELETE') {
    try {
      const { id } = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Call ID is required'
        });
      }

      const { error } = await supabase
        .from('discovery_calls')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return res.status(200).json({
        success: true,
        message: 'Discovery call deleted successfully'
      });

    } catch (error) {
      console.error('[Discovery Calls API] DELETE Error:', error);
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
