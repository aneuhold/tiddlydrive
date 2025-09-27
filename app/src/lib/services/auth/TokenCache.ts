import type { StoredToken } from './types';

const TOKEN_STORAGE_KEY = 'td2_gapi_token';
const TOKEN_SKEW_SEC = 60; // early-expire skew

/** LocalStorage-backed token cache keyed by scope */
export class TokenCache {
  /**
   * Reads a stored token for a scope if still valid.
   *
   * @param scope OAuth scope string to retrieve cached token for
   * @returns Stored token or null if missing/expired
   */
  read(scope: string): StoredToken | null {
    try {
      const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StoredToken | null;
      if (
        !parsed ||
        parsed.scope !== scope ||
        Date.now() >= parsed.expireAt ||
        typeof parsed.accessToken !== 'string'
      ) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Writes a new token entry.
   *
   * @param accessToken Access token string
   * @param expiresInSec Lifetime in seconds from issuance
   * @param scope Scope associated with this token
   */
  write(accessToken: string, expiresInSec: number, scope: string): void {
    try {
      const expireAt = Date.now() + Math.max(0, (expiresInSec - TOKEN_SKEW_SEC) * 1000);
      const payload: StoredToken = { accessToken, expireAt, scope };
      localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }

  /** Clears any cached token */
  clear(): void {
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}
