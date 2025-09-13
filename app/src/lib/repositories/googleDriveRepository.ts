import { getAccessToken } from '$lib/auth.js';
import type { DriveFileMeta } from '$lib/types';

/**
 * Repository class for handling low-level Google Drive API operations.
 * Encapsulates URLs, HTTP requests, and response handling.
 */
class GoogleDriveRepository {
  private readonly baseUrl = 'https://www.googleapis.com/drive/v3';
  private readonly uploadUrl = 'https://www.googleapis.com/upload/drive/v3';

  // Common query parameters for Shared Drive support
  private readonly sharedDriveParams = 'supportsAllDrives=true&includeItemsFromAllDrives=true';
  private readonly sharedDriveParamsOnly = 'supportsAllDrives=true';

  /**
   * Fetches file metadata from Google Drive API.
   *
   * @param fileId The Google Drive file ID
   * @param token OAuth access token
   * @returns Promise resolving to the file metadata
   */
  async getFileMetadata(fileId: string, token: string): Promise<DriveFileMeta> {
    const url = `${this.baseUrl}/files/${fileId}?fields=id,name,mimeType,modifiedTime,version&${this.sharedDriveParams}`;
    const fetchOptions = {
      headers: { Authorization: `Bearer ${token}` }
    };

    const response = await this.fetchWithAuthRetry(url, fetchOptions, 'metadata fetch');

    // If retry succeeded, return the result
    if (response && response.ok) {
      return (await response.json()) as DriveFileMeta;
    }

    // If retry failed or wasn't needed, handle the original response
    const originalResponse = response || (await fetch(url, fetchOptions));

    if (!originalResponse.ok) {
      let body = '';
      try {
        body = await originalResponse.text();
      } catch (err) {
        console.warn('[td2/drive] metadata error body read failed', err);
      }
      console.warn('[td2/drive] metadata fetch failed', originalResponse.status, body);

      if (originalResponse.status === 404) {
        // Heuristics: common causes while developing without Marketplace "Open with" flow
        const hints = [
          'Confirm the file ID is correct (no extra characters).',
          'Ensure you are logged into the same Google account that owns / can access the file.',
          'If the file lives in a Shared Drive, Shared Drive support is enabled (retry after refresh).',
          'If you are manually crafting the ?state= parameter while using only the drive.file scope, the token may NOT grant this file (drive.file only covers files the user opened via the official Drive UI/Open-with or a Picker).'
        ];
        throw new Error('File not found (404). Possible causes:\n- ' + hints.join('\n- '));
      }
      throw new Error('Metadata fetch failed: ' + originalResponse.status.toString() + ' ' + body);
    }

    return (await originalResponse.json()) as DriveFileMeta;
  }

  /**
   * Downloads file content from Google Drive API.
   *
   * @param fileId The Google Drive file ID
   * @param token OAuth access token
   * @returns Promise resolving to the file content as text
   */
  async downloadFileContent(fileId: string, token: string): Promise<string> {
    const url = `${this.baseUrl}/files/${fileId}?alt=media&${this.sharedDriveParamsOnly}`;
    const fetchOptions = {
      headers: { Authorization: `Bearer ${token}` }
    };

    const response = await this.fetchWithAuthRetry(url, fetchOptions, 'download');

    // If retry succeeded, return the result
    if (response && response.ok) {
      return await response.text();
    }

    // If retry failed or wasn't needed, handle the original response
    const originalResponse = response || (await fetch(url, fetchOptions));

    if (!originalResponse.ok) {
      let body = '';
      try {
        body = await originalResponse.text();
      } catch (err) {
        console.warn('[td2/drive] download error body read failed', err);
      }
      console.warn('[td2/drive] download failed', originalResponse.status, body);
      throw new Error('File download failed: ' + originalResponse.status.toString() + ' ' + body);
    }

    return await originalResponse.text();
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
    const url = `${this.uploadUrl}/files/${fileId}?uploadType=media&${this.sharedDriveParamsOnly}&fields=id,modifiedTime,version`;
    const fetchOptions = {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'text/html; charset=UTF-8'
        // No ETag precondition, because Google doesn't provide that. We use version instead.
      },
      body: content
    };

    const response = await this.fetchWithAuthRetry(url, fetchOptions, 'upload');

    // If retry succeeded, return the result
    if (response && response.ok) {
      return (await response.json()) as DriveFileMeta;
    }

    // If retry failed or wasn't needed, handle the original response
    const originalResponse = response || (await fetch(url, fetchOptions));

    if (!originalResponse.ok) {
      let detail = '';
      try {
        detail = await originalResponse.text();
      } catch (_err) {
        /* ignore */
      }
      console.warn('[td2/drive] save failed', originalResponse.status, detail);

      if (originalResponse.status === 401) {
        throw new Error(
          'Unauthorized: The OAuth token has expired or is invalid. Please try again.'
        );
      }
      if (originalResponse.status === 403) {
        throw new Error(
          'Permission Denied: The app token lacks write access for this file. If you manually crafted the state parameter, Drive may not have granted drive.file access. Open the file via Google Drive "Open with" (after install) or temporarily use a broader scope for testing.'
        );
      }
      throw new Error('Save failed ' + originalResponse.status.toString() + ' ' + detail);
    }

    return (await originalResponse.json()) as DriveFileMeta;
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

  /**
   * Retries a fetch request with a fresh token when encountering auth errors (401/403).
   * Uses silent token refresh to avoid prompting the user unnecessarily.
   *
   * @param url The URL to retry
   * @param fetchOptions The original fetch options (method, headers, body, etc.)
   * @param operation Description of the operation for error messages
   * @returns Promise resolving to the Response object
   */
  private async retryWithFreshToken(
    url: string,
    fetchOptions: RequestInit,
    operation: string
  ): Promise<Response> {
    // First try silent refresh (no prompt) - this should handle most token expirations
    const newToken = await getAccessToken();
    const retryOptions = {
      ...fetchOptions,
      headers: {
        ...(fetchOptions.headers as Record<string, string>),
        Authorization: `Bearer ${newToken}`
      }
    };

    const retryResponse = await fetch(url, retryOptions);
    if (!retryResponse.ok) {
      throw new Error(`Retry ${operation} failed: ${retryResponse.status}`);
    }

    return retryResponse;
  }

  /**
   * Performs a fetch request with automatic retry on auth errors.
   * Returns the successful response or falls through to original error handling.
   *
   * @param url The URL to fetch
   * @param fetchOptions The fetch options
   * @param operation Description for error messages
   * @returns Promise resolving to Response or null if retry failed
   */
  private async fetchWithAuthRetry(
    url: string,
    fetchOptions: RequestInit,
    operation: string
  ): Promise<Response | null> {
    const response = await fetch(url, fetchOptions);

    if (response.status === 401 || response.status === 403) {
      // Try to refresh token with consent prompt for both unauthorized (401) and forbidden (403)
      try {
        return await this.retryWithFreshToken(url, fetchOptions, operation);
      } catch (_retryError) {
        // Fall through to handle original error
        return null;
      }
    }

    return response;
  }
}

const googleDriveRepository = new GoogleDriveRepository();
export default googleDriveRepository;
