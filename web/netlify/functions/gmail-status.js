// Gmail connection status — checks if Gmail is authorized
import { getStore } from '@netlify/blobs';

export async function handler(event) {
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
    const tokens = await store.get('tokens', { type: 'json' });
    const lastSync = await store.get('lastSync', { type: 'json' });

    const connected = !!(tokens?.refresh_token);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        connected,
        lastSync: lastSync?.timestamp ? new Date(lastSync.timestamp).toISOString() : null,
        lastSyncCount: lastSync?.count || 0,
      }),
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ connected: false, lastSync: null }),
    };
  }
}
