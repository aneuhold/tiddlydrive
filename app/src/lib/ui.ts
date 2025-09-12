import { pushToast, setUiError } from './ui/store.js';

/**
 * Shows a toast message using the app-wide Svelte toast host.
 *
 * @param message The text to show
 * @param timeout Milliseconds before the toast auto-dismisses
 */
export const showToast = (message: string, timeout = 2000): void => {
  pushToast(message, 'info', timeout);
};

/**
 * Displays a simple blocking alert with a title and message body.
 *
 * @param title Title of the error
 * @param body Message body
 */
export const showError = (title: string, body: string): void => {
  setUiError(title, body);
};
