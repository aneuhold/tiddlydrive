/*
 * Google Drive API Scope Strategy:
 * - drive.file: Core functionality - access only files user explicitly opens
 * - drive.install: Required for "Open With" option in Google Drive context menu
 * - userinfo.email & userinfo.profile: Required for Google Workspace Marketplace publishing
 *   (these are not used by the app but required by Google's marketplace policies)
 *
 * In development, only drive.file is used by default. The broader 'drive' scope can be
 * temporarily enabled via URL parameter for testing purposes.
 */

/** Scope URLs used by the application */
const DRIVE_SCOPE_URL = 'https://www.googleapis.com/auth/drive';
const DRIVE_FILE_SCOPE_URL = 'https://www.googleapis.com/auth/drive.file';

/** Default scope requested by the application */
const DEFAULT_SCOPE = DRIVE_FILE_SCOPE_URL;

/** Google API Web key (safe to expose on the client for discovery) */
const WEB_API_KEY = 'AIzaSyBa2pekTr_FkdjYQlZDjHGuuxwNO6EY9Pg';

/** URL query parameter controlling requested scope override */
const SCOPE_QUERY_PARAM = 'td_scope';

/** Poll interval while waiting for gapi to appear */
const GAPI_POLL_INTERVAL_MS = 50;

/** Early-expire skew to account for clock drift (in seconds) */
const TOKEN_SKEW_SEC = 60;

// Discovery doc URL for APIs used by the app
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

const TOKEN_STORAGE_KEY = 'td2_gapi_token';

/** Persisted token entry in localStorage */
type StoredToken = {
  access_token: string;
  /** epoch millis */
  expire_at: number;
  scope: string;
};

/** Response payload from the backend token endpoint */
type AccessTokenResponse = {
  access_token: string;
  expires_in: number;
  scope?: string;
};

/**
 * Error codes thrown by the auth helpers.
 */
export enum AuthErrorCode {
  NoSession = 'no_session',
  TokenFailed = 'token_failed',
  ScopeNotGranted = 'scope_not_granted',
  GapiUnavailable = 'gapi_unavailable',
  SsrUnavailable = 'ssr_unavailable'
}

/**
 * Custom error type for authentication-related failures.
 */
export class AuthError extends Error {
  code: AuthErrorCode;
  status?: number;

  /**
   * @param code A machine-readable error code
   * @param message A human-readable message; if omitted, a default is derived from the code
   * @param status Optional HTTP status associated with the error
   */
  constructor(code: AuthErrorCode, message?: string, status?: number) {
    super(message ?? code);
    this.code = code;
    this.status = status;
  }
}

/**
 * Returns true if running in a browser (not SSR).
 *
 * @returns Whether code is executing on the client
 */
const isClient = (): boolean => typeof window !== 'undefined' && typeof document !== 'undefined';

