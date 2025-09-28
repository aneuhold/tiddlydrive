/** Shared auth-related types */
export type AccessTokenResponse = {
  access_token: string;
  expires_in: number;
  scope?: string;
};

export type StoredToken = {
  accessToken: string;
  /** epoch milliseconds */
  expireAt: number;
  scope: string;
};

export enum AuthErrorCode {
  NoSession = 'no_session',
  TokenFailed = 'token_failed',
  ScopeNotGranted = 'scope_not_granted',
  GapiUnavailable = 'gapi_unavailable',
  SsrUnavailable = 'ssr_unavailable',
  /**
   * Indicates that access was blocked by an admin policy, e.g. because the
   * user's account is not allowed to access the app / something else.
   * See https://developers.google.com/identity/protocols/oauth2/web-server#authorization-errors-admin-policy-enforced
   */
  AccessRestrictedByPolicy = 'access_restricted_by_policy'
}
