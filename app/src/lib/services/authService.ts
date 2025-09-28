import { GapiClient } from './auth/GapiClient.js';
import { OAuthPopup } from './auth/OAuthPopup.js';
import { ScopeResolver } from './auth/ScopeResolver.js';
import { TokenCache } from './auth/TokenCache.js';
import { AuthError, handleTokenResponseError } from './auth/errors.js';
import { AuthErrorCode, type AccessTokenResponse } from './auth/types.js';

/** Orchestrates OAuth scope handling, token minting and gapi integration */
class AuthService {
  private tokenCache = new TokenCache();
  private scopeResolver = new ScopeResolver();
  private popup = new OAuthPopup();
  private gapiClient = new GapiClient();
  private mintInFlight: Promise<AccessTokenResponse> | null = null;

  /**
   * Initializes gapi client (idempotent).
   *
   * @returns Promise that resolves when gapi is ready
   */
  init(): Promise<void> {
    return this.gapiClient.ensureLoaded();
  }

  /**
   * Returns an access token satisfying the current desired scope (auto-consent if needed).
   *
   * @returns Access token string
   */
  async getAccessToken(): Promise<string> {
    const desiredScope = this.scopeResolver.determine();
    const cached = this.tokenCache.read(desiredScope);
    if (cached) {
      this.gapiClient.setAccessToken(cached.accessToken);
      return cached.accessToken;
    }

    const tokenResp = await this.obtainAuthorizedToken(desiredScope);
    this.applyToken(tokenResp, desiredScope);
    return tokenResp.access_token;
  }

  /**
   * Forces a consent flow, replacing any cached token.
   *
   * @returns New access token string
   */
  async reauthenticateWithConsent(): Promise<string> {
    const desiredScope = this.scopeResolver.determine();
    this.tokenCache.clear();
    const tokenResp = await this.obtainAuthorizedToken(desiredScope, { forceConsentFirst: true });
    this.applyToken(tokenResp, desiredScope);
    return tokenResp.access_token;
  }

  /**
   * Clears cached token (does not affect backend cookie).
   */
  clearCachedToken(): void {
    this.tokenCache.clear();
  }

  /**
   * Internal: apply token consistently.
   *
   * @param resp Access token response
   * @param scope Scope associated with the token
   */
  private applyToken(resp: AccessTokenResponse, scope: string): void {
    this.gapiClient.setAccessToken(resp.access_token);
    this.tokenCache.write(resp.access_token, resp.expires_in, scope);
  }

  /**
   * Internal: call backend /api/token with single-flight.
   *
   * @returns Token response
   */
  private async mint(): Promise<AccessTokenResponse> {
    if (this.mintInFlight) return this.mintInFlight;
    this.mintInFlight = (async () => {
      const res = await fetch('/api/token', { credentials: 'include' });
      await handleTokenResponseError(res);
      return (await res.json()) as AccessTokenResponse;
    })();
    try {
      return await this.mintInFlight;
    } finally {
      this.mintInFlight = null;
    }
  }

  /**
   * Consent + mint helper.
   *
   * @param scopeOverrideShort Short scope override (e.g. drive or drive.file) or null
   * @returns Token response after consent + mint
   */
  private async consentAndMint(scopeOverrideShort: string | null): Promise<AccessTokenResponse> {
    const { popupUrl, fallbackUrl } = this.buildStartUrls(scopeOverrideShort);
    await this.popup.openAndWait(popupUrl, fallbackUrl);
    return this.mint();
  }

  /**
   * Build the popup and fallback /api/oauth/start URLs.
   * Popup URL: includes scope override only.
   * Fallback URL: includes scope override plus current location return target (td_return).
   *
   * @param override Short override string or null
   * @returns Object containing popupUrl and fallbackUrl
   */
  private buildStartUrls(override: string | null): { popupUrl: string; fallbackUrl: string } {
    const base = '/api/oauth/start';
    const build = (params: URLSearchParams) => {
      const qs = params.toString();
      return qs ? `${base}?${qs}` : base;
    };

    // Popup URL (no return param)
    const popupParams = new URLSearchParams();
    if (override) popupParams.set('td_scope', override);

    // Fallback URL (includes return param)
    const fallbackParams = new URLSearchParams(popupParams);
    const ret = `${location.pathname}${location.search}${location.hash}`;
    if (ret.startsWith('/')) fallbackParams.set('td_return', ret);

    return { popupUrl: build(popupParams), fallbackUrl: build(fallbackParams) };
  }

  /**
   * Core logic to obtain a token satisfying desired scope.
   *
   * @param desiredScope Desired full scope URL
   * @param opts Optional flags controlling flow
   * @param opts.forceConsentFirst Force consent before initial mint attempt
   * @returns Token response satisfying the desired scope
   */
  private async obtainAuthorizedToken(
    desiredScope: string,
    opts?: { forceConsentFirst?: boolean }
  ): Promise<AccessTokenResponse> {
    const pageOverride = this.scopeResolver.currentPageOverride();
    const derivedOverride = this.scopeResolver.deriveShort(desiredScope);
    const tryConsent = (ov: string | null) => this.consentAndMint(ov);

    if (opts?.forceConsentFirst) {
      const first = await tryConsent(pageOverride || derivedOverride);
      if (this.scopeResolver.isSatisfied(first.scope, desiredScope)) return first;
    }

    try {
      const initial = await this.mint();
      if (this.scopeResolver.isSatisfied(initial.scope, desiredScope)) return initial;

      const escalated = await tryConsent(pageOverride || derivedOverride);
      if (!this.scopeResolver.isSatisfied(escalated.scope, desiredScope)) {
        throw new AuthError(AuthErrorCode.ScopeNotGranted);
      }
      return escalated;
    } catch (e) {
      if (e instanceof AuthError && e.code === AuthErrorCode.NoSession) {
        const afterConsent = await tryConsent(pageOverride);
        if (!this.scopeResolver.isSatisfied(afterConsent.scope, desiredScope)) {
          throw new AuthError(AuthErrorCode.ScopeNotGranted);
        }
        return afterConsent;
      }
      throw e;
    }
  }
}

export const authService = new AuthService();
