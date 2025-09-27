import { authService } from '$lib/services/authService';
import type { DriveFileMeta, GapiResponse, GoogleAPIClient } from '$lib/types';

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
      this.getClient().request<DriveFileMeta>({
        path: `/drive/v3/files/${encodeURIComponent(fileId)}`,
        method: 'GET',
        params: {
          fields: 'id,name,mimeType,modifiedTime,version',
          ...this.sharedDriveParams
        }
      });

    try {
      const resp: GapiResponse<DriveFileMeta> = await request();
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
    this.ensureGapiToken(token);

    const request = () =>
      this.getClient().request<string>({
        path: `/drive/v3/files/${encodeURIComponent(fileId)}`,
        method: 'GET',
        params: {
          alt: 'media',
          ...this.sharedDriveParamsOnly
        }
      });

    try {
      const resp: GapiResponse<string> = await request();
      // For media downloads, prefer the raw `.body` string
      return resp.body;
    } catch (err: unknown) {
      if (this.isAuthError(err)) {
        const newToken = await authService.getAccessToken();
        this.ensureGapiToken(newToken);
        try {
          const retryResp: GapiResponse<string> = await request();
          return retryResp.body;
        } catch (retryErr: unknown) {
          throw this.normalizeError(retryErr, 'File download');
        }
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
      this.getClient().request<DriveFileMeta>({
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
   * Determines whether an error thrown by gapi is likely an auth error.
   *
   * @param err The error thrown by the Google API client
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
    return code === 401 || code === 403 || /unauthorized|forbidden/i.test(msg);
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
  private getClient(): NonNullable<GoogleAPIClient> {
    const client = window.gapi?.client;
    if (!client) {
      throw new Error('Google API client not available');
    }
    return client;
  }
}

const googleDriveRepository = new GoogleDriveRepository();
export default googleDriveRepository;
