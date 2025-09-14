// Returns a fresh access token using the stored refresh token.

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

async function getStoredRefreshToken(sessionId) {
  try {
    const { getStore } = require('@netlify/blobs');
    const store = getStore('td2-sessions');
    return await store.get(sessionId);
  } catch (_e) {
    const m = globalThis.__TD2_SESS__;
    return m ? m.get(sessionId) : null;
  }
}

async function mintAccessToken(refreshToken, clientId, clientSecret) {
  const body = new URLSearchParams();
  body.set('grant_type', 'refresh_token');
  body.set('refresh_token', refreshToken);
  body.set('client_id', clientId);
  if (clientSecret) body.set('client_secret', clientSecret);

  const resp = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Refresh failed: ${resp.status} ${text}`);
  }
  return resp.json();
}

exports.handler = async (event) => {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
    if (!clientId) return { statusCode: 500, body: 'Missing GOOGLE_CLIENT_ID' };

    const cookie = event.headers.cookie || '';
    const sidMatch = /(?:^|;\s*)td2_sid=([^;]+)/.exec(cookie);
    if (!sidMatch) return { statusCode: 401, body: 'No session' };
    const sessionId = decodeURIComponent(sidMatch[1]);

    const refreshToken = await getStoredRefreshToken(sessionId);
    if (!refreshToken) return { statusCode: 401, body: 'No refresh token' };

    const data = await mintAccessToken(refreshToken, clientId, clientSecret);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ access_token: data.access_token, expires_in: data.expires_in })
    };
  } catch (e) {
    return { statusCode: 500, body: String(e) };
  }
};
