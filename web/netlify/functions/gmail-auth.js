// Gmail OAuth initiation — redirects user to Google consent screen
// Requires env vars: GMAIL_CLIENT_ID, GMAIL_REDIRECT_URI

export async function handler(event) {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const redirectUri = process.env.GMAIL_REDIRECT_URI || `${process.env.URL}/.netlify/functions/gmail-callback`;

  if (!clientId) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'GMAIL_CLIENT_ID not configured' }),
    };
  }

  const scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
  ].join(' ');

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', scopes);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');

  return {
    statusCode: 302,
    headers: { Location: authUrl.toString() },
    body: '',
  };
}
