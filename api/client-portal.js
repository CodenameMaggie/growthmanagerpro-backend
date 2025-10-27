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
      // Get client ID from query parameter or authentication
      // For now, we'll use a query parameter: ?client_id=123
      const clientId = req.query.client_id || 1; // Default to client ID 1 for demo
      
      // Fetch client profile data
      const { data: clientData, error: clientError } = await supabase
        .from('prospects')
        .select('*')
        .eq('id', clientId)
        .single();

      if (clientError) throw clientError;

      // Fetch client's discovery calls
      const { data: calls, error: callsError } = await supabase
        .from('discovery_calls')
        .select('*')
        .eq('prospect_id', clientId)
        .order('call_date', { ascending: true });

      if (callsError) throw callsError;

      // Fetch client's sales calls
      const { data: salesCalls, error: salesError } = await supabase
        .from('sales_calls')
        .select('*')
        .eq('prospect_id', clientId)
        .order('call_date', { ascending: true });

      if (salesError) throw salesError;

      // Fetch client's messages (if you have a messages table)
      // For now, we'll return sample messages structure
      const messages = [
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
      const totalCalls = calls.length + salesCalls.length;
      const completedCalls = calls.filter(c => c.call_status === 'Completed').length + 
                            salesCalls.filter(c => c.call_status === 'Completed').length;
      const programCompletion = totalCalls > 0 ? Math.round((completedCalls / totalCalls) * 100) : 0;

      // Calculate days in program
      const startDate = new Date(clientData?.created_at || Date.now());
      const today = new Date();
      const daysInProgram = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
      const daysRemaining = Math.max(0, 90 - daysInProgram);

      // Format upcoming calls for the portal
      const upcomingCalls = calls
        .filter(c => c.call_status === 'Scheduled' && new Date(c.call_date) > new Date())
        .concat(salesCalls.filter(c => c.call_status === 'Scheduled' && new Date(c.call_date) > new Date()))
        .sort((a, b) => new Date(a.call_date) - new Date(b.call_date))
        .slice(0, 3)
        .map(call => ({
          id: call.id,
          title: call.call_type || 'Strategy Call',
          date: call.call_date,
          time: new Date(call.call_date).toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit' 
          }),
          zoomLink: call.zoom_link || '#',
          status: call.call_status
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

      // You can add a messages table to Supabase later
      // For now, just acknowledge receipt
      
      return res.status(200).json({
        success: true,
        message: 'Message received',
        data: {
          id: Date.now(),
          sender: 'client',
          content: message,
          timestamp: new Date().toISOString(),
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
