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
        .from('expense_tracker')
        .select('*')
        .order('due_date', { ascending: true });

      if (error) throw error;

      const stats = {
        totalExpenses: data.length,
        totalAmount: data.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0),
        recurringExpenses: data.filter(e => e.is_recurring).length,
        monthlyRecurring: data.filter(e => e.is_recurring && e.frequency === 'Monthly').reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0)
      };

      return res.status(200).json({
        success: true,
        data: {
          expenses: data.map(expense => ({
            id: expense.id,
            expenseName: expense.expense_name,
            amount: expense.amount,
            category: expense.category,
            frequency: expense.frequency,
            dueDate: expense.due_date,
            isRecurring: expense.is_recurring,
            status: expense.status,
            notes: expense.notes,
            created: expense.created_at
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
