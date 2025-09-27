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

/** Throws if not executing in a browser environment */
export const assertClient = (): void => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new AuthError(AuthErrorCode.SsrUnavailable, 'Not running in a browser environment');
  }
};
