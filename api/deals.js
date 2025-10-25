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

  // ==================== GET - Read all client deals/contracts ====================
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('deals')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // 🔧 TRANSFORM TO CAMELCASE - Match HTML expectations
      const transformedDeals = data.map(deal => ({
        id: deal.id,
        clientName: deal.client_name,
        company: deal.company,
        contractValue: deal.contract_value,
        monthlyFee: deal.monthly_fee,
        paymentModel: deal.payment_model,        // 'fixed', 'rev_share', 'hybrid'
        status: deal.status,                      // 'active', 'paused', 'completed', 'cancelled'
        renewalDate: deal.renewal_date,
        leadsGenerated: deal.leads_generated,
        revenueGenerated: deal.revenue_generated,
        roi: deal.roi,
        commissionEarned: deal.commission_earned,
        notes: deal.notes,
        created: deal.created_at
      }));

      // Calculate stats for dashboard
      const activeDeals = transformedDeals.filter(d => d.status === 'active');
      const totalValue = transformedDeals.reduce((sum, d) => sum + (parseFloat(d.contractValue) || 0), 0);
      const revenueGenerated = transformedDeals.reduce((sum, d) => sum + (parseFloat(d.revenueGenerated) || 0), 0);
      const commissionEarned = transformedDeals.reduce((sum, d) => sum + (parseFloat(d.commissionEarned) || 0), 0);
      const avgDealSize = activeDeals.length > 0 ? totalValue / activeDeals.length : 0;
      
      // Count deals up for renewal in next 30 days
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      const upForRenewal = transformedDeals.filter(d => {
        if (!d.renewalDate || d.status !== 'active') return false;
        const renewalDate = new Date(d.renewalDate);
        const today = new Date();
        return renewalDate >= today && renewalDate <= thirtyDaysFromNow;
      }).length;

      const stats = {
        activeDeals: activeDeals.length,
        totalValue: totalValue,
        revenueGenerated: revenueGenerated,
        commissionEarned: commissionEarned,
        upForRenewal: upForRenewal,
        avgDealSize: avgDealSize
      };

      return res.status(200).json({
        success: true,
        data: {
          deals: transformedDeals,
          stats
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('[Deals API] GET Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // ==================== POST - Create new client deal/contract ====================
  if (req.method === 'POST') {
    try {
      const { 
        clientName, 
        company, 
        contractValue,
        monthlyFee,
        paymentModel,
        status,
        renewalDate,
        leadsGenerated,
        revenueGenerated,
        roi,
        commissionEarned,
        notes 
      } = req.body;

      if (!clientName) {
        return res.status(400).json({
          success: false,
          error: 'Client name is required'
        });
      }

      // Validate payment model
      const validPaymentModels = ['fixed', 'rev_share', 'hybrid'];
      if (paymentModel && !validPaymentModels.includes(paymentModel)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid payment model. Must be: fixed, rev_share, or hybrid'
        });
      }

      // Validate status
      const validStatuses = ['active', 'paused', 'completed', 'cancelled'];
      if (status && !validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid status. Must be: active, paused, completed, or cancelled'
        });
      }

      const { data, error } = await supabase
        .from('deals')
        .insert([{
          client_name: clientName,
          company: company || null,
          contract_value: contractValue || 0,
          monthly_fee: monthlyFee || 0,
          payment_model: paymentModel || 'fixed',
          status: status || 'active',
          renewal_date: renewalDate || null,
          leads_generated: leadsGenerated || 0,
          revenue_generated: revenueGenerated || 0,
          roi: roi || 0,
          commission_earned: commissionEarned || 0,
          notes: notes || null
        }])
        .select()
        .single();

      if (error) throw error;

      // Transform response to camelCase
      const transformedDeal = {
        id: data.id,
        clientName: data.client_name,
        company: data.company,
        contractValue: data.contract_value,
        monthlyFee: data.monthly_fee,
        paymentModel: data.payment_model,
        status: data.status,
        renewalDate: data.renewal_date,
        leadsGenerated: data.leads_generated,
        revenueGenerated: data.revenue_generated,
        roi: data.roi,
        commissionEarned: data.commission_earned,
        notes: data.notes,
        created: data.created_at
      };

      return res.status(201).json({
        success: true,
        data: transformedDeal,
        message: 'Client deal created successfully'
      });

    } catch (error) {
      console.error('[Deals API] POST Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // ==================== PUT - Update existing client deal/contract ====================
  if (req.method === 'PUT') {
    try {
      const { 
        id, 
        clientName, 
        company, 
        contractValue,
        monthlyFee,
        paymentModel,
        status,
        renewalDate,
        leadsGenerated,
        revenueGenerated,
        roi,
        commissionEarned,
        notes 
      } = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Deal ID is required'
        });
      }

      // Build update object with only provided fields
      const updateData = {};
      if (clientName !== undefined) updateData.client_name = clientName;
      if (company !== undefined) updateData.company = company;
      if (contractValue !== undefined) updateData.contract_value = contractValue;
      if (monthlyFee !== undefined) updateData.monthly_fee = monthlyFee;
      if (paymentModel !== undefined) {
        const validPaymentModels = ['fixed', 'rev_share', 'hybrid'];
        if (!validPaymentModels.includes(paymentModel)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid payment model'
          });
        }
        updateData.payment_model = paymentModel;
      }
      if (status !== undefined) {
        const validStatuses = ['active', 'paused', 'completed', 'cancelled'];
        if (!validStatuses.includes(status)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid status'
          });
        }
        updateData.status = status;
      }
      if (renewalDate !== undefined) updateData.renewal_date = renewalDate;
      if (leadsGenerated !== undefined) updateData.leads_generated = leadsGenerated;
      if (revenueGenerated !== undefined) updateData.revenue_generated = revenueGenerated;
      if (roi !== undefined) updateData.roi = roi;
      if (commissionEarned !== undefined) updateData.commission_earned = commissionEarned;
      if (notes !== undefined) updateData.notes = notes;

      const { data, error } = await supabase
        .from('deals')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      if (!data) {
        return res.status(404).json({
          success: false,
          error: 'Deal not found'
        });
      }

      // Transform response to camelCase
      const transformedDeal = {
        id: data.id,
        clientName: data.client_name,
        company: data.company,
        contractValue: data.contract_value,
        monthlyFee: data.monthly_fee,
        paymentModel: data.payment_model,
        status: data.status,
        renewalDate: data.renewal_date,
        leadsGenerated: data.leads_generated,
        revenueGenerated: data.revenue_generated,
        roi: data.roi,
        commissionEarned: data.commission_earned,
        notes: data.notes,
        created: data.created_at
      };

      return res.status(200).json({
        success: true,
        data: transformedDeal,
        message: 'Deal updated successfully'
      });

    } catch (error) {
      console.error('[Deals API] PUT Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // ==================== DELETE - Remove client deal/contract ====================
  if (req.method === 'DELETE') {
    try {
      const { id } = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Deal ID is required'
        });
      }

      const { error } = await supabase
        .from('deals')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return res.status(200).json({
        success: true,
        message: 'Deal deleted successfully'
      });

    } catch (error) {
      console.error('[Deals API] DELETE Error:', error);
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
