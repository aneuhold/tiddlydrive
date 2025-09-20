// Starts OAuth 2.0 Authorization Code Flow with PKCE for Google Drive access.
// Redirects the user to Google's consent screen, requesting access_type=offline to obtain a refresh token.
// Adds a CSRF-resisting `state` parameter and stores PKCE verifier + state in an HttpOnly cookie.

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const crypto = require("crypto");

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function createPkcePair() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(
    crypto.createHash("sha256").update(verifier).digest()
  );
  return { verifier, challenge };
}

/**
 * Netlify Function handler: initiates OAuth flow.
 * - Generates PKCE verifier/challenge and a random `state` for CSRF protection
 * - Stores `{v:<verifier>,s:<state>}` JSON in an HttpOnly cookie `td2_oauth`
 * - Redirects to Google's OAuth endpoint with proper parameters
 */
exports.handler = async (event) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.OAUTH_REDIRECT_URI; // e.g., https://<site>/.netlify/functions/oauth-callback
  // Optional scope override via query param `td_scope` (e.g., drive or drive.file)
  const rawScope = (event?.queryStringParameters?.td_scope || '').trim();
  const scope =
    rawScope === 'drive'
      ? 'https://www.googleapis.com/auth/drive'
      : rawScope === 'drive.file'
      ? 'https://www.googleapis.com/auth/drive.file'
      : process.env.GOOGLE_SCOPE || 'https://www.googleapis.com/auth/drive.file';

  if (!clientId || !redirectUri) {
    return {
      statusCode: 500,
      body: "Server misconfiguration: missing GOOGLE_CLIENT_ID or OAUTH_REDIRECT_URI",
    };
  }

  // Generate PKCE pair and store verifier + state in a short-lived HttpOnly cookie
  const { verifier, challenge } = createPkcePair();
  const state = base64url(crypto.randomBytes(16));
  const cookiePayload = encodeURIComponent(
    JSON.stringify({ v: verifier, s: state })
  );
  // Determine if request is over HTTPS to decide whether to add the Secure attribute (not set on localhost http)
  const xfProto = (
    event?.headers?.["x-forwarded-proto"] ||
    event?.headers?.["X-Forwarded-Proto"] ||
    ""
  )
    .split(",")[0]
    .trim();
  const host = event?.headers?.host || event?.headers?.Host || "";
  const isHttps = xfProto === "https" || host.endsWith(":443");
  const secureAttr = isHttps ? "; Secure" : "";
  // PKCE/state cookie must be sent back on cross-site top-level navigation from Google → use SameSite=Lax
  // Use Path=/ to ensure it’s included regardless of whether callback uses /api/* or /.netlify/functions/*
  const cookie = `td2_oauth=${cookiePayload}; Path=/; HttpOnly${secureAttr}; SameSite=Lax; Max-Age=600`;

  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scope);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent"); // ensure refresh_token issuance on first consent
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);

  return {
    statusCode: 302,
    headers: {
      Location: url.toString(),
      'Set-Cookie': [
        // New cookie for callback to receive
        cookie,
        // Cleanup of any previous cookie set with Path=/api/
        `td2_oauth=; Path=/api/; HttpOnly${secureAttr}; SameSite=Lax; Max-Age=0`
      ]
    },
    body: "",
  };
};
