// Starts OAuth 2.0 Authorization Code Flow with PKCE for Google Drive access.
// Redirects the user to Google's consent screen, requesting access_type=offline to obtain a refresh token.
// Adds a CSRF-resisting `state` parameter and stores PKCE verifier + state in an HttpOnly cookie.

import type { Handler } from '@netlify/functions';
import { createHash, randomBytes } from 'node:crypto';
import { encodeTempCookie } from './oauth-shared';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const CLIENT_ID_ENV = 'GOOGLE_CLIENT_ID';
const REDIRECT_URI_ENV = 'OAUTH_REDIRECT_URI';

/**
 * Encode input as base64url without padding.
 *
 * @param input A buffer to encode
 */
function base64url(input: Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Create a PKCE verifier/challenge pair.
 */
function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

/**
 * Netlify Function handler: initiates OAuth flow.
 * - Generates PKCE verifier/challenge and a random `state` for CSRF protection
 * - Stores `{v:<verifier>,s:<state>}` JSON in an HttpOnly cookie `td2_oauth`
 * - Redirects to Google's OAuth endpoint with proper parameters
 *
 * @param event Netlify handler event
 */
export const handler: Handler = (event) => {
  const clientId = process.env[CLIENT_ID_ENV];
  const redirectUri = process.env[REDIRECT_URI_ENV];

  // Optional scope override via query param `td_scope` (e.g., drive or drive.file)
  const rawScope = (event.queryStringParameters?.['td_scope'] || '').trim();
  let scope: string;
  switch (rawScope) {
    case 'drive':
      scope = 'https://www.googleapis.com/auth/drive';
      break;
    case 'drive.file':
    default:
      scope = 'https://www.googleapis.com/auth/drive.file';
  }

  if (!clientId || !redirectUri) {
    return Promise.resolve({
      statusCode: 500,
      body: 'Server misconfiguration: missing GOOGLE_CLIENT_ID or OAUTH_REDIRECT_URI'
    });
  }

  // Generate PKCE pair and store verifier + state in a short-lived HttpOnly cookie
  const { verifier: pkceVerifier, challenge: pkceChallenge } = createPkcePair();
  const oauthState = base64url(randomBytes(16));

  // Optional return path (internal only). Trust only relative paths starting with '/'.
  const rawReturnPath = event.queryStringParameters?.['td_return'];
  const returnPath =
    rawReturnPath && rawReturnPath.startsWith('/')
      ? rawReturnPath.slice(0, 2000) // clamp to prevent abuse
      : undefined;
  const cookiePayload = encodeTempCookie(pkceVerifier, oauthState, returnPath);

  // Determine if request is over HTTPS to decide whether to add the Secure attribute (not set on localhost http)
  const forwardedProto = (
    event.headers['x-forwarded-proto'] ||
    event.headers['X-Forwarded-Proto'] ||
    ''
  )
    .split(',')[0]
    .trim();
  const host = event.headers['host'] || event.headers['Host'] || '';
  const isHttps = forwardedProto === 'https' || host.endsWith(':443');
  const secureAttr = isHttps ? '; Secure' : '';
  // PKCE/state cookie must be sent back on cross-site top-level navigation from Google → use SameSite=Lax
  // Use Path=/ to ensure it’s included regardless of whether callback uses /api/* or /.netlify/functions/*
  const cookie = `td2_oauth=${cookiePayload}; Path=/; HttpOnly${secureAttr}; SameSite=Lax; Max-Age=600`;

  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', scope);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent'); // ensure refresh_token issuance on first consent
  url.searchParams.set('code_challenge', pkceChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', oauthState);

  return Promise.resolve({
    statusCode: 302,
    headers: {
      Location: url.toString()
    },
    multiValueHeaders: {
      'Set-Cookie': [
        // New cookie for callback to receive
        cookie,
        // Cleanup of any previous cookie set with Path=/api/
        `td2_oauth=; Path=/api/; HttpOnly${secureAttr}; SameSite=Lax; Max-Age=0`
      ]
    },
    body: ''
  });
};
