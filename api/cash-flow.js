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

  // ==================== GET - Read all cash flow transactions ====================
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('cash_flow')
        .select('*')
        .order('transaction_date', { ascending: false });

      if (error) throw error;

      // Calculate stats
      const income = data.filter(t => t.transaction_type === 'income').reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
      const expenses = data.filter(t => t.transaction_type === 'expense').reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);

      const stats = {
        totalIncome: income,
        totalExpenses: expenses,
        netCashFlow: income - expenses,
        transactionCount: data.length
      };

      // 🔧 TRANSFORM TO MATCH HTML - Use simplified field names
      const transformedTransactions = data.map(t => ({
        id: t.id,
        description: t.description,
        amount: t.amount,
        type: t.transaction_type,        // ✅ Simplified from transactionType
        category: t.category,
        date: t.transaction_date,        // ✅ Simplified from transactionDate
        notes: t.notes,
        created: t.created_at
      }));

      return res.status(200).json({
        success: true,
        data: {
          transactions: transformedTransactions,
          stats
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('[Cash Flow API] GET Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // ==================== POST - Create new transaction ====================
  if (req.method === 'POST') {
    try {
      const { description, amount, transactionType, category, transactionDate, notes } = req.body;

      if (!description || !amount || !transactionType) {
        return res.status(400).json({
          success: false,
          error: 'Description, amount, and transaction type are required'
        });
      }

      // Validate transaction type
      if (!['income', 'expense'].includes(transactionType)) {
        return res.status(400).json({
          success: false,
          error: 'Transaction type must be either "income" or "expense"'
        });
      }

      const { data, error } = await supabase
        .from('cash_flow')
        .insert([{
          description: description,
          amount: amount,
          transaction_type: transactionType,
          category: category || null,
          transaction_date: transactionDate || new Date().toISOString().split('T')[0],
          notes: notes || null
        }])
        .select()
        .single();

      if (error) throw error;

      // Transform response to match HTML
      const transformedTransaction = {
        id: data.id,
        description: data.description,
        amount: data.amount,
        type: data.transaction_type,
        category: data.category,
        date: data.transaction_date,
        notes: data.notes,
        created: data.created_at
      };

      return res.status(201).json({
        success: true,
        data: transformedTransaction,
        message: 'Transaction created successfully'
      });

    } catch (error) {
      console.error('[Cash Flow API] POST Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // ==================== PUT - Update existing transaction ====================
  if (req.method === 'PUT') {
    try {
      const { id, description, amount, transactionType, category, transactionDate, notes } = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Transaction ID is required'
        });
      }

      // Build update object
      const updateData = {};
      if (description !== undefined) updateData.description = description;
      if (amount !== undefined) updateData.amount = amount;
      if (transactionType !== undefined) {
        if (!['income', 'expense'].includes(transactionType)) {
          return res.status(400).json({
            success: false,
            error: 'Transaction type must be either "income" or "expense"'
          });
        }
        updateData.transaction_type = transactionType;
      }
      if (category !== undefined) updateData.category = category;
      if (transactionDate !== undefined) updateData.transaction_date = transactionDate;
      if (notes !== undefined) updateData.notes = notes;

      const { data, error } = await supabase
        .from('cash_flow')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      if (!data) {
        return res.status(404).json({
          success: false,
          error: 'Transaction not found'
        });
      }

      // Transform response to match HTML
      const transformedTransaction = {
        id: data.id,
        description: data.description,
        amount: data.amount,
        type: data.transaction_type,
        category: data.category,
        date: data.transaction_date,
        notes: data.notes,
        created: data.created_at
      };

      return res.status(200).json({
        success: true,
        data: transformedTransaction,
        message: 'Transaction updated successfully'
      });

    } catch (error) {
      console.error('[Cash Flow API] PUT Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // ==================== DELETE - Remove transaction ====================
  if (req.method === 'DELETE') {
    try {
      const { id } = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Transaction ID is required'
        });
      }

      const { error } = await supabase
        .from('cash_flow')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return res.status(200).json({
        success: true,
        message: 'Transaction deleted successfully'
      });

    } catch (error) {
      console.error('[Cash Flow API] DELETE Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  return res.status(405).json({ 
    success: false,
    error: 'Method not allowed' 
  });
};
