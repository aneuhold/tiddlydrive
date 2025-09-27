/** Shared auth-related types */
export type AccessTokenResponse = {
  access_token: string;
  expires_in: number;
  scope?: string;
};

export type StoredToken = {
  accessToken: string;
  /** epoch millis */
  expireAt: number;
  scope: string;
};

export enum AuthErrorCode {
  NoSession = 'no_session',
  TokenFailed = 'token_failed',
  ScopeNotGranted = 'scope_not_granted',
  GapiUnavailable = 'gapi_unavailable',
  SsrUnavailable = 'ssr_unavailable'
}
