// auth.js - Google Identity Services token management for Tiddly Drive 2

const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const CLIENT_ID = process.env.TD2_GOOGLE_CLIENT_ID || '';

let tokenClient = null;
let accessToken = null;
let tokenExpiry = 0; // epoch ms

function waitForGoogleIdentity() {
  return new Promise((resolve) => {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) return resolve();
    const iv = setInterval(() => {
      if (window.google && window.google.accounts && window.google.accounts.oauth2) {
        clearInterval(iv);
        resolve();
      }
    }, 50);
  });
}

export async function initAuth() {
  if (!CLIENT_ID) {
    console.warn('[auth] Missing CLIENT_ID. Provide TD2_GOOGLE_CLIENT_ID at build time.');
  }
  await waitForGoogleIdentity();
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: (tokenResponse) => {
      accessToken = tokenResponse.access_token;
      // tokenResponse.expires_in is seconds
      tokenExpiry = Date.now() + (tokenResponse.expires_in - 30) * 1000; // subtract 30s buffer
      pendingResolvers.forEach(r => r(accessToken));
      pendingResolvers.clear();
    }
  });
}

const pendingResolvers = new Set();
let requesting = false;

function requestInteractive(prompt = '') {
  return new Promise((resolve, reject) => {
    try {
      tokenClient.callback = (resp) => {
        if (resp.error) {
          reject(resp);
        } else {
          resolve(resp.access_token);
        }
      };
      tokenClient.requestAccessToken({ prompt });
    } catch (e) { reject(e); }
  });
}

export async function getAccessToken({ interactive = true } = {}) {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;
  if (!tokenClient) await initAuth();
  if (requesting) {
    return new Promise((res) => pendingResolvers.add(res));
  }
  requesting = true;
  try {
    const token = await requestInteractive(interactive ? '' : '');
    return token;
  } finally {
    requesting = false;
  }
}

export function clearToken() {
  accessToken = null;
  tokenExpiry = 0;
}
