import { getAccessToken } from '$lib/auth.js';
import type { DriveFileMeta } from '$lib/types';

/**
 * Repository class for handling low-level Google Drive API operations.
 * Encapsulates URLs, HTTP requests, and response handling.
 */
class GoogleDriveRepository {
  private readonly baseUrl = 'https://www.googleapis.com/drive/v3';
  private readonly uploadUrl = 'https://www.googleapis.com/upload/drive/v3';

  /**
   * Fetches file metadata from Google Drive API.
   *
   * @param fileId The Google Drive file ID
   * @param token OAuth access token
   * @returns Promise resolving to the file metadata
   */
  async getFileMetadata(fileId: string, token: string): Promise<DriveFileMeta> {
    const url = `${this.baseUrl}/files/${fileId}?fields=id,name,mimeType,modifiedTime,version&supportsAllDrives=true&includeItemsFromAllDrives=true`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
      let body = '';
      try {
        body = await response.text();
      } catch (err) {
        console.warn('[td2/drive] metadata error body read failed', err);
      }
      console.warn('[td2/drive] metadata fetch failed', response.status, body);

      if (response.status === 404) {
        // Heuristics: common causes while developing without Marketplace "Open with" flow
        const hints = [
          'Confirm the file ID is correct (no extra characters).',
          'Ensure you are logged into the same Google account that owns / can access the file.',
          'If the file lives in a Shared Drive, supportsAllDrives=true is now added (retry after refresh).',
          'If you are manually crafting the ?state= parameter while using only the drive.file scope, the token may NOT grant this file (drive.file only covers files the user opened via the official Drive UI/Open-with or a Picker).'
        ];
        throw new Error('File not found (404). Possible causes:\n- ' + hints.join('\n- '));
      }
      throw new Error('Metadata fetch failed: ' + response.status.toString() + ' ' + body);
    }

    return (await response.json()) as DriveFileMeta;
  }

  /**
   * Downloads file content from Google Drive API.
   *
   * @param fileId The Google Drive file ID
   * @param token OAuth access token
   * @returns Promise resolving to the file content as text
   */
  async downloadFileContent(fileId: string, token: string): Promise<string> {
    const url = `${this.baseUrl}/files/${fileId}?alt=media&supportsAllDrives=true`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
      let body = '';
      try {
        body = await response.text();
      } catch (err) {
        console.warn('[td2/drive] download error body read failed', err);
      }
      console.warn('[td2/drive] download failed', response.status, body);
      throw new Error('File download failed: ' + response.status.toString() + ' ' + body);
    }

    return await response.text();
  }

  /**
   * Uploads file content to Google Drive using media upload.
   *
   * @param fileId The Google Drive file ID
   * @param content The content to upload
   * @param token OAuth access token
   * @returns Promise resolving to the updated file metadata
   */
  async uploadFileContent(fileId: string, content: string, token: string): Promise<DriveFileMeta> {
    const url = `${this.uploadUrl}/files/${fileId}?uploadType=media&supportsAllDrives=true&fields=id,modifiedTime,version`;

    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'text/html; charset=UTF-8'
        // No ETag precondition, because Google doesn't provide that. We use version instead.
      },
      body: content
    });

    if (response.status === 403) {
      // Try to refresh token with consent prompt
      try {
        const newToken = await getAccessToken({ prompt: 'consent' });
        const retryResponse = await fetch(url, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${newToken}`,
            'Content-Type': 'text/html; charset=UTF-8'
          },
          body: content
        });

        if (!retryResponse.ok) {
          throw new Error(`Retry upload failed: ${retryResponse.status}`);
        }

        return (await retryResponse.json()) as DriveFileMeta;
      } catch (_retryError) {
        // Fall through to handle original 403 error
      }
    }

    if (!response.ok) {
      let detail = '';
      try {
        detail = await response.text();
      } catch (_err) {
        /* ignore */
      }
      console.warn('[td2/drive] save failed', response.status, detail);

      if (response.status === 403) {
        throw new Error(
          'Permission Denied: The app token lacks write access for this file. If you manually crafted the state parameter, Drive may not have granted drive.file access. Open the file via Google Drive "Open with" (after install) or temporarily use a broader scope for testing.'
        );
      }
      throw new Error('Save failed ' + response.status.toString() + ' ' + detail);
    }

    return (await response.json()) as DriveFileMeta;
  }

  /**
   * Gets the current version of a file for conflict detection.
   *
   * @param fileId The Google Drive file ID
   * @param token OAuth access token
   * @returns Promise resolving to the file metadata with version info
   */
  async getFileVersion(fileId: string, token: string): Promise<DriveFileMeta> {
    const url = `${this.baseUrl}/files/${fileId}?fields=version&supportsAllDrives=true&includeItemsFromAllDrives=true`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
      throw new Error(`Version check failed: ${response.status}`);
    }

    return (await response.json()) as DriveFileMeta;
  }

  /**
   * Checks if an error is likely a network-related issue.
   *
   * @param error The error to check
   * @returns True if the error appears to be network-related
   */
  isNetworkError(error: unknown): boolean {
    if (!error) return false;

    const errorMessage = ((error as Error).message || '').toLowerCase();
    const errorName = ((error as Error).name || '').toLowerCase();

    // Common network error indicators
    const networkErrorPatterns = [
      'network error',
      'fetch failed',
      'failed to fetch',
      'network request failed',
      'connection refused',
      'connection timeout',
      'timeout',
      'no internet',
      'offline',
      'unreachable',
      'dns'
    ];

    return networkErrorPatterns.some(
      (pattern) => errorMessage.includes(pattern) || errorName.includes(pattern)
    );
  }
}

const googleDriveRepository = new GoogleDriveRepository();
export default googleDriveRepository;
