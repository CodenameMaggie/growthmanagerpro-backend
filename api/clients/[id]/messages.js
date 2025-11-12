import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Tenant-ID');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const tenantId = req.query.tenant_id || req.headers['x-tenant-id'];
  const { id } = req.query; // Client ID from URL

  if (!tenantId) {
    return res.status(400).json({
      success: false,
      error: 'Tenant ID is required'
    });
  }

  if (!id) {
    return res.status(400).json({
      success: false,
      error: 'Client ID is required'
    });
  }

  try {
    // ==================== GET - Fetch messages for specific client ====================
    if (req.method === 'GET') {
      const { limit = 50, offset = 0 } = req.query;

      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('client_id', id)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        console.error('[Client Messages] GET error:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch messages'
        });
      }

      console.log(`[Client Messages] Retrieved ${data.length} messages for client:`, id);

      return res.status(200).json({
        success: true,
        messages: data || [],
        count: data.length
      });
    }

    // ==================== POST - Send new message to specific client ====================
    if (req.method === 'POST') {
      const { author, content, message_type, sender_id, sender_type } = req.body;

      if (!content) {
        return res.status(400).json({
          success: false,
          error: 'Message content is required'
        });
      }

      const messageData = {
        tenant_id: tenantId,
        client_id: id,
        author: author || 'Team',
        content: content,
        message_type: message_type || 'text',
        sender_id: sender_id || null,
        sender_type: sender_type || 'advisor',
        created_at: new Date().toISOString(),
        read: false
      };

      const { data, error } = await supabase
        .from('messages')
        .insert([messageData])
        .select()
        .single();

      if (error) {
        console.error('[Client Messages] POST error:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to send message'
        });
      }

      console.log('[Client Messages] ✅ Message sent:', data.id);

      return res.status(201).json({
        success: true,
        message: data,
        message_text: 'Message sent successfully'
      });
    }

    // ==================== PUT - Mark message as read ====================
    if (req.method === 'PUT') {
      const { message_id, read } = req.body;

      if (!message_id) {
        return res.status(400).json({
          success: false,
          error: 'Message ID is required'
        });
      }

      const { data, error } = await supabase
        .from('messages')
        .update({
          read: read !== undefined ? read : true,
          read_at: new Date().toISOString()
        })
        .eq('id', message_id)
        .eq('tenant_id', tenantId)
        .eq('client_id', id)
        .select()
        .single();

      if (error) {
        console.error('[Client Messages] PUT error:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to update message'
        });
      }

      console.log('[Client Messages] ✅ Message updated:', message_id);

      return res.status(200).json({
        success: true,
        message: data,
        message_text: 'Message updated successfully'
      });
    }

    // ==================== DELETE - Delete message ====================
    if (req.method === 'DELETE') {
      const { message_id } = req.query;

      if (!message_id) {
        return res.status(400).json({
          success: false,
          error: 'Message ID is required'
        });
      }

      const { error } = await supabase
        .from('messages')
        .delete()
        .eq('id', message_id)
        .eq('tenant_id', tenantId)
        .eq('client_id', id);

      if (error) {
        console.error('[Client Messages] DELETE error:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to delete message'
        });
      }

      console.log('[Client Messages] ✅ Message deleted:', message_id);

      return res.status(200).json({
        success: true,
        message_text: 'Message deleted successfully'
      });
    }

    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });

  } catch (error) {
    console.error('[Client Messages] Server error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
}
