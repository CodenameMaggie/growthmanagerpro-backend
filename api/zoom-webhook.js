const crypto = require('crypto');

/**
 * ULTRA-MINIMAL ZOOM WEBHOOK - DIAGNOSTIC VERSION
 * This will log everything to help us see why validation is failing
 */
module.exports = async (req, res) => {
  // Log EVERYTHING
  console.log('=== ZOOM WEBHOOK CALLED ===');
  console.log('Method:', req.method);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Body:', JSON.stringify(req.body, null, 2));
  console.log('Env vars exist:', {
    ZOOM_WEBHOOK_SECRET: !!process.env.ZOOM_WEBHOOK_SECRET,
    secretLength: process.env.ZOOM_WEBHOOK_SECRET ? process.env.ZOOM_WEBHOOK_SECRET.length : 0
  });

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    console.log('OPTIONS request - returning 200');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    console.log('Not POST - returning 405');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check if body exists
  if (!req.body) {
    console.log('ERROR: No request body');
    return res.status(400).json({ error: 'No request body' });
  }

  const { event, payload } = req.body;
  console.log('Event type:', event);
  console.log('Payload:', payload);

  // VALIDATION
  if (event === 'endpoint.url_validation') {
    console.log('VALIDATION REQUEST RECEIVED');
    
    if (!payload || !payload.plainToken) {
      console.log('ERROR: No plainToken in payload');
      return res.status(400).json({ error: 'No plainToken' });
    }

    const plainToken = payload.plainToken;
    console.log('PlainToken:', plainToken);

    const zoomWebhookSecret = process.env.ZOOM_WEBHOOK_SECRET;
    
    if (!zoomWebhookSecret) {
      console.log('ERROR: ZOOM_WEBHOOK_SECRET not set');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    console.log('Secret found, length:', zoomWebhookSecret.length);
    
    try {
      // Create the encrypted token
      const encryptedToken = crypto
        .createHmac('sha256', zoomWebhookSecret)
        .update(plainToken)
        .digest('hex');
      
      console.log('EncryptedToken created:', encryptedToken);
      
      const response = {
        plainToken: plainToken,
        encryptedToken: encryptedToken
      };
      
      console.log('Sending response:', JSON.stringify(response));
      
      res.setHeader('Content-Type', 'application/json');
      res.status(200);
      res.json(response);
      
      console.log('Response sent successfully');
      return;
      
    } catch (error) {
      console.log('ERROR creating encrypted token:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // Other events
  console.log('Other event received:', event);
  return res.status(200).json({ message: 'Event received', event: event });
};
