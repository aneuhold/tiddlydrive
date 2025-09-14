// Exchanges authorization code for tokens and stores refresh token in Netlify Blobs.
// Sets a session cookie with a session id, then closes the popup.

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

async function exchangeCodeForTokens(code, clientId, clientSecret, redirectUri, codeVerifier) {
  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('code', code);
  body.set('client_id', clientId);
  if (clientSecret) body.set('client_secret', clientSecret);
  body.set('redirect_uri', redirectUri);
  if (codeVerifier) body.set('code_verifier', codeVerifier);

  const resp = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Token exchange failed: ${resp.status} ${text}`);
  }
  return resp.json();
}

async function storeRefreshToken(sessionId, refreshToken) {
  try {
    const { getStore } = require('@netlify/blobs');
    const store = getStore('td2-sessions');
    await store.set(sessionId, refreshToken);
    return;
  } catch (_e) {
    // Fallback: in-memory (for local dev only)
    globalThis.__TD2_SESS__ = globalThis.__TD2_SESS__ || new Map();
    globalThis.__TD2_SESS__.set(sessionId, refreshToken);
  }
}

exports.handler = async (event) => {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
    const redirectUri = process.env.OAUTH_REDIRECT_URI;

    const code = event.queryStringParameters.code;
    if (!code) {
      return { statusCode: 400, body: 'Missing code' };
    }
    if (!clientId || !redirectUri) {
      return { statusCode: 500, body: 'Server misconfiguration' };
    }

    // Retrieve PKCE verifier from cookie
  const cookieHeader = event.headers.cookie || '';
  const m = /(?:^|;\s*)td2_pkce=([^;]+)/.exec(cookieHeader);
    const codeVerifier = m ? decodeURIComponent(m[1]) : undefined;

    const tokenData = await exchangeCodeForTokens(
      code,
      clientId,
      clientSecret,
      redirectUri,
      codeVerifier
    );
    const refreshToken = tokenData.refresh_token;
    if (!refreshToken) {
      return { statusCode: 400, body: 'No refresh_token received (consent may be required)' };
    }

    // Create a simple session id and store the refresh token
    const sessionId = crypto.randomUUID();
    await storeRefreshToken(sessionId, refreshToken);

  const sessionCookie = `td2_sid=${sessionId}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`; // 30 days

    const html = `<!doctype html><html><body><script>window.close();</script>OK</body></html>`;
    return {
      statusCode: 200,
  headers: { 'Set-Cookie': sessionCookie, 'Content-Type': 'text/html' },
      body: html
    };
  } catch (e) {
    return { statusCode: 500, body: String(e) };
  }
};
