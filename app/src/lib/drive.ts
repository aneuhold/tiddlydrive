import { getAccessToken } from './auth.js';
import { showError, showToast } from './ui.js';

let currentFileId: string | null = null;
let currentFileName = 'wiki.html';
let etag: string | null = null;

export interface LoadResult {
  meta: any;
}

/**
 *
 */
export function parseState(): any | null {
  const params = new URLSearchParams(location.search);
  const raw = params.get('state');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 *
 * @param iframe
 */
export async function loadFile(iframe: HTMLIFrameElement): Promise<LoadResult> {
  const state = parseState();
  if (!state || !Array.isArray(state.ids) || state.ids.length !== 1)
    throw new Error('Missing or multi file state');
  currentFileId = state.ids[0];
  const token = await getAccessToken({ interactive: true });
  // Include supportsAllDrives/includeItemsFromAllDrives so files in shared drives are accessible.
  const metaUrl = `https://www.googleapis.com/drive/v3/files/${currentFileId}?fields=id,name,mimeType,modifiedTime,version&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const metaResp = await fetch(metaUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!metaResp.ok) {
    let body = '';
    try {
      body = await metaResp.text();
    } catch {}
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
  const meta = await metaResp.json();
  currentFileName = meta.name || currentFileName;
  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${currentFileId}?alt=media&supportsAllDrives=true`;
  const fileResp = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!fileResp.ok) {
    let body = '';
    try {
      body = await fileResp.text();
    } catch {}
    console.warn('[td2/drive] download failed', fileResp.status, body);
    throw new Error('File download failed: ' + fileResp.status.toString() + ' ' + body);
  }
  const text = await fileResp.text();
  iframe.srcdoc = text;
  showToast('File loaded');
  return { meta };
}

/**
 *
 * @param html
 * @param root0
 * @param root0.autosave
 */
export async function save(html: string, { autosave = false } = {}) {
  if (!currentFileId) throw new Error('File not loaded');
  const token = await getAccessToken();
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
    'Content-Type': `multipart/related; boundary=${boundary}`
  };
  if (etag) headers['If-Match'] = etag;
  const resp = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${currentFileId}?uploadType=multipart&fields=id,modifiedTime,version`,
    { method: 'PATCH', headers, body }
  );
  if (resp.status === 412 || resp.status === 409) {
    showError('Conflict Detected', 'The file changed on Drive. Reload before saving.');
    return false;
  }
  if (!resp.ok) {
    showToast('Save failed');
    throw new Error('Save failed ' + resp.status.toString());
  }
  etag = resp.headers.get('etag') || etag;
  showToast(autosave ? 'Autosaved' : 'Saved');
  return true;
}
