import type { Prefs } from '$lib/prefs';

/**
 * Minimal Google Identity Services token response shape used by this app.
 */
export type GoogleOAuth2TokenResponse = {
  access_token: string;
  expires_in: number;
  error?: string;
};

/**
 * Minimal Google Identity Services token client used by this app.
 */
export type GoogleTokenClient = {
  callback: (resp: GoogleOAuth2TokenResponse) => void;
  requestAccessToken: (args?: { prompt?: 'consent' }) => void;
};

/**
 * Shape of the Google Drive "state" parameter we read from the URL.
 */
export type DriveOpenState = {
  ids: string[];
  [key: string]: unknown;
};

/**
 * Minimal subset of Drive file metadata used by the app.
 */
export type DriveFileMeta = {
  id: string;
  name: string;
  mimeType?: string;
  modifiedTime?: string;
  version?: string | number;
};

/**
 * Options used when registering the TiddlyWiki saver integration.
 */
export type SaverOptions = {
  preferences: () => Prefs;
};

/**
 * Options for saving a wiki back to Drive.
 */
export type SaveOptions = {
  autosave?: boolean;
};
