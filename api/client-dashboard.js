const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET - Load client dashboard
  if (req.method === 'GET') {
    try {
      const { clientId } = req.query;
      if (!clientId) {
        return res.status(400).json({ success: false, error: 'Client ID required' });
      }

      // ✅ FIXED: Use 'contacts' table (not prospects)
      const { data: client, error: clientError } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', clientId)
        .single();

      if (clientError) {
        console.error('Error fetching client:', clientError);
        throw new Error('Client not found');
      }

      // Fetch discovery calls
      const { data: discoveryCalls } = await supabase
        .from('discovery_calls')
        .select('*')
        .eq('contact_id', clientId)
        .order('scheduled_date', { ascending: false });

      // ✅ FIXED: Use 'strategy_calls' table (not sales_calls)
      const { data: strategyCalls } = await supabase
        .from('strategy_calls')
        .select('*')
        .eq('contact_id', clientId)
        .order('scheduled_date', { ascending: false });

      // ✅ Use existing 'messages' table
      const { data: messagesData } = await supabase
        .from('messages')
        .select('*')
        .eq('contact_id', clientId)
        .order('created_at', { ascending: false });

      // Calculate program metrics
      const programStartDate = client.program_start_date ? new Date(client.program_start_date) : null;
      const today = new Date();
      const daysInProgram = programStartDate ? Math.floor((today - programStartDate) / (1000 * 60 * 60 * 24)) : 0;
      const daysRemaining = Math.max(0, 90 - daysInProgram);
      const completionPercentage = Math.min(100, Math.round((daysInProgram / 90) * 100));

      let currentPhase = 1;
      if (daysInProgram > 60) currentPhase = 4;
      else if (daysInProgram > 30) currentPhase = 3;
      else if (daysInProgram > 15) currentPhase = 2;

      // Get upcoming calls
      const upcomingCalls = [];
      
      if (discoveryCalls) {
        discoveryCalls.forEach(call => {
          if (call.scheduled_date && new Date(call.scheduled_date) > today) {
            upcomingCalls.push({
              type: 'Discovery Call',
              date: call.scheduled_date,
              time: call.scheduled_time || 'TBD',
              status: call.status || 'scheduled'
            });
          }
        });
      }

      if (strategyCalls) {
        strategyCalls.forEach(call => {
          if (call.scheduled_date && new Date(call.scheduled_date) > today) {
            upcomingCalls.push({
              type: 'Strategy Call',
              date: call.scheduled_date,
              time: call.scheduled_time || 'TBD',
              status: call.status || 'scheduled'
            });
          }
        });
      }

      upcomingCalls.sort((a, b) => new Date(a.date) - new Date(b.date));

      // Build milestones
      const milestones = [
        {
          phase: 1,
          title: 'Foundation & Discovery',
          weeks: '1-2',
          status: currentPhase >= 2 ? 'completed' : currentPhase === 1 ? 'in-progress' : 'upcoming',
          tasks: [
            { name: 'Initial Discovery Call', completed: discoveryCalls && discoveryCalls.length > 0 },
            { name: 'Strategy Call Consultation', completed: strategyCalls && strategyCalls.length > 0 },
            { name: 'Growth Plan Development', completed: client.growth_plan_created || false }
          ]
        },
        {
          phase: 2,
          title: 'Implementation & Setup',
          weeks: '3-4',
          status: currentPhase >= 3 ? 'completed' : currentPhase === 2 ? 'in-progress' : 'upcoming',
          tasks: [
            { name: 'Systems Setup', completed: false },
            { name: 'Content Strategy', completed: false },
            { name: 'Lead Generation Launch', completed: false }
          ]
        },
        {
          phase: 3,
          title: 'Optimization & Scale',
          weeks: '5-8',
          status: currentPhase >= 4 ? 'completed' : currentPhase === 3 ? 'in-progress' : 'upcoming',
          tasks: [
            { name: 'Campaign Optimization', completed: false },
            { name: 'Strategy Process Refinement', completed: false },
            { name: 'Scaling Strategy', completed: false }
          ]
        },
        {
          phase: 4,
          title: 'Results & Sustainability',
          weeks: '9-12',
          status: currentPhase === 4 ? 'in-progress' : 'upcoming',
          tasks: [
            { name: 'ROI Analysis', completed: false },
            { name: 'Long-term Strategy', completed: false },
            { name: 'Handoff Documentation', completed: false }
          ]
        }
      ];

      // Use messages from database
      const messages = messagesData && messagesData.length > 0 
        ? messagesData.map(msg => ({
            id: msg.id,
            from: msg.author || 'Maggie Forbes',
            subject: msg.subject || 'Message',
            preview: msg.content ? msg.content.substring(0, 100) + '...' : '',
            content: msg.content,
            date: msg.created_at,
            unread: !msg.is_read
          }))
        : [];

      const resources = [
        {
          id: 1,
          title: 'Strategic Growth Architecture System Guide',
          type: 'PDF',
          url: '#',
          uploadedDate: new Date().toISOString()
        }
      ];

      const dashboardData = {
        client: {
          id: client.id,
          name: client.name || 'Client',
          email: client.email,
          company: client.company,
          programStartDate: client.program_start_date,
          status: client.status || 'active'
        },
        program: {
          daysInProgram,
          daysRemaining,
          completionPercentage,
          currentPhase
        },
        calls: {
          total: (discoveryCalls?.length || 0) + (strategyCalls?.length || 0),
          discovery: discoveryCalls?.length || 0,
          strategy: strategyCalls?.length || 0,
          upcoming: upcomingCalls
        },
        milestones,
        messages,
        resources
      };

      return res.status(200).json({
        success: true,
        data: dashboardData
      });

    } catch (error) {
      console.error('client dashboard error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // POST - Save message
  if (req.method === 'POST') {
    try {
      const { clientId, message, subject } = req.body;

      if (!clientId || !message) {
        return res.status(400).json({ success: false, error: 'Client ID and message required' });
      }

      // ✅ FIXED: Get client from 'contacts' table
      const { data: client } = await supabase
        .from('contacts')
        .select('name')
        .eq('id', clientId)
        .single();

      // ✅ Save to existing 'messages' table
      const { data: savedMessage, error } = await supabase
        .from('messages')
        .insert([{
          contact_id: clientId,
          author: client?.name || 'Client',
          subject: subject || 'New Message',
          content: message,
          is_read: false,
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;

      return res.status(200).json({
        success: true,
        message: 'Message sent successfully',
        data: savedMessage
      });

    } catch (error) {
      console.error('Message error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
};
