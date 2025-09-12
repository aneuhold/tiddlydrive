import { writable, type Writable } from 'svelte/store';

export type ToastKind = 'info' | 'success' | 'error';

export type Toast = {
  id: number;
  message: string;
  kind: ToastKind;
  timeout: number;
};

export type UiError = {
  title: string;
  body: string;
} | null;

/** Store holding active toasts. */
export const toasts: Writable<Toast[]> = writable([]);

/** Store holding the current blocking error (null when none). */
export const uiError: Writable<UiError> = writable(null);

let nextId = 1;

/**
 * Pushes a toast into the global toast store and schedules auto-dismiss.
 *
 * @param message Text content to display
 * @param kind Optional toast kind; defaults to 'info'
 * @param timeout Auto-dismiss timeout in ms (default 2000)
 */
export const pushToast = (message: string, kind: ToastKind = 'info', timeout = 2000): void => {
  const id = nextId++;
  const toast: Toast = { id, message, kind, timeout };
  toasts.update((arr) => [...arr, toast]);
  setTimeout(() => {
    toasts.update((arr) => arr.filter((t) => t.id !== id));
  }, timeout);
};

/**
 * Sets a UI error to be displayed by the host component.
 *
 * @param title Title text
 * @param body Body text
 */
export const setUiError = (title: string, body: string): void => {
  uiError.set({ title, body });
};

/**
 * Clears any active UI error.
 */
export const clearUiError = (): void => {
  uiError.set(null);
};
