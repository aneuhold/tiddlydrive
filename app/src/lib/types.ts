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
 * Minimal subset of Drive file metadata used by the app. See the
 * [Google Drive v3 API docs](https://developers.google.com/workspace/drive/api/reference/rest/v3/files#File)
 * for the full shape.
 */
export type DriveFileMeta = {
  id: string;
  name?: string;
  mimeType?: string;
  modifiedTime?: string;
  /**
   * This is the version number that gets incremented on each change. It is a whole integer but
   * returned as a string by the API.
   */
  version?: string;
};

/**
 * Options for saving a wiki back to Drive.
 */
export type SaveOptions = {
  autosave?: boolean;
};
