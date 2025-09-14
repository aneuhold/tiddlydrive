import type { GoogleOAuth2TokenResponse, GoogleTokenClient } from './types.js';

const DEFAULT_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const CLIENT_ID = '477983451498-28pnsm6sgqfm5l2gk0pris227couk477.apps.googleusercontent.com';
const WEB_API_KEY = 'AIzaSyBa2pekTr_FkdjYQlZDjHGuuxwNO6EY9Pg';
const SCOPE_QUERY_PARAM = 'td_scope';

// Discovery doc URL for APIs used by the app
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

let tokenClient: GoogleTokenClient | null = null;
let googleAPIInitialized = false;
let googleIdentityServicesInitialized = false;
const TOKEN_STORAGE_KEY = 'td2_gapi_token';

type StoredToken = {
  access_token: string;
  /** epoch millis */
  expire_at: number;
  scope: string;
};

const readStoredToken = (scope: string): StoredToken | null => {
  try {
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
    const skew = 60; // seconds early expiration to account for clock skew
    const expire_at = Date.now() + Math.max(0, (expiresInSec - skew) * 1000);
    const payload: StoredToken = { access_token: token, expire_at, scope };
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage errors (private mode, etc.)
  }
};

/**
 * Waits for Google API client to be available on window.
 *
 * @returns Promise that resolves when gapi is available
 */
const waitForGapi = async (): Promise<void> =>
  new Promise((resolve) => {
    if (window.gapi) {
      resolve();
      return;
    }
    const iv = setInterval(() => {
      if (window.gapi) {
        clearInterval(iv);
        resolve();
      }
    }, 50);
  });

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
 * @returns Full scope URL when present in URL, otherwise default scope
 */
const determineScope = (): string => {
  try {
    const params = new URLSearchParams(location.search);
    const raw = params.get(SCOPE_QUERY_PARAM)?.trim();
    if (raw === 'drive') return 'https://www.googleapis.com/auth/drive';
    if (raw === 'drive.file') return 'https://www.googleapis.com/auth/drive.file';
  } catch {
    /* ignore */
  }
  return DEFAULT_SCOPE;
};

/**
 * Initializes the Google API client.
 */
const initializeGapiClient = async (): Promise<void> => {
  if (!window.gapi?.client) {
    throw new Error('Google API client not available');
  }
  await window.gapi.client.init({
    apiKey: WEB_API_KEY,
    discoveryDocs: [DISCOVERY_DOC]
  });
  googleAPIInitialized = true;
};

/**
 * Initializes the Google Identity Services token client.
 */
const initializeGoogleIdentityServices = async (): Promise<void> => {
  await waitForGoogleIdentity();
  const gis = window.google?.accounts?.oauth2;
  if (!gis || typeof gis.initTokenClient !== 'function') {
    throw new Error('Google Identity Services not available');
  }

  const scope = determineScope();
  // Surface when a broader-than-default scope is in use to help testing and reviews
  if (scope === 'https://www.googleapis.com/auth/drive') {
    console.log('[tiddlydrive] Using non-default OAuth scope: drive');
  }

  tokenClient = gis.initTokenClient({
    client_id: CLIENT_ID,
    scope,
    callback: () => {} // Will be set per request
  });
  googleIdentityServicesInitialized = true;
};

/**
 * Initializes both Google API client and Google Identity Services.
 */
export const initAuth = async (): Promise<void> => {
  await waitForGapi();

  if (!window.gapi) {
    throw new Error('Google API not available');
  }

  window.gapi.load('client', () => {
    initializeGapiClient().catch(console.error);
  });
  await initializeGoogleIdentityServices();

  // Wait for both to be initialized
  while (!googleAPIInitialized || !googleIdentityServicesInitialized) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
};

/**
 * Retrieves a valid access token using Google's recommended pattern.
 *
 * Behavior:
 * - Defaults to a silent attempt (prompt: '') without showing consent.
 * - If a token already exists in gapi, refreshes it silently.
 * - Only shows the consent screen when explicitly requested with `{ prompt: 'consent' }`.
 *
 * This avoids interactive prompts on page load; call with `{ prompt: 'consent' }` in
 * response to a user gesture (e.g., a button click) to establish a new session.
 *
 * @param opts Optional controls for interactive prompts
 * @param opts.prompt When set to 'consent', forces the Google consent screen
 * @returns Promise resolving to a valid OAuth access token string
 */
export const getAccessToken = async (opts: { prompt?: 'consent' } = {}): Promise<string> => {
  // Ensure auth is initialized
  if (!tokenClient || !googleAPIInitialized || !googleIdentityServicesInitialized) {
    await initAuth();
  }

  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      reject(new Error('Token client not initialized'));
      return;
    }

    if (!window.gapi?.client) {
      reject(new Error('Google API client not available'));
      return;
    }

    const scope = determineScope();
    // Try stored token (survives reloads) first
    const stored = readStoredToken(scope);
    if (stored && !opts.prompt) {
      // Set token into gapi client and return it
      window.gapi.client.setToken({ access_token: stored.access_token });
      resolve(stored.access_token);
      return;
    }

    // If we already have an in-memory token and caller didn't request consent, reuse it immediately.
    const existing = window.gapi.client.getToken();
    if (existing && !opts.prompt) {
      resolve(existing.access_token);
      return;
    }

    tokenClient.callback = (resp: GoogleOAuth2TokenResponse) => {
      if (resp.error) {
        // If caller didn't explicitly request consent, indicate that consent is required
        // so the UI can trigger an interactive flow in response to a user gesture.
        if (opts.prompt !== 'consent') {
          reject(new Error('consent_required'));
          return;
        }
        reject(new Error(resp.error));
        return;
      }

      // Set token in Google API client for future requests
      if (window.gapi?.client) {
        window.gapi.client.setToken({
          access_token: resp.access_token,
          expires_in: resp.expires_in
        });
      }

      // Persist token to session storage (scoped)
      if (typeof resp.expires_in === 'number') {
        writeStoredToken(resp.access_token, resp.expires_in, scope);
      }

      resolve(resp.access_token);
    };

    // Silent-first strategy to avoid prompts on load.
    // - If the caller explicitly asked for consent, prompt now.
    // - If a token exists, refresh silently.
    // - If no token exists, attempt a silent request first; if that fails, the
    //   caller should re-invoke with `{ prompt: 'consent' }` during a user action.
    if (opts.prompt !== 'consent') {
      tokenClient.requestAccessToken({ prompt: '' });
      return;
    }

    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
};
