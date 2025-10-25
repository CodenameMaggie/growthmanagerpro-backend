const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const event = req.body;
    console.log('Calendly webhook received:', event);

    // Calendly sends different event types
    const eventType = event.event;

    // We care about these events:
    // - invitee.created (someone booked a meeting)
    // - invitee.canceled (someone canceled a meeting)
    
    if (eventType === 'invitee.created') {
      const payload = event.payload;
      const inviteeEmail = payload.email;
      const inviteeName = payload.name;
      const eventStartTime = payload.scheduled_event.start_time;
      const eventEndTime = payload.scheduled_event.end_time;
      const meetingUri = payload.scheduled_event.uri;
      const calendlyEventType = payload.event_type_name; // "Discovery Call" or "Strategy Call"

      console.log(`Meeting booked by: ${inviteeName} (${inviteeEmail})`);
      console.log(`Event type: ${calendlyEventType}`);
      console.log(`Start time: ${eventStartTime}`);

      // Find the contact by email
      const { data: contact, error: contactError } = await supabase
        .from('contacts')
        .select('*')
        .eq('email', inviteeEmail)
        .single();

      if (contactError || !contact) {
        console.log('Contact not found for email:', inviteeEmail);
        return res.status(200).json({ 
          received: true, 
          message: 'Contact not found in system' 
        });
      }

      // Determine if this is a Discovery Call or Strategy/Sales Call
      const isDiscoveryCall = calendlyEventType.toLowerCase().includes('discovery');
      const isSalesCall = calendlyEventType.toLowerCase().includes('strategy') || 
                          calendlyEventType.toLowerCase().includes('sales');

      if (isDiscoveryCall) {
        // Update the most recent discovery call for this contact
        const { data: discoveryCall, error: discoveryError } = await supabase
          .from('discovery_calls')
          .select('*')
          .eq('contact_id', contact.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (discoveryCall) {
          const { error: updateError } = await supabase
            .from('discovery_calls')
            .update({
              call_date: eventStartTime,
              calendly_link: meetingUri,
              status: 'Scheduled',
              updated_at: new Date().toISOString()
            })
            .eq('id', discoveryCall.id);

          if (updateError) {
            console.error('Error updating discovery call:', updateError);
          } else {
            console.log('Discovery call updated with Calendly booking');
          }
        }
      } else if (isSalesCall) {
        // Update the most recent sales call for this contact
        const { data: salesCall, error: salesError } = await supabase
          .from('sales_calls')
          .select('*')
          .eq('contact_id', contact.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (salesCall) {
          const { error: updateError } = await supabase
            .from('sales_calls')
            .update({
              call_date: eventStartTime,
              calendly_link: meetingUri,
              status: 'Scheduled',
              updated_at: new Date().toISOString()
            })
            .eq('id', salesCall.id);

          if (updateError) {
            console.error('Error updating sales call:', updateError);
          } else {
            console.log('Sales call updated with Calendly booking');
          }
        }
      }

      return res.status(200).json({ 
        received: true,
        contact_found: true,
        call_type: isDiscoveryCall ? 'discovery' : isSalesCall ? 'sales' : 'unknown',
        message: 'Calendly booking processed successfully'
      });

    } else if (eventType === 'invitee.canceled') {
      const payload = event.payload;
      const inviteeEmail = payload.email;
      const canceledUri = payload.scheduled_event.uri;

      console.log(`Meeting canceled by: ${inviteeEmail}`);

      // Find the contact
      const { data: contact } = await supabase
        .from('contacts')
        .select('*')
        .eq('email', inviteeEmail)
        .single();

      if (contact) {
        // Update discovery calls with this Calendly link
        await supabase
          .from('discovery_calls')
          .update({
            status: 'Canceled',
            updated_at: new Date().toISOString()
          })
          .eq('contact_id', contact.id)
          .eq('calendly_link', canceledUri);

        // Update sales calls with this Calendly link
        await supabase
          .from('sales_calls')
          .update({
            status: 'Canceled',
            updated_at: new Date().toISOString()
          })
          .eq('contact_id', contact.id)
          .eq('calendly_link', canceledUri);

        console.log('Call status updated to Canceled');
      }

      return res.status(200).json({ 
        received: true,
        message: 'Cancellation processed'
      });
    }

    // For other event types, just acknowledge receipt
    return res.status(200).json({ 
      received: true,
      message: `Event type ${eventType} received but not processed`
    });

  } catch (error) {
    console.error('Error processing Calendly webhook:', error);
    // Always return 200 to Calendly so they don't retry
    return res.status(200).json({ 
      received: true, 
      error: error.message 
    });
  }
};
