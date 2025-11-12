import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Tenant-ID');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Extract tenant_id and client_id from request
  const tenantId = req.query.tenant_id || req.headers['x-tenant-id'];
  const clientId = req.query.client_id || req.body?.client_id;

  if (!tenantId) {
    return res.status(400).json({
      success: false,
      error: 'Tenant ID is required'
    });
  }

  if (!clientId) {
    return res.status(400).json({
      success: false,
      error: 'Client ID is required'
    });
  }

  try {
    // ==================== GET - Fetch messages for client ====================
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[Client Dashboard Messages] GET error:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch messages'
        });
      }

      console.log(`[Client Dashboard Messages] Retrieved ${data.length} messages for client:`, clientId);

      return res.status(200).json({
        success: true,
        messages: data || [],
        count: data.length
      });
    }

    // ==================== POST - Send new message ====================
    if (req.method === 'POST') {
      const { author, content, message_type } = req.body;

      if (!content) {
        return res.status(400).json({
          success: false,
          error: 'Message content is required'
        });
      }

      const messageData = {
        tenant_id: tenantId,
        client_id: clientId,
        author: author || 'Client',
        content: content,
        message_type: message_type || 'text',
        created_at: new Date().toISOString(),
        read: false
      };

      const { data, error } = await supabase
        .from('messages')
        .insert([messageData])
        .select()
        .single();

      if (error) {
        console.error('[Client Dashboard Messages] POST error:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to send message'
        });
      }

      console.log('[Client Dashboard Messages] ✅ Message sent:', data.id);

      return res.status(201).json({
        success: true,
        message: data,
        message_text: 'Message sent successfully'
      });
    }

    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });

  } catch (error) {
    console.error('[Client Dashboard Messages] Server error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
}
