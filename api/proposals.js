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

  // Extract tenant_id from request
  const tenantId = req.query.tenant_id || req.headers['x-tenant-id'];

  if (!tenantId) {
    return res.status(400).json({
      success: false,
      error: 'Tenant ID is required'
    });
  }

  try {
    // ==================== GET - List all proposals ====================
    if (req.method === 'GET') {
      const { status, contact_id } = req.query;

      let query = supabase
        .from('proposals')
        .select('*')
        .eq('tenant_id', tenantId);

      // Filter by status if provided
      if (status) {
        query = query.eq('status', status);
      }

      // Filter by contact if provided
      if (contact_id) {
        query = query.eq('contact_id', contact_id);
      }

      // Order by most recent first
      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;

      if (error) {
        console.error('[Proposals API] GET error:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch proposals'
        });
      }

      console.log(`[Proposals API] Retrieved ${data.length} proposals for tenant:`, tenantId);

      return res.status(200).json({
        success: true,
        proposals: data,
        count: data.length
      });
    }

    // ==================== POST - Create new proposal ====================
    if (req.method === 'POST') {
      const {
        prospect_name,
        contact_id,
        email,
        company,
        phone,
        strategy_call_id,
        proposal_title,
        scope_of_work,
        deliverables,
        success_metrics,
        timeline,
        pricing_model,
        total_contract_value,
        monthly_fee,
        setup_fee,
        payment_terms,
        recommended_tier,
        recommended_systems,
        status,
        valid_until,
        follow_up_date,
        next_action,
        proposal_url,
        presentation_url,
        notes,
        internal_notes
      } = req.body;

      // Validate required fields
      if (!prospect_name) {
        return res.status(400).json({
          success: false,
          error: 'Prospect name is required'
        });
      }

      // Prepare proposal data
      const proposalData = {
        tenant_id: tenantId,
        prospect_name,
        contact_id: contact_id || null,
        email: email || null,
        company: company || null,
        phone: phone || null,
        strategy_call_id: strategy_call_id || null,
        proposal_title: proposal_title || 'Growth Management Proposal',
        scope_of_work: scope_of_work || null,
        deliverables: deliverables || null,
        success_metrics: success_metrics || null,
        timeline: timeline || null,
        pricing_model: pricing_model || 'monthly_retainer',
        total_contract_value: total_contract_value || null,
        monthly_fee: monthly_fee || null,
        setup_fee: setup_fee || 0,
        payment_terms: payment_terms || 'Net 30',
        recommended_tier: recommended_tier || null,
        recommended_systems: recommended_systems || null,
        status: status || 'draft',
        valid_until: valid_until || null,
        follow_up_date: follow_up_date || null,
        next_action: next_action || null,
        proposal_url: proposal_url || null,
        presentation_url: presentation_url || null,
        notes: notes || null,
        internal_notes: internal_notes || null,
        created_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('proposals')
        .insert([proposalData])
        .select()
        .single();

      if (error) {
        console.error('[Proposals API] POST error:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to create proposal'
        });
      }

      console.log('[Proposals API] ✅ Proposal created:', data.id);

      return res.status(201).json({
        success: true,
        proposal: data,
        message: 'Proposal created successfully'
      });
    }

    // ==================== PUT - Update proposal ====================
    if (req.method === 'PUT') {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Proposal ID is required'
        });
      }

      const {
        prospect_name,
        contact_id,
        email,
        company,
        phone,
        strategy_call_id,
        deal_id,
        proposal_title,
        scope_of_work,
        deliverables,
        success_metrics,
        timeline,
        pricing_model,
        total_contract_value,
        monthly_fee,
        setup_fee,
        payment_terms,
        recommended_tier,
        recommended_systems,
        status,
        valid_until,
        sent_at,
        sent_by,
        viewed_at,
        view_count,
        last_viewed_at,
        accepted_at,
        rejected_at,
        rejection_reason,
        follow_up_date,
        next_action,
        proposal_url,
        presentation_url,
        notes,
        internal_notes
      } = req.body;

      // Build update object (only include provided fields)
      const updateData = {
        updated_at: new Date().toISOString()
      };

      if (prospect_name !== undefined) updateData.prospect_name = prospect_name;
      if (contact_id !== undefined) updateData.contact_id = contact_id;
      if (email !== undefined) updateData.email = email;
      if (company !== undefined) updateData.company = company;
      if (phone !== undefined) updateData.phone = phone;
      if (strategy_call_id !== undefined) updateData.strategy_call_id = strategy_call_id;
      if (deal_id !== undefined) updateData.deal_id = deal_id;
      if (proposal_title !== undefined) updateData.proposal_title = proposal_title;
      if (scope_of_work !== undefined) updateData.scope_of_work = scope_of_work;
      if (deliverables !== undefined) updateData.deliverables = deliverables;
      if (success_metrics !== undefined) updateData.success_metrics = success_metrics;
      if (timeline !== undefined) updateData.timeline = timeline;
      if (pricing_model !== undefined) updateData.pricing_model = pricing_model;
      if (total_contract_value !== undefined) updateData.total_contract_value = total_contract_value;
      if (monthly_fee !== undefined) updateData.monthly_fee = monthly_fee;
      if (setup_fee !== undefined) updateData.setup_fee = setup_fee;
      if (payment_terms !== undefined) updateData.payment_terms = payment_terms;
      if (recommended_tier !== undefined) updateData.recommended_tier = recommended_tier;
      if (recommended_systems !== undefined) updateData.recommended_systems = recommended_systems;
      if (status !== undefined) updateData.status = status;
      if (valid_until !== undefined) updateData.valid_until = valid_until;
      if (sent_at !== undefined) updateData.sent_at = sent_at;
      if (sent_by !== undefined) updateData.sent_by = sent_by;
      if (viewed_at !== undefined) updateData.viewed_at = viewed_at;
      if (view_count !== undefined) updateData.view_count = view_count;
      if (last_viewed_at !== undefined) updateData.last_viewed_at = last_viewed_at;
      if (accepted_at !== undefined) updateData.accepted_at = accepted_at;
      if (rejected_at !== undefined) updateData.rejected_at = rejected_at;
      if (rejection_reason !== undefined) updateData.rejection_reason = rejection_reason;
      if (follow_up_date !== undefined) updateData.follow_up_date = follow_up_date;
      if (next_action !== undefined) updateData.next_action = next_action;
      if (proposal_url !== undefined) updateData.proposal_url = proposal_url;
      if (presentation_url !== undefined) updateData.presentation_url = presentation_url;
      if (notes !== undefined) updateData.notes = notes;
      if (internal_notes !== undefined) updateData.internal_notes = internal_notes;

      const { data, error } = await supabase
        .from('proposals')
        .update(updateData)
        .eq('id', id)
        .eq('tenant_id', tenantId)  // ✅ Ensure tenant isolation
        .select()
        .single();

      if (error) {
        console.error('[Proposals API] PUT error:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to update proposal'
        });
      }

      if (!data) {
        return res.status(404).json({
          success: false,
          error: 'Proposal not found'
        });
      }

      console.log('[Proposals API] ✅ Proposal updated:', id);

      // Auto-create deal if proposal accepted
      if (status === 'accepted' && !deal_id) {
        try {
          const dealData = {
            tenant_id: tenantId,
            client_name: prospect_name,
            company: company,
            contact_id: contact_id,
            proposal_id: id,
            contract_value: total_contract_value,
            monthly_fee: monthly_fee,
            payment_model: pricing_model,
            status: 'pending',
            stage: 'won',
            notes: `Created from accepted proposal ${data.proposal_number}`,
            created_at: new Date().toISOString()
          };

          const { data: newDeal, error: dealError } = await supabase
            .from('deals')
            .insert([dealData])
            .select()
            .single();

          if (!dealError && newDeal) {
            // Link deal back to proposal
            await supabase
              .from('proposals')
              .update({ deal_id: newDeal.id })
              .eq('id', id);

            console.log('[Proposals API] ✅ Auto-created deal:', newDeal.id);
            data.deal_id = newDeal.id;
          }
        } catch (dealError) {
          console.error('[Proposals API] Error creating deal:', dealError);
          // Don't fail the proposal update if deal creation fails
        }
      }

      return res.status(200).json({
        success: true,
        proposal: data,
        message: 'Proposal updated successfully'
      });
    }

    // ==================== DELETE - Delete proposal ====================
    if (req.method === 'DELETE') {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Proposal ID is required'
        });
      }

      const { error } = await supabase
        .from('proposals')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenantId);  // ✅ Ensure tenant isolation

      if (error) {
        console.error('[Proposals API] DELETE error:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to delete proposal'
        });
      }

      console.log('[Proposals API] ✅ Proposal deleted:', id);

      return res.status(200).json({
        success: true,
        message: 'Proposal deleted successfully'
      });
    }

    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });

  } catch (error) {
    console.error('[Proposals API] Server error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};
