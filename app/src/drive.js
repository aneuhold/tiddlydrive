// drive.js - Drive v3 file operations
import { getAccessToken } from './auth.js';
import { parseStateParam, showToast, showErrorDialog } from './ui.js';

let fileId = null;
let fileName = 'wiki.html';
let etag = null; // track for conflict detection

export function getFileId() { return fileId; }

export async function loadFileIntoIframe(iframe) {
  const state = parseStateParam();
  if (!state || !Array.isArray(state.ids) || state.ids.length !== 1) {
    throw new Error('No file selected or multiple selection not supported.');
  }
  fileId = state.ids[0];
  const token = await getAccessToken();
  // Get metadata first for name + etag
  const metaResp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,modifiedTime,version`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!metaResp.ok) throw new Error('Failed metadata: ' + metaResp.status);
  etag = metaResp.headers.get('etag');
  const meta = await metaResp.json();
  fileName = meta.name || fileName;

  const fileResp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!fileResp.ok) throw new Error('Failed file download: ' + fileResp.status);
  const text = await fileResp.text();
  iframe.srcdoc = text;
  showToast('File loaded');
  return { meta };
}

export async function saveContent(htmlText, { silent = false, autosave = false } = {}) {
  if (!fileId) throw new Error('File not loaded');
  const token = await getAccessToken();
  const boundary = '-------td2-' + Math.random().toString(36).slice(2);
  const metadata = { name: fileName };
  const bodyParts = [
    '',
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    '',
    htmlText,
    `--${boundary}--`,
    ''
  ];
  const multipartBody = bodyParts.join('\r\n');
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': `multipart/related; boundary=${boundary}`
  };
  if (etag) headers['If-Match'] = etag;
  const resp = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id,modifiedTime,version`, {
    method: 'PATCH',
    headers,
    body: multipartBody
  });
  if (resp.status === 412 || resp.status === 409) {
    showErrorDialog('Conflict Detected', 'The file has changed on Drive. Please reload before saving again.');
    return false;
  }
  if (!resp.ok) {
    const t = await resp.text();
    showToast('Save failed');
    throw new Error('Save error: ' + resp.status + ' ' + t);
  }
  etag = resp.headers.get('etag') || etag; // update if present
  if (!silent) showToast(autosave ? 'Autosaved' : 'Saved');
  return true;
}
