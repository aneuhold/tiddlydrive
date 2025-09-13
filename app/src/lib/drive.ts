import { showError, showToast } from '$lib/ui/UiHost.svelte';
import { getAccessToken } from './auth.js';
import { applyPageCustomizationsFromWiki, getTiddlyWikiFromWindow, latestTWObject } from './tw.js';
import type { DriveFileMeta, DriveOpenState, SaveOptions, SaverOptions } from './types.js';

let currentFileId: string | null = null;
let currentFileName = 'wiki.html';
let currentVersion: number | null = null;
let wikiSaverRegistered = false;
let saving = false;
let pendingSave: { html: string; autosave: boolean } | null = null;
const pendingResolvers: Array<(ok: boolean) => void> = [];

/**
 * When true, the next save will bypass the version preflight (used by "Save Anyway")
 */
let forceNextSave = false;

export interface LoadResult {
  meta: DriveFileMeta;
}

/**
 * Parses the Google Drive "state" URL parameter when opened via Drive UI.
 *
 * @returns The parsed state object or null if missing/invalid
 */
export const parseState = (): DriveOpenState | null => {
  const params = new URLSearchParams(location.search);
  const plainId = params.get('id');
  if (plainId) {
    return { ids: [plainId] } as DriveOpenState;
  }
  const raw = params.get('state');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DriveOpenState;
  } catch {
    return null;
  }
};

/**
 * Loads a Drive-hosted HTML wiki file into an iframe and returns metadata.
 *
 * @param iframe IFrame element where the wiki is rendered
 * @returns Promise containing the Drive file metadata
 */
export const loadFile = async (iframe: HTMLIFrameElement): Promise<LoadResult> => {
  const state = parseState();
  if (!state || !Array.isArray(state.ids) || state.ids.length !== 1)
    throw new Error('Missing or multi file state');
  currentFileId = state.ids[0];
  const token = await getAccessToken();
  // Include supportsAllDrives/includeItemsFromAllDrives so files in shared drives are accessible.
  const metaUrl = `https://www.googleapis.com/drive/v3/files/${currentFileId}?fields=id,name,mimeType,modifiedTime,version&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const metaResp = await fetch(metaUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!metaResp.ok) {
    let body = '';
    try {
      body = await metaResp.text();
    } catch (err) {
      console.warn('[td2/drive] metadata error body read failed', err);
    }
    console.warn('[td2/drive] metadata fetch failed', metaResp.status, body);
    if (metaResp.status === 404) {
      // Heuristics: common causes while developing without Marketplace "Open with" flow
      const hints = [
        'Confirm the file ID is correct (no extra characters).',
        'Ensure you are logged into the same Google account that owns / can access the file.',
        'If the file lives in a Shared Drive, supportsAllDrives=true is now added (retry after refresh).',
        'If you are manually crafting the ?state= parameter while using only the drive.file scope, the token may NOT grant this file (drive.file only covers files the user opened via the official Drive UI/Open-with or a Picker).'
      ];
      throw new Error('File not found (404). Possible causes:\n- ' + hints.join('\n- '));
    }
    throw new Error('Metadata fetch failed: ' + metaResp.status.toString() + ' ' + body);
  }
  const meta = (await metaResp.json()) as DriveFileMeta;
  // Track the Drive file version for simple conflict detection (string -> integer)
  currentVersion = meta.version ? Number.parseInt(meta.version) : null;
  currentFileName = meta.name || currentFileName;
  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${currentFileId}?alt=media&supportsAllDrives=true`;
  const fileResp = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!fileResp.ok) {
    let body = '';
    try {
      body = await fileResp.text();
    } catch (err) {
      console.warn('[td2/drive] download error body read failed', err);
    }
    console.warn('[td2/drive] download failed', fileResp.status, body);
    throw new Error('File download failed: ' + fileResp.status.toString() + ' ' + body);
  }
  const text = await fileResp.text();
  iframe.srcdoc = text;
  showToast('File loaded');
  return { meta };
};

/**
 * Attempts to hook into TiddlyWiki's saver pipeline so we save only when TW is dirty.
 *
 * @param iframe The iframe containing the wiki
 * @param opts Saver controls
 */
export const registerWikiSaver = (iframe: HTMLIFrameElement, opts: SaverOptions): void => {
  if (wikiSaverRegistered) return;
  const attempt = (): void => {
    const win = iframe.contentWindow;
    const tw = getTiddlyWikiFromWindow(win);
    if (!tw || !tw.saverHandler || !Array.isArray(tw.saverHandler.savers)) {
      setTimeout(attempt, 600);
      return;
    }

    // Apply page customizations from wiki once TW is available
    applyPageCustomizationsFromWiki(opts.preferences(), tw);

    tw.saverHandler.savers.push({
      info: { name: 'tiddly-drive-2', priority: 2000, capabilities: ['save', 'autosave'] },
      save: async (text: string, method: string, callback: (err?: string) => void) => {
        // Get preferences
        const prefs = opts.preferences();

        if (prefs.disableDriveSave) {
          callback('Saving disabled');
          return false;
        }
        if (method === 'autosave' && !prefs.autosave) {
          callback('Autosave disabled');
          return false;
        }
        try {
          const result = await save(text, { autosave: method === 'autosave' });

          // Return false if save failed (handled conflict or error)
          // There will be a dialog for the user if there was an error
          if (!result) {
            return false;
          }

          // Reset change counter so TW clears dirty indicator.
          try {
            const sh = tw.saverHandler;
            if (sh) {
              sh.numChanges = 0;
              sh.updateDirtyStatus();
            }
            // If any page customizations (like favicon) changed, reflect them
            applyPageCustomizationsFromWiki(prefs, tw);
          } catch (err) {
            console.warn('[td2/drive] failed to reset TW dirty status', err);
          }
          // Purposefully skip the callback here, so it doesn't show the built-in "saved" toast.
          return true;
        } catch (e) {
          callback((e as Error).message);
          return false;
        }
      }
    });
    wikiSaverRegistered = true;
  };
  attempt();
};

