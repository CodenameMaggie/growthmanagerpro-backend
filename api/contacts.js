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

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const stats = {
        totalContacts: data.length,
        leads: data.filter(c => c.status === 'Lead').length,
        prospects: data.filter(c => c.status === 'Prospect').length,
        customers: data.filter(c => c.status === 'Customer').length
      };

      return res.status(200).json({
        success: true,
        data: {
          contacts: data.map(contact => ({
            id: contact.id,
            name: contact.name,
            email: contact.email,
            company: contact.company,
            phone: contact.phone,
            status: contact.status,
            source: contact.source,
            notes: contact.notes,
            lastContactDate: contact.last_contact_date,
            created: contact.created_at
          })),
          stats
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
