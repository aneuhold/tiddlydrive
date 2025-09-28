import { authService } from '$lib/services/authService';
import type { DriveFileMeta } from '$lib/types';

/**
 * Repository class for handling low-level Google Drive API operations.
 * Encapsulates URLs, HTTP requests, and response handling.
 */
class GoogleDriveRepository {
  // Common query parameters for Shared Drive support
  private readonly sharedDriveParams = {
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  } as const;
  private readonly sharedDriveParamsOnly = {
    supportsAllDrives: true
  } as const;

  /**
   * Fetches file metadata from Google Drive API.
   *
   * @param fileId The Google Drive file ID
   * @param token OAuth access token
   * @returns Promise resolving to the file metadata
   */
  async getFileMetadata(fileId: string, token: string): Promise<DriveFileMeta> {
    // Ensure gapi has a token set for subsequent calls
    this.ensureGapiToken(token);

    const request = () =>
      this.getClient().request({
        path: `/drive/v3/files/${encodeURIComponent(fileId)}`,
        method: 'GET',
        params: {
          fields: 'id,name,mimeType,modifiedTime,version',
          ...this.sharedDriveParams
        }
      });

    try {
      const resp = await request();
      return resp.result;
    } catch (err: unknown) {
      // Attempt one silent token refresh on auth failures, then retry
      if (this.isAuthError(err)) {
        const newToken = await authService.getAccessToken();
        this.ensureGapiToken(newToken);
        try {
          const retryResp = await request();
          return retryResp.result;
        } catch (retryErr: unknown) {
          throw this.normalizeError(retryErr, 'Metadata fetch');
        }
      }
      // Not an auth error: throw normalized
      throw this.normalizeError(err, 'Metadata fetch');
    }
  }

