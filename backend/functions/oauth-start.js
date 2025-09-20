// Starts OAuth 2.0 Authorization Code Flow with PKCE for Google Drive access.
// Redirects the user to Google's consent screen, requesting access_type=offline to obtain a refresh token.
// Adds a CSRF-resisting `state` parameter and stores PKCE verifier + state in an HttpOnly cookie.

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const crypto = require('crypto');

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function createPkcePair() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

/**
 * Netlify Function handler: initiates OAuth flow.
 * - Generates PKCE verifier/challenge and a random `state` for CSRF protection
 * - Stores `{v:<verifier>,s:<state>}` JSON in an HttpOnly cookie `td2_oauth`
 * - Redirects to Google's OAuth endpoint with proper parameters
 */
exports.handler = async () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.OAUTH_REDIRECT_URI; // e.g., https://<site>/.netlify/functions/oauth-callback
  const scope = process.env.GOOGLE_SCOPE || 'https://www.googleapis.com/auth/drive.file';

  if (!clientId || !redirectUri) {
    return {
      statusCode: 500,
      body: 'Server misconfiguration: missing GOOGLE_CLIENT_ID or OAUTH_REDIRECT_URI'
    };
  }

  // Generate PKCE pair and store verifier + state in a short-lived HttpOnly cookie
  const { verifier, challenge } = createPkcePair();
  const state = base64url(crypto.randomBytes(16));
  const cookiePayload = encodeURIComponent(JSON.stringify({ v: verifier, s: state }));
  // Scope cookies to /api/ for least privilege, Strict to counter CSRF
  const cookie = `td2_oauth=${cookiePayload}; Path=/api/; Secure; HttpOnly; SameSite=Strict; Max-Age=600`;

  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', scope);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent'); // ensure refresh_token issuance on first consent
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);

  return {
    statusCode: 302,
    headers: { Location: url.toString(), 'Set-Cookie': cookie },
    body: ''
  };
};
