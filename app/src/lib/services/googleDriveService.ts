import { getAccessToken } from '$lib/auth.js';
import googleDriveRepository from '$lib/repositories/googleDriveRepository';
import type { SaverOptions } from '$lib/services/tiddlyWikiService';
import tiddlyWikiService from '$lib/services/tiddlyWikiService';
import type { DriveFileMeta, DriveOpenState, SaveOptions } from '$lib/types';
import { showError, showToast } from '$lib/ui/UiHost.svelte';

export interface LoadResult {
  meta: DriveFileMeta;
}

/**
 * Service class encapsulating Google Drive file operations and TiddlyWiki saver integration.
 */
class GoogleDriveService {
  private currentFileId: string | null = null;
  private currentFileName = 'wiki.html';
  private currentContentHash: string | null = null;
  private saving = false;
  private pendingSave: { html: string; autosave: boolean } | null = null;
  private pendingResolvers: Array<(ok: boolean) => void> = [];

  /**
   * When true, the next save will bypass the version preflight (used by "Save Anyway")
   */
  private forceNextSave = false;

  /**
   * Parses the Google Drive "state" URL parameter when opened via Drive UI.
   *
   * @returns The parsed state object or null if missing/invalid
   */
  parseState(): DriveOpenState | null {
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
  }

  /**
   * Loads a Drive-hosted HTML wiki file into an iframe and returns metadata.
   *
   * @param iframe IFrame element where the wiki is rendered
   * @returns Promise containing the Drive file metadata
   */
  async loadFile(iframe: HTMLIFrameElement): Promise<LoadResult> {
    const state = this.parseState();
    if (!state || !Array.isArray(state.ids) || state.ids.length !== 1)
      throw new Error('Missing or multi file state');
    this.currentFileId = state.ids[0];
    const token = await getAccessToken();

    // Get file metadata
    const meta = await googleDriveRepository.getFileMetadata(this.currentFileId, token);
    this.currentFileName = meta.name || this.currentFileName;

    // Download file content
    const text = await googleDriveRepository.downloadFileContent(this.currentFileId, token);

    // Track the content hash for conflict detection
    this.currentContentHash = this.generateContentHash(text);

    iframe.srcdoc = text;
    showToast('File loaded');
    return { meta };
  }

  /**
   * Registers this service's save functionality with TiddlyWiki's saver pipeline.
   *
   * @param iframe The iframe containing the wiki
   * @param opts Saver controls
   */
  registerWikiSaver = (iframe: HTMLIFrameElement, opts: SaverOptions): void => {
    tiddlyWikiService.registerSaver(iframe, opts, {
      name: 'tiddly-drive-2',
      priority: 2000,
      saveFunction: this.save,
      onSaveSuccess: (tw, prefs) => {
        // If any page customizations (like favicon) changed, reflect them
        tiddlyWikiService.applyPageCustomizationsFromWiki(prefs, tw);
      }
    });
  };

  /**
   * Saves the provided HTML content back to the current Drive file.
   *
   * @param html The full HTML content of the wiki
   * @param root0 Save options including autosave flag
   * @param root0.autosave Whether the save is an autosave
   * @returns Promise resolving to true on success, false to fall back to TiddlyWiki's built-in savers
   */
  save = async (html: string, { autosave = false }: SaveOptions = {}): Promise<boolean> => {
    if (!this.currentFileId) throw new Error('File not loaded');

    // Check if we're online - if not, fall back to TiddlyWiki's built-in savers
    if (!navigator.onLine) {
      console.log('[td2/drive] Offline detected, falling back to built-in TiddlyWiki savers');
      showToast('Offline - saved locally');
      return false;
    }

    // Queue latest save request and process with single-flight & debounce (for autosave).
    return new Promise<boolean>((resolve) => {
      this.pendingSave = { html, autosave };
      this.pendingResolvers.push(resolve);
      void this.processSaveQueue();
    });
  };

  /**
   * Runs the queued save operations one at a time, coalescing rapid autosaves.
   */
  processSaveQueue = async (): Promise<void> => {
    if (this.saving) return;
    while (this.pendingSave) {
      this.saving = true;
      // Snapshot current pending payload and clear queue slot
      const { html, autosave } = this.pendingSave;
      this.pendingSave = null;
      // Collect resolvers waiting for this upload
      const resolvers = this.pendingResolvers.splice(0);
      // Debounce autosaves slightly to coalesce bursts
      if (autosave) {
        await new Promise((r) => setTimeout(r, 800));
        // If newer content arrived during debounce, the loop will see it in the while check
      }
      let ok = false;
      try {
        ok = await this.uploadHtmlMedia(html);
      } catch (e) {
        // Check if this is a network error - if so, fall back to TiddlyWiki's built-in savers
        if (googleDriveRepository.isNetworkError(e)) {
          console.log(
            '[td2/drive] Network error detected, falling back to built-in TiddlyWiki savers'
          );
          showToast('Network error - saved locally');
          ok = false;
        } else {
          console.warn('[td2/drive] upload error', e);
          ok = false;
        }
      }
      resolvers.forEach((r: (ok: boolean) => void) => {
        r(ok);
      });
      this.saving = false;
    }
  };

