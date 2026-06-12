// Gmail OAuth callback — exchanges code for tokens, stores refresh token
// Requires env vars: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REDIRECT_URI

import { getStore } from '@netlify/blobs';

export async function handler(event) {
  const code = event.queryStringParameters?.code;
  const error = event.queryStringParameters?.error;

  if (error) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'text/html' },
      body: `<h1>Authorization failed</h1><p>${error}</p><a href="/">Back to app</a>`,
    };
  }

  if (!code) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'No authorization code provided' }),
    };
  }

  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const redirectUri = process.env.GMAIL_REDIRECT_URI || `${process.env.URL}/.netlify/functions/gmail-callback`;

  if (!clientId || !clientSecret) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Gmail credentials not configured' }),
    };
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenRes.json();

    if (tokens.error) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'text/html' },
        body: `<h1>Token exchange failed</h1><p>${tokens.error_description || tokens.error}</p><a href="/">Back to app</a>`,
      };
    }

    // Store tokens in Netlify Blobs
    const store = getStore('gmail-tokens');
    await store.setJSON('tokens', {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: Date.now() + (tokens.expires_in * 1000),
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Gmail Connected</title>
          <style>
            body { font-family: system-ui; background: #0a0a12; color: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
            .card { background: rgba(255,255,255,0.08); backdrop-filter: blur(20px); padding: 40px; border-radius: 20px; text-align: center; }
            h1 { color: #a78bfa; }
            a { color: #a78bfa; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>✓ Gmail Connected</h1>
            <p>Study notifications will now sync automatically.</p>
            <p><a href="/">Back to StudyFlow</a></p>
          </div>
        </body>
        </html>
      `,
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
