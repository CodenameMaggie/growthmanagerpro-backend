const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    try {
      // Get client ID from query parameter - MUST be a valid UUID
      // Example: ?client_id=ef282007-dddb-4e78-a17c-3b80a84e2e47
      const clientId = req.query.client_id;
      
      if (!clientId) {
        return res.status(400).json({
          success: false,
          error: 'client_id parameter is required (must be a valid UUID)'
        });
      }

      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(clientId)) {
        return res.status(400).json({
          success: false,
          error: 'client_id must be a valid UUID format'
        });
      }
      
      // Fetch client profile data from CONTACTS table
      const { data: clientData, error: clientError } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', clientId)
        .single();

      if (clientError) {
        console.error('Error fetching contact:', clientError);
        
        // If contact not found, return a helpful error
        if (clientError.code === 'PGRST116') {
          return res.status(404).json({
            success: false,
            error: 'Client not found with that ID'
          });
        }
        
        throw clientError;
      }

      // Fetch client's discovery calls
      const { data: calls, error: callsError } = await supabase
        .from('discovery_calls')
        .select('*')
        .or(`contact_id.eq.${clientId},prospect_id.eq.${clientId}`)
        .order('call_date', { ascending: true });

      if (callsError) {
        console.error('Error fetching discovery calls:', callsError);
      }

      // Fetch client's sales calls
      const { data: salesCalls, error: salesError } = await supabase
        .from('sales_calls')
        .select('*')
        .or(`contact_id.eq.${clientId},prospect_id.eq.${clientId}`)
        .order('call_date', { ascending: true });

      if (salesError) {
        console.error('Error fetching sales calls:', salesError);
      }

      // Fetch client's messages from messages table
      const { data: messagesData, error: messagesError } = await supabase
        .from('messages')
        .select('*')
        .eq('contact_id', clientId)
        .order('created_at', { ascending: true });

      if (messagesError) {
        console.error('Error fetching messages:', messagesError);
      }

      // Format messages for the portal
      const messages = messagesData && messagesData.length > 0 ? messagesData.map(msg => ({
        id: msg.id,
        sender: msg.sender_name || (msg.is_from_client ? clientData?.name : 'Maggie Forbes'),
        content: msg.message_text || msg.content,
        timestamp: msg.created_at,
        read: msg.is_read || false
      })) : [
        {
          id: 1,
          sender: 'Maggie Forbes',
          content: 'Welcome to your Growth Manager portal! Let\'s start building your 7x ROI journey.',
          timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          read: true
        },
        {
          id: 2,
          sender: clientData?.name || 'Client',
          content: 'Thanks Maggie! Looking forward to working together.',
          timestamp: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
          read: true
        }
      ];

      // Calculate program progress based on calls completed
      const allCalls = [...(calls || []), ...(salesCalls || [])];
      const totalCalls = allCalls.length;
      const completedCalls = allCalls.filter(c => 
        c.call_status === 'Completed' || c.status === 'completed'
      ).length;
      const programCompletion = totalCalls > 0 ? Math.round((completedCalls / totalCalls) * 100) : 0;

      // Calculate days in program
      const startDate = new Date(clientData?.created_at || Date.now());
      const today = new Date();
      const daysInProgram = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
      const daysRemaining = Math.max(0, 90 - daysInProgram);

      // Format upcoming calls for the portal
      const upcomingCalls = (calls || [])
        .filter(c => 
          (c.call_status === 'Scheduled' || c.status === 'scheduled') && 
          new Date(c.call_date || c.scheduled_date) > new Date()
        )
        .concat((salesCalls || []).filter(c => 
          (c.call_status === 'Scheduled' || c.status === 'scheduled') && 
          new Date(c.call_date || c.scheduled_date) > new Date()
        ))
        .sort((a, b) => new Date(a.call_date || a.scheduled_date) - new Date(b.call_date || b.scheduled_date))
        .slice(0, 3)
        .map(call => ({
          id: call.id,
          title: call.call_type || call.type || 'Strategy Call',
          date: call.call_date || call.scheduled_date,
          time: new Date(call.call_date || call.scheduled_date).toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit' 
          }),
          zoomLink: call.zoom_link || call.meeting_link || '#',
          status: call.call_status || call.status
        }));

      // Sample resources (you can create a resources table in Supabase later)
      const resources = [
        {
          id: 1,
          title: 'Your Custom Growth Plan',
          type: 'PDF',
          size: '2.4 MB',
          uploadDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          downloadUrl: '#'
        },
        {
          id: 2,
          title: 'Q1 Analytics Report',
          type: 'PDF',
          size: '1.8 MB',
          uploadDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
          downloadUrl: '#'
        }
      ];

      // Calculate milestones based on program stage
      const milestones = [
        {
          phase: 'Phase 1: Discovery & Strategy',
          status: completedCalls >= 1 ? 'completed' : 'in-progress',
          date: completedCalls >= 1 ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() : null
        },
        {
          phase: 'Phase 2: Implementation',
          status: completedCalls >= 2 ? 'completed' : completedCalls >= 1 ? 'in-progress' : 'upcoming',
          date: completedCalls >= 2 ? new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString() : null
        },
        {
          phase: 'Phase 3: Optimization',
          status: completedCalls >= 3 ? 'in-progress' : 'upcoming',
          date: null
        },
        {
          phase: 'Phase 4: Scale & Results',
          status: 'upcoming',
          date: null
        }
      ];

      // Return comprehensive client portal data
      return res.status(200).json({
        success: true,
        data: {
          client: {
            id: clientData?.id,
            name: clientData?.name || 'Client',
            email: clientData?.email,
            company: clientData?.company || 'Your Company',
            programStart: clientData?.created_at,
            programType: 'The Leadership Intelligence System™'
          },
          stats: {
            programCompletion: programCompletion,
            daysInProgram: daysInProgram,
            daysRemaining: daysRemaining,
            revenueGenerated: clientData?.revenue_generated || 0,
            roiMultiplier: clientData?.roi_multiplier || 0
          },
          milestones: milestones,
          messages: messages,
          upcomingCalls: upcomingCalls,
          resources: resources
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error fetching client portal data:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  if (req.method === 'POST') {
    // Handle POST requests for sending messages
    try {
      const { clientId, message } = req.body;

      if (!clientId || !message) {
        return res.status(400).json({
          success: false,
          error: 'clientId and message are required'
        });
      }

      // Save message to messages table
      const { data, error } = await supabase
        .from('messages')
        .insert([
          {
            contact_id: clientId,
            message_text: message,
            is_from_client: true,
            sender_name: 'Client',
            is_read: false,
            created_at: new Date().toISOString()
          }
        ])
        .select()
        .single();

      if (error) {
        console.error('Error saving message:', error);
        throw error;
      }
      
      return res.status(200).json({
        success: true,
        message: 'Message sent successfully',
        data: {
          id: data.id,
          sender: 'client',
          content: message,
          timestamp: data.created_at,
          read: false
        }
      });

    } catch (error) {
      console.error('Error posting message:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
