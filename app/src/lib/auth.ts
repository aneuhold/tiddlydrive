const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const CLIENT_ID = '477983451498-28pnsm6sgqfm5l2gk0pris227couk477.apps.googleusercontent.com';

// Using loose typing to avoid needing full GIS type package
let tokenClient: any | null = null;
let accessToken: string | null = null;
let tokenExpiry = 0;
let requesting = false;
const pending: Array<(t: string) => void> = [];

/**
 *
 */
function waitForGoogleIdentity(): Promise<void> {
  return new Promise((resolve) => {
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
}

/**
 *
 */
export async function initAuth() {
  await waitForGoogleIdentity();
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: (resp: any) => {
      if (resp.error) return;
      accessToken = resp.access_token;
      tokenExpiry = Date.now() + (resp.expires_in - 30) * 1000;
      pending.splice(0).forEach((r) => {
        r(accessToken!);
      });
    }
  });
}

/**
 *
 * @param prompt
 */
async function requestInteractive(prompt = ''): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      reject(new Error('Token client not init'));
      return;
    }
    tokenClient.callback = (resp: any) => {
      if (resp.error) {
        reject(resp);
        return;
      }
      resolve(resp.access_token);
    };
    try {
      tokenClient.requestAccessToken({ prompt });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 *
 * @param opts
 * @param opts.interactive
 */
export async function getAccessToken(opts: { interactive?: boolean } = {}): Promise<string> {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;
  if (!tokenClient) await initAuth();
  if (requesting) return new Promise((res) => pending.push(res));
  requesting = true;
  try {
    const tok = await requestInteractive('');
    return tok;
  } finally {
    requesting = false;
  }
}

/**
 *
 */
export function clearToken() {
  accessToken = null;
  tokenExpiry = 0;
}
