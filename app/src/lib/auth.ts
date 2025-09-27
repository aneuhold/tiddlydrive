// Legacy facade – delegates to new class-based service. Keep these exports stable for now.
import { authService } from './services/authService';
export { AuthError } from './services/auth/errors';
export { AuthErrorCode } from './services/auth/types';

/**
 * @deprecated Use authService.init()
 * @returns Promise resolving when gapi is ready
 */
export const initAuth = (): Promise<void> => authService.init();

/**
 * @deprecated Use authService.getAccessToken()
 * @returns Promise resolving to an access token
 */
export const getAccessToken = (): Promise<string> => authService.getAccessToken();

/**
 * @deprecated Use authService.reauthenticateWithConsent()
 * @returns Promise resolving to a new access token after consent
 */
export const reauthenticateWithConsent = (): Promise<string> =>
  authService.reauthenticateWithConsent();

/** Direct service export (preferred new usage) */
export { authService };
