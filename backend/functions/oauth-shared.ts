// Shared types and helpers for the temporary OAuth cookie used between /oauth/start and /oauth/callback.
// This cookie stores the PKCE verifier, CSRF state token, and an optional return path.

/**
 * Payload stored (JSON stringified) inside the temporary `td2_oauth` cookie.
 * We keep legacy short keys for backward compatibility while transitioning to clearer names.
 */
export type OAuthTempCookiePayload = {
  /** PKCE code_verifier */
  verifier?: string;
  /** CSRF protection random state */
  state?: string;
  /** Optional relative return path (leading '/') */
  returnPath?: string;
  /** Legacy short key for verifier */
  v?: string;
  /** Legacy short key for state */
  s?: string;
  /** Legacy short key for return path */
  r?: string;
};

/**
 * Builds the cookie payload string (URL encoded) with descriptive keys.
 *
 * @param verifier PKCE verifier
 * @param state CSRF state value
 * @param returnPath Optional return path (must start with '/')
 */
export function encodeTempCookie(
  verifier: string,
  state: string,
  returnPath: string | undefined
): string {
  const payload: OAuthTempCookiePayload = { verifier, state };
  if (returnPath && returnPath.startsWith('/')) payload.returnPath = returnPath;
  return encodeURIComponent(JSON.stringify(payload));
}

/**
 * Decodes and parses the temporary OAuth cookie payload.
 *
 * @param raw Raw (URL decoded) JSON string
 */
export function parseTempCookie(raw: string): OAuthTempCookiePayload | null {
  try {
    if (!raw) return null;
    return JSON.parse(raw) as OAuthTempCookiePayload;
  } catch {
    return null;
  }
}