  /**
   * Downloads file content from Google Drive API.
   *
   * @param fileId The Google Drive file ID
   * @param token OAuth access token
   * @returns Promise resolving to the file content as text
   */
  async downloadFileContent(fileId: string, token: string): Promise<string> {
    try {
      const content = await this.downloadWithDirectFetch(fileId, token);
      return content;
    } catch (err: unknown) {
      if (this.isAuthError(err)) {
        // Token expired, try to refresh
        console.log('[GoogleDriveRepository] Token expired, refreshing and retrying');
        const newToken = await authService.getAccessToken();
        const content = await this.downloadWithDirectFetch(fileId, newToken);
        return content;
      }
      throw this.normalizeError(err, 'File download');
    }
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
    this.ensureGapiToken(token);

    const request = () =>
      this.getClient().request({
        // Note: uploads use the upload endpoint implicitly when using gapi with `uploadType` param
        path: `/upload/drive/v3/files/${encodeURIComponent(fileId)}`,
        method: 'PATCH',
        params: {
          uploadType: 'media',
          fields: 'id,modifiedTime,version',
          ...this.sharedDriveParamsOnly
        },
        headers: {
          'Content-Type': 'text/html; charset=UTF-8'
        },
        body: content
      });

    try {
      const resp = await request();
      return resp.result;
    } catch (err: unknown) {
      if (this.isAuthError(err)) {
        const newToken = await authService.getAccessToken();
        this.ensureGapiToken(newToken);
        try {
          const retryResp = await request();
          return retryResp.result;
        } catch (retryErr: unknown) {
          throw this.normalizeError(retryErr, 'Save');
        }
      }
      throw this.normalizeError(err, 'Save');
    }
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
   * Determines whether an error is likely an auth error.
   * Handles both gapi.client errors and fetch() errors.
   *
   * @param err The error thrown by either gapi.client or fetch()
   * @returns True if the error contains 401/403 semantics
   */
  private isAuthError(err: unknown): boolean {
    const e = err as {
      message?: string;
      status?: number;
      result?: { error?: { code?: number; message?: string } };
    } | null;
    const msg = (e && e.message) || '';
    const code = (e && (e.result?.error?.code ?? e.status)) ?? undefined;

    // Check structured error codes first (gapi errors)
    if (code === 401 || code === 403) {
      return true;
    }

    // Check message content for both gapi and fetch errors
    return /unauthorized|forbidden|401|403/i.test(msg);
  }

  /**
   * Normalizes various error shapes coming from gapi to a readable Error.
   *
   * @param err The original error thrown by the Google API client
   * @param operation A short label for the operation being performed
   * @returns A normalized Error with helpful message and guidance
   */
  private normalizeError(err: unknown, operation: string): Error {
    const e = err as {
      status?: number;
      statusText?: string;
      body?: string;
      result?: { error?: { code?: number; message?: string } };
    } | null;
    const code = (e && (e.result?.error?.code ?? e.status)) ?? undefined;
    const statusText = (e && (e.result?.error?.message ?? e.statusText)) ?? '';
    const body = (e && e.body) ?? '';
    const codePart = code ? ` ${String(code)}` : '';
    const msg = `[td2/drive] ${operation} failed${codePart} ${statusText || body || ''}`;

    if (code === 404) {
      const hints = [
        'Confirm the file ID is correct (no extra characters).',
        'Ensure you are logged into the same Google account that owns / can access the file.',
        'If the file lives in a Shared Drive, Shared Drive support is enabled (retry after refresh).',
        'If you are manually crafting the ?state= parameter while using only the drive.file scope, the token may NOT grant this file.'
      ];
      return new Error('File not found (404). Possible causes:\n- ' + hints.join('\n- '));
    }
    if (code === 401) {
      return new Error(
        'Unauthorized: The OAuth token has expired or is invalid. Please try again.'
      );
    }
    if (code === 403) {
      return new Error(
        'Permission Denied: The app token lacks access for this file. If manually crafting the state parameter, Drive may not have granted drive.file access. Open the file via Google Drive "Open with" or use a broader scope temporarily for testing.'
      );
    }
    return new Error(msg.trim());
  }

  /**
   * Downloads file content using direct fetch() instead of gapi.client.
   *
   * This method bypasses Google's gapi.client library to avoid performance issues.
   * During investigation, we discovered that gapi.client.request() was causing
   * 450ms+ blocking of the main UI thread after the network request completed.
   * The blocking occurred during Google's internal processing of the response,
   * likely involving large string operations, memory copying, or internal state
   * management within the gapi library.
   *
   * By using direct fetch(), we:
   * - Eliminate the 450ms main thread blocking entirely
   * - Achieve dramatically better perceived performance
   * - Maintain all functionality including shared drive support
   * - Keep the same error handling and retry logic
   *
   * This approach trades the convenience of gapi.client's built-in features
   * (automatic token management, request formatting, etc.) for significantly
   * better performance in large file operations.
   *
   * @param fileId The Google Drive file ID
   * @param token OAuth access token
   * @returns Promise resolving to file content as text
   */
  private async downloadWithDirectFetch(fileId: string, token: string): Promise<string> {
    // Build URL with shared drive support parameters
    const params = new URLSearchParams({
      alt: 'media',
      supportsAllDrives: 'true'
    });

    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${params}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'text/html'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const content = await response.text();
    return content;
  }

  /**
   * Ensures the provided token is set on gapi.client for subsequent calls.
   *
   * @param token OAuth access token to set
   */
  private ensureGapiToken(token: string): void {
    try {
      const client = this.getClient();
      const existing = client.getToken();
      if (!existing || existing.access_token !== token) {
        client.setToken({ access_token: token });
      }
    } catch {
      // Best-effort only
    }
  }

  /**
   * Provides a non-null Google API client instance or throws if unavailable.
   *
   * @returns The initialized `gapi.client` instance
   */
  private getClient() {
    const client = window.gapi?.client;
    if (!client) {
      throw new Error('Google API client not available');
    }
    return client;
  }
}

const googleDriveRepository = new GoogleDriveRepository();
export default googleDriveRepository;
