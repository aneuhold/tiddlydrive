// Returns a fresh access token using the refresh token stored in an encrypted HttpOnly cookie.

import type { Handler } from '@netlify/functions';
import { decrypt } from './crypto-util';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/**
 *
 * @param refreshToken
 * @param clientId
 * @param clientSecret
 */
type TokenResponse = {
  access_token: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
};

/**
 * Mint a new access token using a Google refresh token.
 *
 * @param refreshToken The Google OAuth refresh token
 * @param clientId OAuth client ID
 * @param clientSecret OAuth client secret (if required)
 */
async function mintAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<TokenResponse> {
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
  return resp.json() as Promise<TokenResponse>;
}

/**
 * Netlify Function handler: returns a short-lived access token.
 * - Reads `td2_rt` encrypted cookie, decrypts to get refresh token
 * - Optionally checks `Origin`/`Referer` to be same-origin for CSRF defense-in-depth
 * - Calls Google's token endpoint to mint an access token
 *
 * @param event Netlify handler event
 */
export const handler: Handler = async (event) => {
  try {
    const clientId = process.env['GOOGLE_CLIENT_ID'];
    const clientSecret = process.env['GOOGLE_CLIENT_SECRET'] || '';
    if (!clientId) return { statusCode: 500, body: 'Missing GOOGLE_CLIENT_ID' };

    // Same-origin check (best-effort). In local dev, Origin/Referer may be absent or differ.
    const host = event.headers['host'] || event.headers['Host'] || '';
    const origin = event.headers['origin'] || event.headers['Origin'] || '';
    const referer = event.headers['referer'] || event.headers['Referer'] || '';
    const xf = event.headers['x-forwarded-proto'] || event.headers['X-Forwarded-Proto'] || '';
    const proto = xf || (host.startsWith('localhost') ? 'http' : 'https');
    const expected = host ? `${proto}://${host}` : '';
    if (expected && origin && origin !== expected) {
      return { statusCode: 403, body: 'Invalid origin' };
    }
    if (expected && referer && !referer.startsWith(expected)) {
      return { statusCode: 403, body: 'Invalid referer' };
    }

    const cookie = event.headers['cookie'] || event.headers['Cookie'] || '';
    const rtMatch = /(?:^|;\s*)td2_rt=([^;]+)/.exec(cookie);
    if (!rtMatch) return { statusCode: 401, body: 'No session' };
    const enc = decodeURIComponent(rtMatch[1]);
    const aad = Buffer.from('td2_refresh_v1', 'utf8');
    let refreshToken = '';
    try {
      const buf = decrypt(enc, aad);
      refreshToken = buf.toString('utf8');
    } catch {
      return { statusCode: 401, body: 'Invalid session' };
    }

    const data = await mintAccessToken(refreshToken, clientId, clientSecret);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({
        access_token: data.access_token,
        expires_in: data.expires_in,
        scope: data.scope
      })
    };
  } catch (e) {
    return { statusCode: 500, body: String(e) };
  }
};