  /**
   * Uploads html using media upload (simpler and robust) with preflight version check and permissions retry.
   *
   * @param html The full HTML content to upload
   * @returns Promise resolving to true on success, false when a handled conflict occurred
   */
  uploadHtmlMedia = async (html: string): Promise<boolean> => {
    if (!this.currentFileId) throw new Error('File not loaded');
    const token = await getAccessToken();

    // Respect a global force-save request (e.g., from "Save Anyway") and reset it
    const forcedSave = this.forceNextSave;
    this.forceNextSave = false;

    if (!forcedSave) {
      const hasConflicts = await this.hasFileConflicts(token);
      if (hasConflicts) return false;
    }

    try {
      await googleDriveRepository.uploadFileContent(this.currentFileId, html, token);

      // Update our local content hash tracker after successful upload
      const newHash = this.generateContentHash(html);
      this.currentContentHash = newHash;
      showToast('Saved');
      return true;
    } catch (error) {
      const errorMessage = (error as Error).message;
      console.warn('[td2/drive] upload error', error);

      if (errorMessage.includes('Permission Denied')) {
        showError(
          'Permission Denied',
          'The app token lacks write access for this file. If you manually crafted the state parameter, Drive may not have granted drive.file access. Open the file via Google Drive "Open with" (after install) or temporarily use a broader scope for testing.'
        );
      } else {
        showToast('Save failed');
      }
      throw error;
    }
  };

  /**
   * Detects if the file has been modified on Drive since we loaded or last saved it.
   *
   * Content hash conflict logic:
   * - When we load a file, we store the hash of its content
   * - When we save, we update our stored hash to match the uploaded content
   * - Before saving, we download the current file content and compare its hash with our stored hash
   * - If they differ, someone else modified the file and we have a conflict
   *
   * @param token The current OAuth token
   * @returns Promise resolving to true if a conflict was detected and handled (save should abort), false if no conflict
   */
  hasFileConflicts = async (token: string) => {
    if (!this.currentFileId || !this.currentContentHash) return false;

    try {
      // Download current file content and metadata to check for modifications
      const [currentContent, serverMeta] = await Promise.all([
        googleDriveRepository.downloadFileContent(this.currentFileId, token),
        googleDriveRepository.getFileMetadata(this.currentFileId, token)
      ]);
      const serverContentHash = this.generateContentHash(currentContent);

      // Check for content conflicts:
      // - If server content hash differs from our stored hash, someone else modified the file
      if (serverContentHash !== this.currentContentHash) {
        console.warn(
          `[td2/drive] content conflict detected: local=${this.currentContentHash} server=${serverContentHash}`
        );

        // Format the last modified time for display
        let lastModifiedText = '';
        if (serverMeta.modifiedTime) {
          const modifiedDate = new Date(serverMeta.modifiedTime);
          lastModifiedText = `\nLast modified: ${modifiedDate.toLocaleString()}`;
        }

        showError(
          'Conflict Detected',
          `The file changed on Google Drive. Reload before saving.${lastModifiedText}`,
          {
            text: 'Save Anyway',
            fn: async () => {
              try {
                // Bypass conflict preflight on the next save
                this.forceNextSave = true;
                // Ask TiddlyWiki to perform a normal save; our saver will handle the force flag
                await tiddlyWikiService.saveWiki();
              } catch (e) {
                console.warn('[td2/drive] forced save failed', e);
              }
            }
          }
        );
        return true;
      }
    } catch (err) {
      // If preflight fails (network/perm), continue and let upload path handle errors.
      console.warn('[td2/drive] content preflight failed', err);
    }
    return false;
  };

  /**
   * Generate a simple hash of content for conflict detection (legacy method)
   *
   * @param content The content to hash
   * @returns A hash string representation
   */
  private generateContentHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    const result = hash.toString(36);
    return result;
  }
}

const googleDriveService = new GoogleDriveService();
export default googleDriveService;
