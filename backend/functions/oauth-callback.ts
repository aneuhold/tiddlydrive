// Exchanges authorization code for tokens and writes the refresh token into an encrypted HttpOnly cookie.
// Stateless approach: no database/KV/Blobs used. A single symmetric key protects the cookie value.
// Also validates the OAuth `state` against the short-lived cookie to mitigate CSRF.

import type { Handler } from '@netlify/functions';
import { encrypt } from './crypto-util';
import { parseTempCookie } from './oauth-shared';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

/**
 * Exchange an OAuth authorization code for tokens at Google's token endpoint.
 *
 * @param code The authorization code received from Google
 * @param clientId OAuth client ID
 * @param clientSecret OAuth client secret (if required)
 * @param redirectUri Redirect URI registered in the Google Console
 * @param codeVerifier PKCE code_verifier paired with the code_challenge
 */
async function exchangeCodeForTokens(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  codeVerifier: string
): Promise<TokenResponse> {
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
  return resp.json() as Promise<TokenResponse>;
}

export const handler: Handler = async (event) => {
  try {
    const clientId = process.env['GOOGLE_CLIENT_ID'];
    const clientSecret = process.env['GOOGLE_CLIENT_SECRET'] || '';
    const redirectUri = process.env['OAUTH_REDIRECT_URI'];

    const code = event.queryStringParameters?.['code'] || '';
    const state = event.queryStringParameters?.['state'] || '';
    if (!code) {
      return { statusCode: 400, body: 'Missing code' };
    }
    if (!clientId || !redirectUri) {
      return { statusCode: 500, body: 'Server misconfiguration' };
    }

    // Retrieve PKCE verifier and state from cookie
    const cookieHeader = event.headers['cookie'] || event.headers['Cookie'] || '';
    const m = /(?:^|;\s*)td2_oauth=([^;]+)/.exec(cookieHeader);
    const cookiePayload = m ? decodeURIComponent(m[1]) : '';
    let pkceVerifier: string | undefined;
    let storedState: string | undefined;
    let storedReturnPath: string | undefined;
    const parsed = parseTempCookie(cookiePayload);
    if (parsed) {
      // Prefer descriptive keys, fall back to legacy short keys if present
      pkceVerifier = parsed.verifier || parsed.v;
      storedState = parsed.state || parsed.s;
      storedReturnPath = parsed.returnPath || parsed.r;
    }
    if (!cookiePayload) {
      return {
        statusCode: 400,
        body: 'Missing td2_oauth cookie (PKCE/state not set or wrong path)'
      };
    }
    if (!pkceVerifier) {
      return { statusCode: 400, body: 'Missing PKCE code_verifier in cookie' };
    }
    if (!state) {
      return { statusCode: 400, body: 'Missing state parameter in callback URL' };
    }
    if (state !== storedState) {
      return { statusCode: 400, body: 'State mismatch between cookie and callback' };
    }

    const tokenData = await exchangeCodeForTokens(
      code,
      clientId,
      clientSecret,
      redirectUri,
      pkceVerifier
    );
    const refreshToken = tokenData.refresh_token;
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
    const xfProto = (event.headers['x-forwarded-proto'] || event.headers['X-Forwarded-Proto'] || '')
      .split(',')[0]
      .trim();
    const host = event.headers['host'] || event.headers['Host'] || '';
    const isHttps = xfProto === 'https' || host.endsWith(':443');
    const secureAttr = isHttps ? '; Secure' : '';
    // 30 days, Lax, scoped to /api/
    const rtCookie = `td2_rt=${enc}; Path=/api/; HttpOnly${secureAttr}; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`;
    // Clear the oauth helper cookie (Path=/ to match where it was set)
    const clearOauthCookie = `td2_oauth=; Path=/; HttpOnly${secureAttr}; SameSite=Lax; Max-Age=0`;

    // Decide how to finish the flow:
    // 1. If storedReturnPath was provided, then use that as the redirect target.
    // 2. Close the window
    const html = `<!doctype html><html><body><script>
      ${
        storedReturnPath?.startsWith('/')
          ? `window.location.replace(${sanitizeReturnPath(storedReturnPath)});`
          : `window.close();`
      }
    </script>OK</body></html>`;

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

/**
 * Accept only a clean, same-site absolute path (leading slash), optionally
 * with query + fragment. Reject anything else (absolute URLs, protocol-relative,
 * control chars, suspicious encodings). Returns null if unsafe.
 *
 * @param p Raw candidate return path (likely from cookie)
 */
function sanitizeReturnPath(p: unknown): string | null {
  if (typeof p !== 'string') return null;

  // Hard size limit
  if (p.length === 0 || p.length > 512) return null;

  // Reject absolute URLs or protocol-relative or scheme-like prefixes
  // e.g. "https://", "javascript:", "//evil.com"
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(p) || p.startsWith('//')) return null;

  // Must start with a single slash (avoid "./", "../", etc.)
  if (!p.startsWith('/')) return null;

  // Fast‑fail on raw control chars
  if (/[\0\r\n]/.test(p)) return null;

  // Decode once to inspect encoded payload (may throw)
  let decoded: string;
  try {
    decoded = decodeURIComponent(p);
  } catch {
    return null;
  }

  // Control chars after decoding?
  if (/[\0\r\n]/.test(decoded)) return null;

  // Allow only a conservative set of URL path/query/fragment safe chars.
  // (RFC 3986 unreserved + a subset of reserved often seen in queries)
  // Adjust if you need broader support.
  if (
    !/^\/[A-Za-z0-9\-._~!$&'()*+,;=:@/%]*([?][A-Za-z0-9\-._~!$&'()*+,;=:@/%]*?)?(#[A-Za-z0-9\-._~!$&'()*+,;=:@/%]*)?$/.test(
      decoded
    )
  ) {
    return null;
  }

  // Optional: enforce that it resolves under allowed top-level segments:
  // if (!/^\/(?:$|app\/|info\/|settings(?:\/|$)|wiki\/)/.test(decoded)) return null;

  // Normalize double slashes (optional):
  // decoded = decoded.replace(/\/{2,}/g, '/');

  return decoded;
}
