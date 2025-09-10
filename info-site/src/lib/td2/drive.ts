import { getAccessToken } from './auth';
import { showError, showToast } from './ui';

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
  const metaUrl = `https://www.googleapis.com/drive/v3/files/${currentFileId}?fields=id,name,mimeType,modifiedTime,version`;
  const metaResp = await fetch(metaUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!metaResp.ok) {
    let body = '';
    try {
      body = await metaResp.text();
    } catch {}
    console.warn('[td2/drive] metadata fetch failed', metaResp.status, body);
    if (metaResp.status === 404) {
      throw new Error(
        'File not found or not accessible with current scope (drive.file). Try: 1) Confirm correct Google account, 2) Use real Drive "Open with" flow, or 3) Temporarily broaden scope to drive.readonly for debugging.'
      );
    }
    throw new Error('Metadata fetch failed: ' + metaResp.status + ' ' + body);
  }
  etag = metaResp.headers.get('etag');
  const meta = await metaResp.json();
  currentFileName = meta.name || currentFileName;
  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${currentFileId}?alt=media`;
  const fileResp = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!fileResp.ok) {
    let body = '';
    try {
      body = await fileResp.text();
    } catch {}
    console.warn('[td2/drive] download failed', fileResp.status, body);
    throw new Error('File download failed: ' + fileResp.status + ' ' + body);
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
    throw new Error('Save failed ' + resp.status);
  }
  etag = resp.headers.get('etag') || etag;
  showToast(autosave ? 'Autosaved' : 'Saved');
  return true;
}
