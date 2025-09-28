// Returns a fresh access token using the refresh token stored in an encrypted HttpOnly cookie.

import type { Handler } from '@netlify/functions';
import { decrypt } from './crypto-util';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/** Access token response subset we care about */
type TokenResponse = {
  access_token: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
};

/** Shape of Google's error JSON for token endpoint that we need */
interface GoogleErrorPayload {
  /**
   * Possible error messages: https://developers.google.com/identity/protocols/oauth2/web-server#authorization-errors
   */
  error?: string;
  error_description?: string;
}

/** Error thrown when the refresh call fails */
class OAuthRefreshError extends Error {
  constructor(
    /**
     * Possible error messages: https://developers.google.com/identity/protocols/oauth2/web-server#authorization-errors
     */
    message: string,
    public description?: string,
    public rawBody?: string
  ) {
    super(message);
  }
}

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

  // If it's all good, then return early
  if (resp.ok) {
    return resp.json() as Promise<TokenResponse>;
  }

  // Try to parse and return the error details
  const raw = await resp.text().catch(() => '');
  let parsed: GoogleErrorPayload | undefined;
  try {
    parsed = JSON.parse(raw) as GoogleErrorPayload;
  } catch {
    // Ignore malformed JSON
  }
  if (parsed && parsed.error) {
    throw new OAuthRefreshError(parsed.error, parsed.error_description, raw);
  }

  // Default if we couldn't parse it
  throw new OAuthRefreshError(
    'Google threw an error while trying to retrieve the refresh token.',
    undefined,
    raw
  );
}

/**
 * Map an OAuth refresh error to an HTTP response expected by the frontend.
 *
 * @param e Thrown error
 */
function mapRefreshError(e: unknown): { statusCode: number; body: string } {
  // Check if it's not the expected error type
  if (!(e instanceof OAuthRefreshError)) {
    return { statusCode: 500, body: JSON.stringify(e) };
  }

  // It is, so we can access its properties. The error message is what
  // gets returned by google. See the docs:
  // https://developers.google.com/identity/protocols/oauth2/web-server#authorization-errors
  const errorMessage = e.message;
  const rawBody = e.rawBody || e.description;
  switch (errorMessage) {
    case 'invalid_grant':
      return { statusCode: 401, body: rawBody || 'Invalid token, get new session' };
    // Kind of a strange case, the user-agent one.
    case 'disallowed_useragent':
      return { statusCode: 400, body: rawBody || 'Unsupported user agent' };
    case 'invalid_client':
    case 'deleted_client':
    case 'invalid_request':
    case 'redirect_uri_mismatch':
      return { statusCode: 500, body: rawBody || 'OAuth client misconfigured' };
    case 'admin_policy_enforced':
    case 'org_internal':
      return { statusCode: 405, body: rawBody || 'Access restricted by policy' };
    default:
      return { statusCode: 500, body: rawBody || 'Unknown error' };
  }
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
    return mapRefreshError(e);
  }
};
