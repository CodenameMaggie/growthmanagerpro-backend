import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Tenant-ID');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  const tenantId = req.query.tenant_id || req.headers['x-tenant-id'];

  if (!tenantId) {
    return res.status(400).json({
      success: false,
      error: 'Tenant ID is required'
    });
  }

  try {
    console.log('[Active Clients] Fetching for tenant:', tenantId);

    // Get active clients from deals table
    // Active clients are those with status = 'client' or 'active' or 'won'
    const { data: deals, error: dealsError } = await supabase
      .from('deals')
      .select('id, client_name, company, contact_id, contract_value, monthly_fee, status, stage, created_at')
      .eq('tenant_id', tenantId)
      .in('status', ['client', 'active', 'won'])
      .order('created_at', { ascending: false });

    if (dealsError) {
      console.error('[Active Clients] Deals query error:', dealsError);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch active clients'
      });
    }

    // Get contact details for clients
    const clientsWithDetails = await Promise.all(
      (deals || []).map(async (deal) => {
        let contactInfo = null;

        if (deal.contact_id) {
          const { data: contact } = await supabase
            .from('contacts')
            .select('email, phone, last_contact_date')
            .eq('id', deal.contact_id)
            .eq('tenant_id', tenantId)
            .single();

          contactInfo = contact;
        }

        return {
          id: deal.id,
          client_name: deal.client_name,
          company: deal.company,
          contact_id: deal.contact_id,
          email: contactInfo?.email || null,
          phone: contactInfo?.phone || null,
          contract_value: deal.contract_value,
          monthly_fee: deal.monthly_fee,
          status: deal.status,
          stage: deal.stage,
          last_contact_date: contactInfo?.last_contact_date || deal.created_at,
          created_at: deal.created_at
        };
      })
    );

    console.log(`[Active Clients] Retrieved ${clientsWithDetails.length} active clients`);

    return res.status(200).json({
      success: true,
      clients: clientsWithDetails,
      count: clientsWithDetails.length
    });

  } catch (error) {
    console.error('[Active Clients] Server error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
}
