// Gmail sync function — fetches study notification emails and parses them into offers
// Can be called manually or on a schedule
// Requires env vars: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET

import { getStore } from '@netlify/blobs';

// Platform detection patterns
const PLATFORM_PATTERNS = {
  respondent: /respondent\.io|Respondent/i,
  userinterviews: /userinterviews\.com|User\s*Interviews/i,
  usertesting: /usertesting\.com|UserTesting/i,
  prolific: /prolific\.(co|ac|com)|Prolific/i,
  dscout: /dscout\.com|dscout/i,
};

// Senders that indicate study invites
const STUDY_SENDERS = [
  'noreply@respondent.io',
  'invitations@userinterviews.com',
  'hello@usertesting.com',
  'no-reply@prolific.com',
  'notifications@dscout.com',
];

function detectPlatform(text) {
  for (const [platform, pattern] of Object.entries(PLATFORM_PATTERNS)) {
    if (pattern.test(text)) return platform;
  }
  return 'unknown';
}

function parseOffer(emailData) {
  const subject = emailData.subject || '';
  const body = emailData.body || '';
  const from = emailData.from || '';
  const fullText = `${subject}\n${body}`;

  const platform = detectPlatform(fullText) || detectPlatform(from);

  // Extract pay amount
  const payMatch = fullText.match(/\$\s?(\d+(?:\.\d{1,2})?)/);
  const pay = payMatch ? Math.round(parseFloat(payMatch[1])) : null;

  // Extract duration
  let duration = null;
  const hrMatch = fullText.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/i);
  const minMatch = fullText.match(/(\d+)\s*(?:minutes?|mins?)\b/i);
  if (hrMatch) duration = Math.round(parseFloat(hrMatch[1]) * 60);
  else if (minMatch) duration = parseInt(minMatch[1]);

  // Extract title (prefer quoted strings, then subject line cleanup)
  let title = null;
  const quotedMatch = fullText.match(/[""]([^""]{4,80})[""]/) ||
                      fullText.match(/'([^']{4,80})'(?=\s|$)/);
  if (quotedMatch) {
    title = quotedMatch[1].trim();
  } else {
    title = subject
      .replace(/^(re:|fwd?:|you're invited[!:]?|new study[!:]?|invitation[!:]?)\s*/gi, '')
      .trim()
      .slice(0, 80);
  }

  // Extract URL
  const urlMatch = fullText.match(/https?:\/\/[^\s<>"']+/);
  const url = urlMatch ? urlMatch[0].replace(/[.,;:!?)]+$/, '') : null;

  // Score the offer (pay per minute * 100)
  const score = (pay && duration) ? Math.round((pay / duration) * 100) : 0;

  return {
    id: `gmail-${emailData.id}`,
    title: title || 'Untitled Study',
    platform,
    pay,
    duration,
    url,
    score,
    source: 'gmail',
    receivedAt: emailData.date,
    snippet: emailData.snippet,
  };
}

async function refreshAccessToken(store, clientId, clientSecret) {
  const tokens = await store.get('tokens', { type: 'json' });
  if (!tokens?.refresh_token) {
    throw new Error('No refresh token available. Please re-authorize Gmail.');
  }

  // Check if current token is still valid
  if (tokens.access_token && tokens.expires_at > Date.now() + 60000) {
    return tokens.access_token;
  }

  // Refresh the token
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  const newTokens = await res.json();
  if (newTokens.error) {
    throw new Error(`Token refresh failed: ${newTokens.error_description || newTokens.error}`);
  }

  // Update stored tokens
  await store.setJSON('tokens', {
    access_token: newTokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + (newTokens.expires_in * 1000),
  });

  return newTokens.access_token;
}

async function fetchEmails(accessToken) {
  // Build query: from known study senders, newer than 7 days
  const senderQuery = STUDY_SENDERS.map(s => `from:${s}`).join(' OR ');
  const query = `(${senderQuery}) newer_than:7d`;

  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=20`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const listData = await listRes.json();
  if (listData.error) {
    throw new Error(`Gmail API error: ${listData.error.message}`);
  }

  if (!listData.messages?.length) {
    return [];
  }

  // Fetch full message data for each
  const emails = await Promise.all(
    listData.messages.map(async (msg) => {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const msgData = await msgRes.json();

      // Extract headers
      const headers = msgData.payload?.headers || [];
      const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value;

      // Extract body (handle multipart)
      let body = '';
      const extractBody = (part) => {
        if (part.body?.data) {
          body += Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
        if (part.parts) {
          part.parts.forEach(extractBody);
        }
      };
      extractBody(msgData.payload);

      return {
        id: msg.id,
        subject: getHeader('Subject') || '',
        from: getHeader('From') || '',
        date: getHeader('Date') || '',
        snippet: msgData.snippet || '',
        body,
      };
    })
  );

  return emails;
}

export async function handler(event) {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Gmail credentials not configured', offers: [] }),
    };
  }

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      },
      body: '',
    };
  }

  try {
    const store = getStore('gmail-tokens');
    const accessToken = await refreshAccessToken(store, clientId, clientSecret);
    const emails = await fetchEmails(accessToken);

    // Parse emails into offers
    const offers = emails
      .map(parseOffer)
      .filter(o => o.platform !== 'unknown' || o.pay); // Keep if we detected platform or pay

    // Store last sync time
    await store.setJSON('lastSync', { timestamp: Date.now(), count: offers.length });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        success: true,
        offers,
        syncedAt: new Date().toISOString(),
      }),
    };
  } catch (err) {
    const isAuthError = err.message.includes('refresh token') || err.message.includes('Token refresh');
    return {
      statusCode: isAuthError ? 401 : 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        error: err.message,
        needsAuth: isAuthError,
        offers: [],
      }),
    };
  }
}
