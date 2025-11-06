// API: /api/check-subdomain.js
// Check if a subdomain is available

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Reserved subdomains that cannot be used
const RESERVED_SUBDOMAINS = [
    'www', 'api', 'app', 'admin', 'dashboard', 'login', 'signup',
    'mail', 'smtp', 'ftp', 'webmail', 'support', 'help', 'docs',
    'blog', 'status', 'staging', 'dev', 'test', 'demo', 'sandbox'
];

module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { subdomain } = req.query;

        if (!subdomain) {
            return res.status(400).json({
                available: false,
                error: 'Subdomain parameter required'
            });
        }

        // Validate format
        const subdomainRegex = /^[a-z0-9-]{3,30}$/;
        if (!subdomainRegex.test(subdomain)) {
            return res.json({
                available: false,
                error: 'Invalid format. Use lowercase letters, numbers, and hyphens only (3-30 characters)'
            });
        }

        // Check if reserved
        if (RESERVED_SUBDOMAINS.includes(subdomain.toLowerCase())) {
            return res.json({
                available: false,
                error: 'This subdomain is reserved'
            });
        }

        // Check database
        const { data: existingTenant } = await supabase
            .from('tenants')
            .select('id')
            .eq('subdomain', subdomain)
            .single();

        if (existingTenant) {
            return res.json({
                available: false,
                error: 'Subdomain already taken'
            });
        }

        // Available!
        return res.json({
            available: true,
            subdomain: subdomain,
            fullDomain: `${subdomain}.growthmanagerpro.com`
        });

    } catch (error) {
        console.error('[Check Subdomain] Error:', error);
        return res.status(500).json({
            available: false,
            error: 'Server error'
        });
    }
};
