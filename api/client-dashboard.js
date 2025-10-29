const { createClient } = require('@supabase/supabase-js');
// API endpoint for client dashboard
// This fetches data for individual clients viewing their program progress

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
 const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
);

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }

  try {
    const { clientId } = req.query;

    if (!clientId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Client ID is required' 
      });
    }

    // Fetch client data from prospects table
    const { data: client, error: clientError } = await supabase
      .from('prospects')
      .select('*')
      .eq('id', clientId)
      .single();

    if (clientError) {
      console.error('Error fetching client:', clientError);
      return res.status(404).json({ 
        success: false, 
        error: 'Client not found' 
      });
    }

    // Fetch discovery calls for this client
    const { data: discoveryCalls, error: discoveryError } = await supabase
      .from('discovery_calls')
      .select('*')
      .eq('prospect_id', clientId)
      .order('scheduled_date', { ascending: false });

    // Fetch sales calls for this client
    const { data: salesCalls, error: salesError } = await supabase
      .from('sales_calls')
      .select('*')
      .eq('prospect_id', clientId)
      .order('scheduled_date', { ascending: false });

    // Calculate program metrics
    const programStartDate = client.program_start_date 
      ? new Date(client.program_start_date) 
      : null;
    
    const today = new Date();
    const daysInProgram = programStartDate 
      ? Math.floor((today - programStartDate) / (1000 * 60 * 60 * 24))
      : 0;
    
    const daysRemaining = Math.max(0, 90 - daysInProgram);
    const completionPercentage = Math.min(100, Math.round((daysInProgram / 90) * 100));

    // Determine current phase based on days in program
    let currentPhase = 1;
    if (daysInProgram > 60) currentPhase = 4;
    else if (daysInProgram > 30) currentPhase = 3;
    else if (daysInProgram > 15) currentPhase = 2;

    // Get upcoming calls
    const upcomingCalls = [];
    
    // Add upcoming discovery calls
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

    // Add upcoming sales calls
    if (salesCalls) {
      salesCalls.forEach(call => {
        if (call.scheduled_date && new Date(call.scheduled_date) > today) {
          upcomingCalls.push({
            type: 'Sales Call',
            date: call.scheduled_date,
            time: call.scheduled_time || 'TBD',
            status: call.status || 'scheduled'
          });
        }
      });
    }

    // Sort upcoming calls by date
    upcomingCalls.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Build milestone progress
    const milestones = [
      {
        phase: 1,
        title: 'Foundation & Discovery',
        weeks: '1-2',
        status: currentPhase >= 2 ? 'completed' : currentPhase === 1 ? 'in-progress' : 'upcoming',
        tasks: [
          { name: 'Initial Discovery Call', completed: discoveryCalls && discoveryCalls.length > 0 },
          { name: 'Sales Strategy Consultation', completed: salesCalls && salesCalls.length > 0 },
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
          { name: 'Sales Process Refinement', completed: false },
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

    // Mock messages (you can replace this with real messages from a messages table)
    const messages = [
      {
        id: 1,
        from: 'Maggie Forbes',
        subject: 'Welcome to The Leadership Intelligence System™',
        preview: 'Great to have you on board! Let\'s get started with your growth journey...',
        date: new Date().toISOString(),
        unread: true
      }
    ];

    // Mock resources (you can replace this with real resources from a resources table)
    const resources = [
      {
        id: 1,
        title: 'Podcast Best Practices Guide',
        type: 'PDF',
        url: '#',
        uploadedDate: new Date().toISOString()
      },
      {
        id: 2,
        title: 'Lead Generation Templates',
        type: 'Templates',
        url: '#',
        uploadedDate: new Date().toISOString()
      }
    ];

    // Build response
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
        total: (discoveryCalls?.length || 0) + (salesCalls?.length || 0),
        discovery: discoveryCalls?.length || 0,
        sales: salesCalls?.length || 0,
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
    console.error('Client dashboard API error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      details: error.message 
    });
  }
};
