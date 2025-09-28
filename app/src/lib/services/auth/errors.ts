import { AuthErrorCode } from './types';

/** Custom error type for authentication-related failures */
export class AuthError extends Error {
  code: AuthErrorCode;
  status?: number;
  /**
   * @param code Machine readable code
   * @param message Optional explicit message
   * @param status Optional HTTP status
   */
  constructor(code: AuthErrorCode, message?: string, status?: number) {
    super(message ?? code);
    this.code = code;
    this.status = status;
  }
}

/**
 * Handles token response errors and throws appropriate AuthError.
 *
 * @param response The fetch response from /api/token
 */
export const handleTokenResponseError = async (response: Response): Promise<void> => {
  if (response.status === 401) {
    throw new AuthError(AuthErrorCode.NoSession, undefined, 401);
  }

  if (response.status === 405) {
    const backendMessage = await response.text().catch(() => 'Unknown error');
    const userMessage = `Access is restricted by your organization's admin policy. Please contact your administrator for assistance. (${backendMessage})`;
    throw new AuthError(AuthErrorCode.AccessRestrictedByPolicy, userMessage, 405);
  }

  if (!response.ok) {
    throw new AuthError(AuthErrorCode.TokenFailed, undefined, response.status);
  }
};

/** Throws if not executing in a browser environment */
export const assertClient = (): void => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new AuthError(AuthErrorCode.SsrUnavailable, 'Not running in a browser environment');
  }
};
