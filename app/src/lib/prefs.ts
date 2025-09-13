import { applyPageCustomizationsFromWiki } from '$lib/tw';
import { writable, type Writable } from 'svelte/store';

const PREFS_KEY = 'td2:prefs';

export type Prefs = {
  autosave: boolean;
  enableHotkeySave: boolean;
  disableDriveSave: boolean;
  useWikiFavicon: boolean;
  useWikiTitle: boolean;
};

export const defaultPrefs: Prefs = {
  autosave: true,
  enableHotkeySave: true,
  disableDriveSave: false,
  useWikiFavicon: true,
  useWikiTitle: true
};

/**
 * Reads a cookie value by name.
 *
 * @param name The cookie name
 * @returns The cookie value or null if not found
 */
const readCookie = (name: string): string | null => {
  try {
    const nameEQ = name + '=';
    return (
      document.cookie
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith(nameEQ))
        ?.substring(nameEQ.length) || null
    );
  } catch {
    return null;
  }
};

/**
 * Load preferences from localStorage, with legacy cookie fallback.
 *
 * @returns Loaded preferences object
 */
export const loadPrefs = (): Prefs => {
  let prefs: Prefs = { ...defaultPrefs };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Prefs>;
      prefs = {
        autosave: parsed.autosave ?? prefs.autosave,
        enableHotkeySave: parsed.enableHotkeySave ?? prefs.enableHotkeySave,
        disableDriveSave: parsed.disableDriveSave ?? prefs.disableDriveSave,
        useWikiFavicon: parsed.useWikiFavicon ?? prefs.useWikiFavicon,
        useWikiTitle: parsed.useWikiTitle ?? prefs.useWikiTitle
      };
      return prefs;
    }
  } catch {
    /* ignore */
  }
  // Legacy cookie fallback
  prefs.autosave = readCookie('enableautosave') !== 'false';
  prefs.enableHotkeySave = readCookie('enablehotkeysave') !== 'false';
  prefs.disableDriveSave = readCookie('disablesave') === 'true';
  return prefs;
};

/**
 * Persist preferences to localStorage.
 *
 * @param prefs Preferences to persist
 */
const savePrefs = (prefs: Prefs): void => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
};

/** Writable preferences store that auto-persists on changes. */
export const prefsStore: Writable<Prefs> = writable(loadPrefs());

prefsStore.subscribe((val) => {
  applyPageCustomizationsFromWiki(val);
  savePrefs(val);
});
