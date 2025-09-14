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
  requestAccessToken: (args?: { prompt?: 'consent' | '' }) => void;
};

/**
 * Minimal Google API client types for token management.
 */
export type GoogleApiToken = {
  access_token: string;
  expires_in?: number;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (resp: GoogleOAuth2TokenResponse) => void;
          }) => GoogleTokenClient;
        };
      };
    };
    gapi?: {
      load: (api: string, callback: () => void) => void;
      client: {
        init: (config: { apiKey?: string; discoveryDocs?: string[] }) => Promise<void>;
        getToken: () => GoogleApiToken | null;
        setToken: (token: GoogleApiToken | null) => void;
        request: <T = unknown>(args: {
          path: string;
          method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
          params?: Record<string, string | number | boolean | undefined>;
          body?: unknown;
          headers?: Record<string, string>;
        }) => Promise<GapiResponse<T>>;
        drive: {
          files: {
            get: (args: {
              fileId: string;
              fields?: string;
              alt?: string;
              supportsAllDrives?: boolean;
              includeItemsFromAllDrives?: boolean;
            }) => Promise<GapiResponse<unknown>>;
            update: (args: {
              fileId: string;
              fields?: string;
              supportsAllDrives?: boolean;
              includeItemsFromAllDrives?: boolean;
            }) => Promise<GapiResponse<unknown>>;
          };
        };
      };
    };
  }
}

/**
 * Minimal shape of a response returned by gapi.client.request.
 */
export type GapiResponse<T> = {
  result: T;
  body: string;
  status: number;
  statusText: string;
  headers?: Record<string, string>;
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
