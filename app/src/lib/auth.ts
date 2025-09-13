import type { GoogleOAuth2TokenResponse, GoogleTokenClient } from './types.js';

const DEFAULT_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const CLIENT_ID = '477983451498-28pnsm6sgqfm5l2gk0pris227couk477.apps.googleusercontent.com';
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes in milliseconds
const TOKEN_EXPIRY_GRACE_PERIOD_SECONDS = 300; // 5 minutes in seconds

let tokenClient: GoogleTokenClient | null = null;
let accessToken: string | null = null;
let tokenExpiry = 0;
let requesting = false;
const pending: Array<(t: string) => void> = [];
const STORAGE_KEY = 'td2:oauth';
const SCOPE_QUERY_PARAM = 'td_scope';

// Track the scope used for the current tokenClient init
let currentScope: string | null = null;

type CachedToken = {
  accessToken: string;
  expiry: number;
};

/** Load a cached token from localStorage into memory if valid. */
const loadCachedToken = (): void => {
  if (accessToken) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<CachedToken>;
    if (
      typeof parsed.accessToken === 'string' &&
      typeof parsed.expiry === 'number' &&
      Date.now() < parsed.expiry
    ) {
      accessToken = parsed.accessToken;
      tokenExpiry = parsed.expiry;
    }
  } catch {
    /* ignore */
  }
};

/** Persist the current token to localStorage for reuse across reloads. */
const persistToken = (): void => {
  try {
    if (accessToken && tokenExpiry > Date.now()) {
      const payload: CachedToken = { accessToken, expiry: tokenExpiry };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }
  } catch {
    /* ignore */
  }
};

/**
 * Returns true when a valid, non-expired OAuth token is already available (cached or in-memory).
 * This will try to hydrate from localStorage on first use.
 * Note: We use a generous expiry check to avoid frequent re-auth like legacy version.
 *
 * @returns boolean indicating whether a valid token exists
 */
export const hasValidToken = (): boolean => {
  loadCachedToken();
  // Use a much more generous expiry buffer vs the aggressive 30 second buffer
  // This matches the legacy behavior where tokens were rarely invalidated
  return !!accessToken && Date.now() < tokenExpiry - TOKEN_EXPIRY_BUFFER_MS;
};

/**
 * Waits for Google Identity Services to be available on window.
 *
 * @returns Promise that resolves when GIS is available
 */
const waitForGoogleIdentity = async (): Promise<void> =>
  new Promise((resolve) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const iv = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(iv);
        resolve();
      }
    }, 50);
  });

/**
 * Resolve effective scope from URL param. Only 'drive' is allowed as an override.
 * Anything else falls back to default 'drive.file'.
 *
 * @returns Full scope URL when present in URL, otherwise null
 */
const resolveScopeFromUrl = (): string | null => {
  try {
    const params = new URLSearchParams(location.search);
    const raw = params.get(SCOPE_QUERY_PARAM)?.trim();
    if (raw === 'drive') return 'https://www.googleapis.com/auth/drive';
    if (raw === 'drive.file') return 'https://www.googleapis.com/auth/drive.file';
  } catch {
    /* ignore */
  }
  return null;
};

/**
 * Determine the effective OAuth scope from URL > env.
 *
 * @returns The scope URL to request
 */
const determineScope = (): string => {
  // 1) URL override: only 'drive' or 'drive.file'
  const urlScope = resolveScopeFromUrl();
  if (urlScope) return urlScope;

  // 2) Environment default
  return DEFAULT_SCOPE;
};

/**
 * Get the currently configured effective OAuth scope.
 *
 * @returns The scope URL currently selected
 */
export const getOAuthScope = (): string => {
  if (!currentScope) currentScope = determineScope();
  return currentScope;
};

/**
 * Initializes the Google Identity Services token client.
 */
