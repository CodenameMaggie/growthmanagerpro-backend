module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const hasSupabase = !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);

  return res.status(200).json({
    success: true,
    message: 'Backend API is working',
    timestamp: new Date().toISOString(),
    supabaseConfigured: hasSupabase
  });
};