const readStoredToken = (scope: string): StoredToken | null => {
  try {
    if (!isClient()) return null;
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as StoredToken | null;

    if (
      !data ||
      typeof data.access_token !== 'string' ||
      data.scope !== scope ||
      Date.now() >= data.expire_at
    ) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
};

const writeStoredToken = (token: string, expiresInSec: number, scope: string): void => {
  try {
    if (!isClient()) return;
    const expire_at = Date.now() + Math.max(0, (expiresInSec - TOKEN_SKEW_SEC) * 1000);
    const payload: StoredToken = { access_token: token, expire_at, scope };
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage errors (private mode, etc.)
  }
};

/**
 * Waits for Google API client to be available on window.
 *
 * @returns Promise that resolves when gapi is present on window
 */
const waitForGapi = async (): Promise<void> =>
  new Promise((resolve, reject) => {
    if (!isClient()) {
      reject(new AuthError(AuthErrorCode.SsrUnavailable));
      return;
    }
    if (window.gapi) {
      resolve();
      return;
    }
    const iv = setInterval(() => {
      if (window.gapi) {
        clearInterval(iv);
        resolve();
      }
    }, GAPI_POLL_INTERVAL_MS);
  });

/**
 * Resolve effective scope from URL param. Only 'drive' or 'drive.file' are allowed as an override.
 * Anything else falls back to default 'drive.file'.
 *
 * @returns Full scope URL to request
 */
const determineScope = (): string => {
  try {
    if (!isClient()) return DEFAULT_SCOPE;
    const params = new URLSearchParams(location.search);
    const raw = params.get(SCOPE_QUERY_PARAM)?.trim();
    if (raw === 'drive') return DRIVE_SCOPE_URL;
    if (raw === 'drive.file') return DRIVE_FILE_SCOPE_URL;
  } catch {
    /* ignore */
  }
  return DEFAULT_SCOPE;
};

/**
 * Initializes the Google API client.
 */
const initializeGapiClient = async (): Promise<void> => {
  // Ensure the base gapi object is present
  await waitForGapi();
  const gapiObj = window.gapi;
  if (!gapiObj) {
    throw new AuthError(AuthErrorCode.GapiUnavailable);
  }

  // Ensure the 'client' module is loaded
  await new Promise<void>((resolve) => {
    gapiObj.load('client', () => {
      resolve();
    });
  });

  await gapiObj.client.init({
    apiKey: WEB_API_KEY,
    discoveryDocs: [DISCOVERY_DOC]
  });
};

/**
 * Initializes Google API client and discovery docs. Must be called on the client.
 */
export const initAuth = async (): Promise<void> => {
  if (!isClient()) throw new AuthError(AuthErrorCode.SsrUnavailable);
  await initializeGapiClient();
};

/**
 * Sets the current access token into the gapi client.
 *
 * @param token OAuth access token string
 */
const setGapiAccessToken = (token: string): void => {
  const gapiClient = window.gapi?.client;
  if (!gapiClient) throw new AuthError(AuthErrorCode.GapiUnavailable);
  gapiClient.setToken({ access_token: token });
};

/**
 * Builds the OAuth start URL, optionally honoring a scope override and always including
 * a `td_return` parameter so that the backend can route (or instruct the opener to route)
 * back to the current application page after the OAuth popup / redirect completes.
 *
 * Security: only a relative path (starting with '/') is ever sent. We intentionally do not
 * include the origin to avoid any possibility of an open redirect; the server validates it.
 *
 * @param override Optional override value for the `td_scope` query parameter
 * @returns The OAuth start URL (relative)
 */
const buildOauthStartUrl = (override: string | null | undefined): string => {
  const params = new URLSearchParams();
  if (override) params.set(SCOPE_QUERY_PARAM, override);
  try {
    // Preserve the current in-app location (path + query + hash) so the user returns
    // directly to the opened file / state after first-time consent.
    const ret = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (ret.startsWith('/')) params.set('td_return', ret);
  } catch {
    /* ignore */
  }
  const qs = params.toString();
  return qs ? `/api/oauth/start?${qs}` : '/api/oauth/start';
};

/**
 * Derives a scope override short value ("drive" or "drive.file") from a full desired scope URL.
 * Returns null if the scope is neither of those two.
 *
 * @param desiredScope Full scope URL the app wants
 * @returns The short override value or null if not applicable
 */
const scopeOverrideFromDesired = (desiredScope: string): string | null => {
  if (desiredScope.endsWith('/drive')) return 'drive';
  if (desiredScope.endsWith('/drive.file')) return 'drive.file';
  return null;
};

/**
 * Retrieves a valid access token via the backend.
 * Strategy:
 * - If a cached token for the effective scope is still valid, reuse it.
 * - Otherwise, call `/api/token` (credentials: include). If 401, open `/api/oauth/start` in a popup
 *   and, once closed, retry `/api/token`.
 * - On success, write token to gapi.client and local cache.
 *
 * Normal path reuses cached token when valid; no consent is forced.
 *
 * @returns Promise that resolves to an OAuth access token string
 */
export const getAccessToken = async (): Promise<string> => {
  if (!isClient()) throw new AuthError(AuthErrorCode.SsrUnavailable);
  if (!window.gapi?.client) await initAuth();

  const desiredScope = determineScope();

  // 1) Use cached token if valid
  const stored = readStoredToken(desiredScope);
  if (stored) {
    setGapiAccessToken(stored.access_token);
    return stored.access_token;
  }

  // 2) Obtain an authorized token that satisfies the desired scope (consents as needed)
  const finalToken = await obtainAuthorizedToken(desiredScope);

  // 3) Apply and persist token
  applyAndPersistToken(finalToken, desiredScope);
  return finalToken.access_token;
};

/**
 * Forces a consent flow and mints a fresh token, replacing any cached token.
 *
 * @returns Promise that resolves to a new OAuth access token string
 */
export const reauthenticateWithConsent = async (): Promise<string> => {
  if (!isClient()) throw new AuthError(AuthErrorCode.SsrUnavailable);
  if (!window.gapi?.client) await initAuth();
  const desiredScope = determineScope();
  clearStoredToken();
  const token = await obtainAuthorizedToken(desiredScope, { forceConsentFirst: true });
  applyAndPersistToken(token, desiredScope);
  return token.access_token;
};

/**
 * Clears any stored token cache in localStorage.
 */
const clearStoredToken = (): void => {
  try {
    if (!isClient()) return;
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
};

/**
 * Reads the current page's scope override parameter if present.
 *
 * @returns The `td_scope` override value (e.g., "drive" or "drive.file") or null
 */
const getPageScopeOverrideParam = (): string | null =>
  isClient() ? new URLSearchParams(location.search).get(SCOPE_QUERY_PARAM) : null;

/**
 * Opens consent flow (optionally with a scope override) and then calls the token mint function.
 *
 * @param override Optional override value for the `td_scope` parameter
 * @returns Token response after consent
 */
const consentAndMint = async (override: string | null): Promise<AccessTokenResponse> => {
  const startUrl = buildOauthStartUrl(override ?? undefined);
  await openAuthPopupAndWait(startUrl);
  return mintToken();
};

/**
 * Ensures a token exists and satisfies the desired scope. If not, triggers consent and retries.
 * Handles both "no session" and "insufficient scope" cases.
 *
 * Behavior preservation:
 * - On insufficient scope: try page override OR fallback to derived override from desired scope
 * - On no session: only try page override (no fallback)
 *
 * @param desiredScope Full scope URL the app wants
 * @param opts Optional flags to control the authorization flow
 * @param opts.forceConsentFirst When true, triggers consent before the first mint attempt
 * @returns Token response satisfying the desired scope
 */
const obtainAuthorizedToken = async (
  desiredScope: string,
  opts?: { forceConsentFirst?: boolean }
): Promise<AccessTokenResponse> => {
  try {
    // Optionally perform consent before first mint attempt
    if (opts?.forceConsentFirst) {
      const override = getPageScopeOverrideParam() || scopeOverrideFromDesired(desiredScope);
      const firstAfterConsent = await consentAndMint(override);
      if (isScopeSatisfied(firstAfterConsent.scope, desiredScope)) return firstAfterConsent;
      // If consented but still insufficient, attempt one more consent with override (same behavior below)
    }

    const first = await mintToken();
    if (isScopeSatisfied(first.scope, desiredScope)) return first;

    // Insufficient scope: try consent with override from page or derived from desired scope
    const override = getPageScopeOverrideParam() || scopeOverrideFromDesired(desiredScope);
    const second = await consentAndMint(override);
    if (!isScopeSatisfied(second.scope, desiredScope)) {
      throw new AuthError(AuthErrorCode.ScopeNotGranted);
    }
    return second;
  } catch (e) {
    if (e instanceof AuthError && e.code === AuthErrorCode.NoSession) {
      // No session: consent using only the page override (no fallback)
      const override = getPageScopeOverrideParam();
      const afterConsent = await consentAndMint(override);
      if (!isScopeSatisfied(afterConsent.scope, desiredScope)) {
        throw new AuthError(AuthErrorCode.ScopeNotGranted);
      }
      return afterConsent;
    }
    throw e;
  }
};

/**
 * Applies the token to gapi and persists it in localStorage.
 *
 * @param token Access token response from backend
 * @param desiredScope Desired scope to associate with the persisted token
 */
const applyAndPersistToken = (token: AccessTokenResponse, desiredScope: string): void => {
  setGapiAccessToken(token.access_token);
  writeStoredToken(token.access_token, token.expires_in, desiredScope);
};

/**
 * Calls the backend to mint/return the current access token.
 *
 * @returns The access token response from the backend
 */
const mintToken = async (): Promise<AccessTokenResponse> => {
  const resp = await fetch('/api/token', { credentials: 'include', method: 'GET' });
  if (resp.status === 401) throw new AuthError(AuthErrorCode.NoSession, undefined, 401);
  if (!resp.ok) {
    throw new AuthError(AuthErrorCode.TokenFailed, undefined, resp.status);
  }
  return (await resp.json()) as AccessTokenResponse;
};

/**
 * Returns true if the granted token scopes satisfy the desired scope.
 * Accepts a string (space-delimited) or undefined for grantedScopes.
 * Rules:
 * - desired drive.file is satisfied by either drive.file or drive
 * - desired drive requires drive
 *
 * @param grantedScopes Space-delimited scopes returned by the token endpoint
 * @param desiredScope Full scope URL the app wants (e.g., https://www.googleapis.com/auth/drive)
 * @returns True if the granted scopes cover the desired scope
 */
function isScopeSatisfied(grantedScopes: string | undefined, desiredScope: string): boolean {
  if (!grantedScopes) return false;
  const list = grantedScopes.split(/\s+/).filter(Boolean);
  if (desiredScope === DRIVE_SCOPE_URL) return list.includes(DRIVE_SCOPE_URL);
  if (desiredScope === DRIVE_FILE_SCOPE_URL)
    return list.includes(DRIVE_SCOPE_URL) || list.includes(DRIVE_FILE_SCOPE_URL);
  // Fallback: exact match
  return list.includes(desiredScope);
}

/** Message type posted from the OAuth callback page to the opener. */
const AUTH_COMPLETE_MESSAGE = 'td2_auth_complete';

/**
 * Compute a centered popup feature string for a given logical size.
 *
 * @param targetWidth Desired popup width in pixels
 * @param targetHeight Desired popup height in pixels
 * @returns The window.open feature string
 */
const computeCenteredPopupFeatures = (targetWidth: number, targetHeight: number): string => {
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || screen.width;
  const viewportHeight =
    window.innerHeight || document.documentElement.clientHeight || screen.height;
  const left = viewportWidth / 2 - targetWidth / 2 + (window.screenX || 0);
  const top = viewportHeight / 2 - targetHeight / 2 + (window.screenY || 0);
  return `scrollbars=yes,width=${targetWidth},height=${targetHeight},top=${top},left=${left}`;
};

/**
 * Open an auth popup (or fall back to navigation if blocked).
 *
 * @param url URL to open
 * @returns The popup window instance or null if blocked (navigation fallback already triggered)
 */
const openAuthPopup = (url: string): Window | null => {
  const features = computeCenteredPopupFeatures(500, 600);
  const popup = window.open(url, 'td2_auth', features);
  if (!popup) {
    // Popup blocked: use same-tab navigation as a fallback path.
    window.location.href = url;
    return null;
  }
  return popup;
};

/**
 * Wait until either the popup posts the completion message or it closes.
 *
 * @param popup Popup window object (may be null if blocked)
 * @returns Promise that resolves when auth flow finishes or fallback navigation occurred
 */
const waitForAuthPopupCompletion = (popup: Window | null): Promise<void> =>
  new Promise((resolve) => {
    // If there is no popup (blocked), we've already navigated away and can resolve immediately.
    if (!popup) {
      resolve();
      return;
    }

    let settled = false;
    const complete = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      clearInterval(closePollInterval);
      resolve();
    };

    const onMessage = (ev: MessageEvent) => {
      if (ev.data && ev.data.type === AUTH_COMPLETE_MESSAGE) complete();
    };

    window.addEventListener('message', onMessage);

    // Periodically poll for the user manually closing the popup.
    const closePollInterval = setInterval(() => {
      if (popup.closed) complete();
    }, 300);
  });

/**
 * High-level helper: open the OAuth popup (centered) and wait until it either reports
 * completion via postMessage or is closed by the user. Falls back to same-tab navigation when
 * popups are blocked.
 *
 * @param url Absolute or relative URL to initiate the OAuth flow
 */
const openAuthPopupAndWait = async (url: string): Promise<void> => {
  const popup = openAuthPopup(url);
  await waitForAuthPopupCompletion(popup);
};
