// Exchanges authorization code for tokens and writes the refresh token into an encrypted HttpOnly cookie.
// Stateless approach: no database/KV/Blobs used. A single symmetric key protects the cookie value.
// Also validates the OAuth `state` against the short-lived cookie to mitigate CSRF.

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const { encrypt } = require('./crypto-util');
const crypto = require('crypto');

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

exports.handler = async (event) => {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
    const redirectUri = process.env.OAUTH_REDIRECT_URI;

    const code = event.queryStringParameters.code;
    const state = event.queryStringParameters.state;
    if (!code) {
      return { statusCode: 400, body: 'Missing code' };
    }
    if (!clientId || !redirectUri) {
      return { statusCode: 500, body: 'Server misconfiguration' };
    }

    // Retrieve PKCE verifier and state from cookie
    const cookieHeader = event.headers.cookie || '';
    const m = /(?:^|;\s*)td2_oauth=([^;]+)/.exec(cookieHeader);
    const cookiePayload = m ? decodeURIComponent(m[1]) : '';
    let codeVerifier;
    let stateCookie;
    try {
      const obj = JSON.parse(cookiePayload || '{}');
      codeVerifier = obj.v;
      stateCookie = obj.s;
    } catch {
      /* ignore */
    }
    if (!codeVerifier || !state || state !== stateCookie) {
      return { statusCode: 400, body: 'Invalid or missing PKCE/state' };
    }

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

    // Encrypt refresh token into stateless cookie; AAD binds it to purpose and minimal context
    const aad = Buffer.from('td2_refresh_v1', 'utf8');
    const enc = encrypt(Buffer.from(refreshToken, 'utf8'), aad);
    // 30 days, Strict, scoped to /api/
    const rtCookie = `td2_rt=${enc}; Path=/api/; Secure; HttpOnly; SameSite=Strict; Max-Age=${60 * 60 * 24 * 30}`;
    // Clear the oauth helper cookie
    const clearOauthCookie = `td2_oauth=; Path=/api/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`;

    const html = `<!doctype html><html><body><script>window.close();</script>OK</body></html>`;
    return {
      statusCode: 200,
      headers: { 'Set-Cookie': [rtCookie, clearOauthCookie], 'Content-Type': 'text/html' },
      body: html
    };
  } catch (e) {
    return { statusCode: 500, body: String(e) };
  }
};