/**
 * Saves the provided HTML content back to the current Drive file.
 *
 * @param html The full HTML content of the wiki
 * @param root0 Save options including autosave flag
 * @param root0.autosave Whether the save is an autosave
 * @returns Promise resolving to true on success, false on handled conflict
 */
export const save = async (
  html: string,
  { autosave = false }: SaveOptions = {}
): Promise<boolean> => {
  if (!currentFileId) throw new Error('File not loaded');
  // Queue latest save request and process with single-flight & debounce (for autosave).
  return new Promise<boolean>((resolve) => {
    pendingSave = { html, autosave };
    pendingResolvers.push(resolve);
    void processSaveQueue();
  });
};

/**
 * Runs the queued save operations one at a time, coalescing rapid autosaves.
 */
const processSaveQueue = async (): Promise<void> => {
  if (saving) return;
  while (pendingSave) {
    saving = true;
    // Snapshot current pending payload and clear queue slot
    const { html, autosave } = pendingSave;
    pendingSave = null;
    // Collect resolvers waiting for this upload
    const resolvers = pendingResolvers.splice(0);
    // Debounce autosaves slightly to coalesce bursts
    if (autosave) {
      await new Promise((r) => setTimeout(r, 800));
      // If newer content arrived during debounce, the loop will see it in the while check
    }
    let ok = false;
    try {
      ok = await uploadHtmlMedia(html);
    } catch (e) {
      console.warn('[td2/drive] upload error', e);
      ok = false;
    }
    resolvers.forEach((r) => {
      r(ok);
    });
    saving = false;
  }
};

/**
 * Uploads html using media upload (simpler and robust) with preflight version check and permissions retry.
 *
 * @param html The full HTML content to upload
 * @returns Promise resolving to true on success, false when a handled conflict occurred
 */
const uploadHtmlMedia = async (html: string): Promise<boolean> => {
  if (!currentFileId) throw new Error('File not loaded');
  let token = await getAccessToken();

  // Respect a global force-save request (e.g., from "Save Anyway") and reset it
  const forcedSave = forceNextSave;
  forceNextSave = false;

  if (!forcedSave) {
    const hasConflicts = await hasFileConflicts(html, token);
    if (hasConflicts) return false;
  }

  const doUpload = async (): Promise<Response> =>
    fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${currentFileId}?uploadType=media&supportsAllDrives=true&fields=id,modifiedTime,version`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'text/html; charset=UTF-8'
          // No ETag precondition, because Google doesn't provide that. We use version instead.
        },
        body: html
      }
    );

  let resp = await doUpload();
  if (resp.status === 403) {
    try {
      token = await getAccessToken({ prompt: 'consent' });
      resp = await doUpload();
    } catch (_) {
      // ignore; fall through
    }
  }
  if (!resp.ok) {
    let detail = '';
    try {
      detail = await resp.text();
    } catch (_err) {
      /* ignore */
    }
    console.warn('[td2/drive] save failed', resp.status, detail);
    if (resp.status === 403) {
      showError(
        'Permission Denied',
        'The app token lacks write access for this file. If you manually crafted the state parameter, Drive may not have granted drive.file access. Open the file via Google Drive "Open with" (after install) or temporarily use a broader scope for testing.'
      );
    } else {
      showToast('Save failed');
    }
    throw new Error('Save failed ' + resp.status.toString() + ' ' + detail);
  }
  const respJson = (await resp.json()) as DriveFileMeta;
  console.log('[td2/drive] saved', respJson);
  // Update our local version tracker with the value returned by Drive
  currentVersion = respJson.version ? Number.parseInt(respJson.version, 10) : currentVersion;
  showToast('Saved');
  return true;
};

/**
 * Detects if the file has been modified on Drive since we loaded or last saved it.
 *
 * @param html The HTML content we plan to upload (for forced save on conflict)
 * @param token The current OAuth token
 * @returns Promise resolving to true if a conflict was detected and handled (save should abort), false if no conflict
 */
const hasFileConflicts = async (html: string, token: string) => {
  try {
    const verResp = await fetch(
      `https://www.googleapis.com/drive/v3/files/${currentFileId}?fields=version&supportsAllDrives=true&includeItemsFromAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (verResp.ok) {
      const verMeta = (await verResp.json()) as DriveFileMeta;
      const serverVersion = verMeta.version ? Number.parseInt(verMeta.version, 10) : null;
      if (
        currentVersion !== null &&
        serverVersion !== null &&
        !Number.isNaN(serverVersion) &&
        serverVersion !== currentVersion
      ) {
        showError('Conflict Detected', 'The file changed on Google Drive. Reload before saving.', {
          text: 'Save Anyway',
          fn: async () => {
            try {
              // Bypass conflict preflight on the next save
              forceNextSave = true;
              // Ask TiddlyWiki to perform a normal save; our saver will handle the force flag
              await latestTWObject?.saverHandler?.saveWiki();
            } catch (e) {
              console.warn('[td2/drive] forced save failed', e);
            }
          }
        });
        return true;
      }
    }
  } catch (err) {
    // If preflight fails (network/perm), continue and let upload path handle errors.
    console.warn('[td2/drive] version preflight failed', err);
  }
  return false;
};
