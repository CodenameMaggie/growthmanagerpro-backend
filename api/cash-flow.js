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
        .from('cash_flow')
        .select('*')
        .order('transaction_date', { ascending: false });

      if (error) throw error;

      const income = data.filter(t => t.type === 'Income').reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
      const expenses = data.filter(t => t.type === 'Expense').reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
      const netCashFlow = income - expenses;

      const stats = {
        totalIncome: income,
        totalExpenses: expenses,
        netCashFlow: netCashFlow,
        currentBalance: data.length > 0 && data[0].running_balance ? parseFloat(data[0].running_balance) : 0
      };

      return res.status(200).json({
        success: true,
        data: {
          transactions: data.map(t => ({
            id: t.id,
            transactionDate: t.transaction_date,
            description: t.description,
            amount: t.amount,
            type: t.type,
            category: t.category,
            runningBalance: t.running_balance,
            notes: t.notes,
            created: t.created_at
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
