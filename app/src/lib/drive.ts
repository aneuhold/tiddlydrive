import { getAccessToken } from './auth.js';
import type {
  DriveFileMeta,
  DriveOpenState,
  SaveOptions,
  SaverOptions,
  TiddlyWiki
} from './types.js';
import { showError, showToast } from './ui.js';

let currentFileId: string | null = null;
let currentFileName = 'wiki.html';
let etag: string | null = null;
let wikiSaverRegistered = false;

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
        'If you are manually crafting the ?state= parameter while using only the drive.file scope, the token may NOT grant this file (drive.file only covers files the user opened via the official Drive UI/Open-with or a Picker).',
        'For local/manual testing you can temporarily broaden the scope to drive.readonly (set VITE_GOOGLE_SCOPES). Revert before final review.'
      ];
      throw new Error('File not found (404). Possible causes:\n- ' + hints.join('\n- '));
    }
    throw new Error('Metadata fetch failed: ' + metaResp.status.toString() + ' ' + body);
  }
  etag = metaResp.headers.get('etag');
  const meta = (await metaResp.json()) as DriveFileMeta;
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
 * @param opts Optional saver controls (disable and autosave flags)
 */
export const registerWikiSaver = (iframe: HTMLIFrameElement, opts: SaverOptions = {}): void => {
  if (wikiSaverRegistered) return;
  /**
   *
   */
  const attempt = (): void => {
    const win = iframe.contentWindow;
    const tw: TiddlyWiki | undefined = (win as unknown as { $tw?: TiddlyWiki } | null)?.$tw;
    if (!tw || !tw.saverHandler || !Array.isArray(tw.saverHandler.savers)) {
      setTimeout(attempt, 600);
      return;
    }
    tw.saverHandler.savers.push({
      info: { name: 'tiddly-drive-2', priority: 2000, capabilities: ['save', 'autosave'] },
      save: async (text: string, method: string, callback: (err?: string) => void) => {
        if (opts.disableSave?.()) {
          callback('Saving disabled');
          return false;
        }
        if (method === 'autosave' && opts.autosaveEnabled && !opts.autosaveEnabled()) {
          callback('Autosave disabled');
          return false;
        }
        try {
          await save(text, { autosave: method === 'autosave' });
          // Reset change counter so TW clears dirty indicator.
          try {
            const sh = tw.saverHandler;
            if (sh) {
              sh.numChanges = 0;
              sh.updateDirtyStatus();
            }
          } catch (err) {
            console.warn('[td2/drive] failed to reset TW dirty status', err);
          }
          callback();
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
  let token = await getAccessToken();
  const boundary = 'td2-' + Math.random().toString(36).slice(2);
  const metadata = { name: currentFileName };
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    '',
    html,
    `--${boundary}--`,
    ''
  ].join('\r\n');
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': `multipart/related; boundary=${boundary}`,
    ...(etag ? { 'If-Match': etag } : {})
  };

  /**
   * Performs the multipart PATCH upload to Drive.
   *
   * @returns Fetch Response of the upload
   */
  const doUpload = async (): Promise<Response> =>
    fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${currentFileId}?uploadType=multipart&supportsAllDrives=true&fields=id,modifiedTime,version`,
      { method: 'PATCH', headers: { ...headers, Authorization: `Bearer ${token}` }, body }
    );

  let resp = await doUpload();
  // If insufficient permissions try once more after forcing consent (maybe scope changed recently)
  if (resp.status === 403) {
    try {
      token = await getAccessToken({ prompt: 'consent' });
      resp = await doUpload();
    } catch (_) {
      // ignore; will fall through to generic handler
    }
  }
  if (resp.status === 412 || resp.status === 409) {
    showError('Conflict Detected', 'The file changed on Drive. Reload before saving.');
    return false;
  }
  if (!resp.ok) {
    let detail = '';
    try {
      detail = await resp.text();
    } catch (err) {
      console.warn('[td2/drive] save 403 re-request token failed', err);
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
  etag = resp.headers.get('etag') || etag;
  showToast(autosave ? 'Autosaved' : 'Saved');
  return true;
};
