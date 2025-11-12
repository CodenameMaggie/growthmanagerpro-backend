import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const results = {
    timestamp: new Date().toISOString(),
    tests: {}
  };

  // Test 1: Environment Variables
  try {
    results.tests.environmentVariables = {
      status: 'PASS',
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'MISSING',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'MISSING'
    };
  } catch (error) {
    results.tests.environmentVariables = { status: 'FAIL', error: error.message };
  }

  // Test 2: Supabase Client Creation
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    results.tests.supabaseClient = {
      status: 'PASS',
      message: 'Client created successfully'
    };

    // Test 3: Supabase Connectivity
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id')
        .limit(1);

      if (error) {
        results.tests.supabaseConnectivity = {
          status: 'FAIL',
          error: error.message,
          code: error.code,
          hint: error.hint
        };
      } else {
        results.tests.supabaseConnectivity = {
          status: 'PASS',
          message: 'Successfully queried users table',
          recordsFound: data?.length || 0
        };
      }
    } catch (error) {
      results.tests.supabaseConnectivity = {
        status: 'FAIL',
        error: error.message
      };
    }
  } catch (error) {
    results.tests.supabaseClient = { status: 'FAIL', error: error.message };
  }

  // Test 4: bcrypt Import and Functionality
  try {
    const testPassword = 'test123';
    const hash = await bcrypt.hash(testPassword, 10);
    const isValid = await bcrypt.compare(testPassword, hash);

    results.tests.bcrypt = {
      status: isValid ? 'PASS' : 'FAIL',
      message: 'bcrypt hash and compare working',
      hashGenerated: !!hash,
      comparisonWorked: isValid
    };
  } catch (error) {
    results.tests.bcrypt = { status: 'FAIL', error: error.message };
  }

  // Test 5: JSON Body Parsing
  try {
    const body = req.body;
    results.tests.bodyParsing = {
      status: 'PASS',
      bodyReceived: !!body,
      bodyType: typeof body,
      bodyKeys: body ? Object.keys(body) : []
    };
  } catch (error) {
    results.tests.bodyParsing = { status: 'FAIL', error: error.message };
  }

  // Test 6: Node.js Runtime
  try {
    results.tests.runtime = {
      status: 'PASS',
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    };
  } catch (error) {
    results.tests.runtime = { status: 'FAIL', error: error.message };
  }

  // Summary
  const failedTests = Object.entries(results.tests).filter(([_, test]) => test.status === 'FAIL');
  results.summary = {
    total: Object.keys(results.tests).length,
    passed: Object.keys(results.tests).length - failedTests.length,
    failed: failedTests.length,
    failedTests: failedTests.map(([name]) => name)
  };

  return res.status(200).json(results);
}
