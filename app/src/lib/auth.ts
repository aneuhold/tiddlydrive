import type { GoogleOAuth2TokenResponse, GoogleTokenClient } from './types.js';

const SCOPES = import.meta.env.VITE_GOOGLE_SCOPES || 'https://www.googleapis.com/auth/drive.file';
const CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  '477983451498-28pnsm6sgqfm5l2gk0pris227couk477.apps.googleusercontent.com';

let tokenClient: GoogleTokenClient | null = null;
let accessToken: string | null = null;
let tokenExpiry = 0;
let requesting = false;
const pending: Array<(t: string) => void> = [];
const STORAGE_KEY = 'td2:oauth';

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
 * Initializes the Google Identity Services token client.
 */
export const initAuth = async (): Promise<void> => {
  await waitForGoogleIdentity();
  const gis = window.google?.accounts?.oauth2;
  if (!gis || typeof gis.initTokenClient !== 'function') {
    throw new Error('Google Identity Services not available');
  }
  // Provide a placeholder callback; real callback is set per request.
  tokenClient = gis.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: () => {
      /* replaced per request */
    }
  }) as GoogleTokenClient;
};

/**
 * Requests an OAuth token interactively via GIS, optionally forcing the consent prompt.
 * Also updates the cached token/expiry and resolves any pending concurrent requests.
 *
 * @param prompt Either 'consent' to force consent screen or '' for normal flow
 * @returns Promise resolving to the OAuth access token string
 */
const requestInteractive = async (prompt: '' | 'consent' = ''): Promise<string> =>
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
      tokenExpiry = Date.now() + (resp.expires_in - 30) * 1000;
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
      tokenClient.requestAccessToken({ prompt });
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
export const getAccessToken = async (opts: { prompt?: 'consent' | '' } = {}): Promise<string> => {
  // Try to reuse a cached valid token from storage
  loadCachedToken();
  if (accessToken && Date.now() < tokenExpiry) return accessToken;
  if (!tokenClient) await initAuth();
  if (requesting) return new Promise((res) => pending.push(res));
  requesting = true;
  try {
    const tok = await requestInteractive(opts.prompt ?? '');
    persistToken();
    return tok;
  } finally {
    requesting = false;
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