export const initAuth = async (): Promise<void> => {
  await waitForGoogleIdentity();
  const gis = window.google?.accounts?.oauth2;
  if (!gis || typeof gis.initTokenClient !== 'function') {
    throw new Error('Google Identity Services not available');
  }
  // Provide a placeholder callback; real callback is set per request.
  const scope = getOAuthScope();
  // Surface when a broader-than-default scope is in use to help testing and reviews
  if (scope === 'https://www.googleapis.com/auth/drive') {
    // Intentionally using console to make this obvious in dev tools
    console.log('[tiddlydrive] Using non-default OAuth scope: drive');
  }
  tokenClient = gis.initTokenClient({
    client_id: CLIENT_ID,
    scope,
    callback: () => {
      /* replaced per request */
    }
  }) as GoogleTokenClient;
  currentScope = scope;
};

/**
 * Requests an OAuth token interactively via GIS, optionally forcing the consent prompt.
 * Also updates the cached token/expiry and resolves any pending concurrent requests.
 *
 * @param prompt Either 'consent' to force consent screen; omit to allow silent flow
 * @returns Promise resolving to the OAuth access token string
 */
const requestInteractive = async (prompt?: 'consent'): Promise<string> =>
  new Promise((resolve, reject) => {
    if (!tokenClient) {
      reject(new Error('Token client not init'));
      return;
    }
    tokenClient.callback = (resp: GoogleOAuth2TokenResponse) => {
      if (resp.error) {
        reject(new Error(resp.error));
        return;
      }
      accessToken = resp.access_token;
      // Use a much more generous expiry - only subtract 5 minutes instead of 30 seconds
      // This makes tokens last ~55 minutes instead of ~59.5 minutes, reducing re-auth frequency
      tokenExpiry = Date.now() + (resp.expires_in - TOKEN_EXPIRY_GRACE_PERIOD_SECONDS) * 1000;
      // Resolve the caller and any queued waiters.
      resolve(resp.access_token);
      const toResolve = pending.splice(0);
      toResolve.forEach((r) => {
        if (typeof accessToken === 'string') {
          r(accessToken);
        }
      });
    };
    try {
      // Only provide the prompt parameter when we explicitly want to force consent.
      // Omitting the parameter lets GIS attempt a silent refresh without UI when possible.
      if (prompt === 'consent') {
        tokenClient.requestAccessToken({ prompt: 'consent' });
      } else {
        tokenClient.requestAccessToken();
      }
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });

/**
 * Retrieves a valid access token, reusing cached tokens until near expiry.
 * Collapses concurrent requests into a single in-flight interactive request.
 *
 * @param opts Optional controls for interactive prompts
 * @param opts.prompt Force Google consent screen ('consent') or default ('')
 * @returns Promise resolving to a valid OAuth access token
 */
export const getAccessToken = async (opts: { prompt?: 'consent' } = {}): Promise<string> => {
  // Try to reuse a cached valid token from storage with generous expiry check
  loadCachedToken();

  // Use the same generous buffer as hasValidToken to avoid frequent re-auth
  if (accessToken && Date.now() < tokenExpiry - TOKEN_EXPIRY_BUFFER_MS) {
    return accessToken;
  }

  // Ensure token client is initialized with the currently configured scope
  if (!tokenClient) {
    await initAuth();
  } else if (currentScope !== getOAuthScope()) {
    // Scope changed since last init; re-init to apply new scope
    tokenClient = null;
    await initAuth();
  }
  if (requesting) return new Promise((res) => pending.push(res));
  requesting = true;
  try {
    // First try silent refresh (no prompt) unless explicitly requesting consent
    const tok = await requestInteractive(opts.prompt);
    persistToken();
    return tok;
  } finally {
    requesting = false;
  }
};

/**
 * Validates the current token by making a lightweight API call.
 * Returns true if token is valid, false if it needs refresh.
 *
 * @returns Promise<boolean> indicating if current token is valid
 */
export const validateToken = async (): Promise<boolean> => {
  if (!accessToken) return false;

  try {
    // Make a lightweight API call to validate the token
    const response = await fetch(
      'https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=' + accessToken
    );
    return response.ok;
  } catch {
    return false;
  }
};

/**
 * Clears any cached token and expiry so the next request will refresh.
 */
export const clearToken = (): void => {
  accessToken = null;
  tokenExpiry = 0;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
};
