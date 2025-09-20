// Exchanges authorization code for tokens and writes the refresh token into an encrypted HttpOnly cookie.
// Stateless approach: no database/KV/Blobs used. A single symmetric key protects the cookie value.
// Also validates the OAuth `state` against the short-lived cookie to mitigate CSRF.

import type { Handler } from '@netlify/functions';
import { encrypt } from './crypto-util';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/**
 *
 * @param code
 * @param clientId
 * @param clientSecret
 * @param redirectUri
 * @param codeVerifier
 */
async function exchangeCodeForTokens(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  codeVerifier: string
): Promise<any> {
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

export const handler: Handler = async (event) => {
  try {
    const clientId = process.env['GOOGLE_CLIENT_ID'];
    const clientSecret = process.env['GOOGLE_CLIENT_SECRET'] || '';
    const redirectUri = process.env['OAUTH_REDIRECT_URI'];

    const code = event.queryStringParameters?.code || '';
    const state = event.queryStringParameters?.state || '';
    if (!code) {
      return { statusCode: 400, body: 'Missing code' };
    }
    if (!clientId || !redirectUri) {
      return { statusCode: 500, body: 'Server misconfiguration' };
    }

    // Retrieve PKCE verifier and state from cookie
    const cookieHeader = event.headers?.cookie || event.headers?.Cookie || '';
    const m = /(?:^|;\s*)td2_oauth=([^;]+)/.exec(cookieHeader);
    const cookiePayload = m ? decodeURIComponent(m[1]) : '';
    let codeVerifier: string | undefined;
    let stateCookie: string | undefined;
    try {
      const obj = JSON.parse(cookiePayload || '{}') as { v?: string; s?: string };
      codeVerifier = obj.v;
      stateCookie = obj.s;
    } catch {
      /* ignore */
    }
    if (!cookiePayload) {
      return {
        statusCode: 400,
        body: 'Missing td2_oauth cookie (PKCE/state not set or wrong path)'
      };
    }
    if (!codeVerifier) {
      return { statusCode: 400, body: 'Missing PKCE code_verifier in cookie' };
    }
    if (!state) {
      return { statusCode: 400, body: 'Missing state parameter in callback URL' };
    }
    if (state !== stateCookie) {
      return { statusCode: 400, body: 'State mismatch between cookie and callback' };
    }

    const tokenData = await exchangeCodeForTokens(
      code,
      clientId,
      clientSecret,
      redirectUri,
      codeVerifier
    );
    const refreshToken = tokenData.refresh_token as string | undefined;
    if (!refreshToken) {
      return {
        statusCode: 400,
        body: 'No refresh_token received (consent may be required)'
      };
    }

    // Encrypt refresh token into stateless cookie; AAD binds it to purpose and minimal context
    const aad = Buffer.from('td2_refresh_v1', 'utf8');
    const enc = encrypt(Buffer.from(refreshToken, 'utf8'), aad);
    // Determine cookie security flags based on protocol
    const xfProto = (
      event?.headers?.['x-forwarded-proto'] ||
      event?.headers?.['X-Forwarded-Proto'] ||
      ''
    )
      .split(',')[0]
      .trim();
    const host = event?.headers?.host || event?.headers?.Host || '';
    const isHttps = xfProto === 'https' || host.endsWith(':443');
    const secureAttr = isHttps ? '; Secure' : '';
    // 30 days, Lax, scoped to /api/
    const rtCookie = `td2_rt=${enc}; Path=/api/; HttpOnly${secureAttr}; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`;
    // Clear the oauth helper cookie (Path=/ to match where it was set)
    const clearOauthCookie = `td2_oauth=; Path=/; HttpOnly${secureAttr}; SameSite=Lax; Max-Age=0`;

    const html = `<!doctype html><html><body><script>window.close();<\/script>OK</body></html>`;
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      multiValueHeaders: { 'Set-Cookie': [rtCookie, clearOauthCookie] },
      body: html
    };
  } catch (e) {
    return { statusCode: 500, body: String(e) };
  }
};
