// No GIS token client types are imported because token minting is handled by the backend.

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

const DEFAULT_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const WEB_API_KEY = 'AIzaSyBa2pekTr_FkdjYQlZDjHGuuxwNO6EY9Pg';
const SCOPE_QUERY_PARAM = 'td_scope';

// Discovery doc URL for APIs used by the app
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

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

// GIS popup flows are not used—tokens come from the backend via refresh token cookie.

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
  // Ensure the base gapi object is present
  await waitForGapi();
  const gapiObj = window.gapi;
  if (!gapiObj) {
    throw new Error('Google API not available');
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
 * Initializes the Google Identity Services token client.
 */
// No GIS token client needed; tokens are minted via backend using refresh token cookie.

/**
 * Initializes both Google API client and Google Identity Services.
 */
export const initAuth = async (): Promise<void> => {
  await initializeGapiClient();
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
/**
 * Retrieves a valid access token via the backend.
 * Strategy:
 * - If a cached token for the effective scope is still valid, reuse it.
 * - Otherwise, call `/api/token` (credentials: include). If 401, open `/api/oauth/start` in a popup
 *   and, once closed, retry `/api/token`.
 * - On success, write token to gapi.client and local cache.
 *
 * @returns Promise that resolves to an OAuth access token string
 */
export const getAccessToken = async (): Promise<string> => {
  if (!window.gapi?.client) await initAuth();

  const scope = determineScope();

  const stored = readStoredToken(scope);
  if (stored) {
    const gapiClient = window.gapi?.client;
    if (!gapiClient) throw new Error('Google API client not available');
    gapiClient.setToken({ access_token: stored.access_token });
    return stored.access_token;
  }

  const mint = async (): Promise<{ access_token: string; expires_in: number }> => {
    const resp = await fetch('/api/token', { credentials: 'include', method: 'GET' });
    if (resp.status === 401) throw new Error('no_session');
    if (!resp.ok) throw new Error(`token_failed:${resp.status}`);
    return resp.json();
  };

  try {
    const data = (await mint()) as { access_token: string; expires_in: number; scope?: string };
    // If the access token scope does not satisfy the desired scope, force re-consent with override
    if (!isScopeSatisfied(data.scope, scope)) {
      const pageParams = new URLSearchParams(location.search);
      const override =
        pageParams.get(SCOPE_QUERY_PARAM) ||
        (scope.endsWith('/drive') ? 'drive' : scope.endsWith('/drive.file') ? 'drive.file' : null);
      const startUrl = override
        ? `/api/oauth/start?${SCOPE_QUERY_PARAM}=${encodeURIComponent(override)}`
        : '/api/oauth/start';
      await openAuthPopupAndWait(startUrl);
      const data2 = (await mint()) as { access_token: string; expires_in: number; scope?: string };
      if (!isScopeSatisfied(data2.scope, scope)) {
        throw new Error('scope_not_granted');
      }
      const gapiClient2 = window.gapi?.client;
      if (!gapiClient2) throw new Error('Google API client not available');
      gapiClient2.setToken({ access_token: data2.access_token });
      writeStoredToken(data2.access_token, data2.expires_in, scope);
      return data2.access_token;
    }
    const gapiClient = window.gapi?.client;
    if (!gapiClient) throw new Error('Google API client not available');
    gapiClient.setToken({ access_token: data.access_token });
    writeStoredToken(data.access_token, data.expires_in, scope);
    return data.access_token;
  } catch (e) {
    if (e instanceof Error && e.message === 'no_session') {
      // Open OAuth start in a popup and wait for it to close
      const pageParams = new URLSearchParams(location.search);
      const override = pageParams.get(SCOPE_QUERY_PARAM);
      const startUrl = override
        ? `/api/oauth/start?${SCOPE_QUERY_PARAM}=${encodeURIComponent(override)}`
        : '/api/oauth/start';
      await openAuthPopupAndWait(startUrl);
      const data = (await mint()) as { access_token: string; expires_in: number; scope?: string };
      if (!isScopeSatisfied(data.scope, scope)) {
        // If still not satisfied after consent (e.g., user denied broader scope), surface a clear error
        throw new Error('scope_not_granted');
      }
      const gapiClient = window.gapi?.client;
      if (!gapiClient) throw new Error('Google API client not available');
      gapiClient.setToken({ access_token: data.access_token });
      writeStoredToken(data.access_token, data.expires_in, scope);
      return data.access_token;
    }
    throw e;
  }
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
  const DRIVE = 'https://www.googleapis.com/auth/drive';
  const DRIVE_FILE = 'https://www.googleapis.com/auth/drive.file';
  if (desiredScope === DRIVE) return list.includes(DRIVE);
  if (desiredScope === DRIVE_FILE) return list.includes(DRIVE) || list.includes(DRIVE_FILE);
  // Fallback: exact match
  return list.includes(desiredScope);
}

/**
 * Opens a small centered popup to the given URL and resolves when the window closes.
 *
 * @param url Absolute or relative URL to open in the popup
 * @returns Promise that resolves when the popup window is closed
 */
const openAuthPopupAndWait = async (url: string): Promise<void> =>
  new Promise((resolve) => {
    const w = 500;
    const h = 600;
    const width = window.innerWidth || document.documentElement.clientWidth || screen.width;
    const height = window.innerHeight || document.documentElement.clientHeight || screen.height;
    const left = width / 2 - w / 2 + (window.screenX || 0);
    const top = height / 2 - h / 2 + (window.screenY || 0);
    const features = `scrollbars=yes, width=${w}, height=${h}, top=${top}, left=${left}`;
    const popup = window.open(url, 'td2_auth', features);
    if (!popup) {
      // Popup blocked; navigate current tab as a fallback
      window.location.href = url;
      resolve();
      return;
    }
    const iv = setInterval(() => {
      if (popup.closed) {
        clearInterval(iv);
        resolve();
      }
    }, 300);
  });
