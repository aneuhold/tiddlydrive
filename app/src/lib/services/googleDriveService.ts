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
  private currentVersion: number | null = null;
  private wikiSaverRegistered = false;
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

    // Track the Drive file version for simple conflict detection (string -> integer)
    this.currentVersion = meta.version ? Number.parseInt(meta.version) : null;
    this.currentFileName = meta.name || this.currentFileName;

    // Download file content
    const text = await googleDriveRepository.downloadFileContent(this.currentFileId, token);

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
    if (this.wikiSaverRegistered) return;
    tiddlyWikiService.registerSaver(iframe, opts, {
      name: 'tiddly-drive-2',
      priority: 2000,
      capabilities: ['save', 'autosave'],
      saveFunction: this.save,
      onSaveSuccess: (tw, prefs) => {
        // If any page customizations (like favicon) changed, reflect them
        tiddlyWikiService.applyPageCustomizationsFromWiki(prefs, tw);
      }
    });
    this.wikiSaverRegistered = true;
  };

  /**
   * Saves the provided HTML content back to the current Drive file.
   *
   * @param html The full HTML content of the wiki
   * @param root0 Save options including autosave flag
   * @param root0.autosave Whether the save is an autosave
   * @returns Promise resolving to true on success, false on handled conflict
   */
  save = async (html: string, { autosave = false }: SaveOptions = {}): Promise<boolean> => {
    if (!this.currentFileId) throw new Error('File not loaded');
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
        console.warn('[td2/drive] upload error', e);
        ok = false;
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
      const respJson = await googleDriveRepository.uploadFileContent(
        this.currentFileId,
        html,
        token
      );

      console.log('[td2/drive] saved', respJson);
      // Update our local version tracker with the value returned by Drive
      this.currentVersion = respJson.version
        ? Number.parseInt(respJson.version)
        : this.currentVersion;
      console.log(this.currentVersion);
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
   * @param token The current OAuth token
   * @returns Promise resolving to true if a conflict was detected and handled (save should abort), false if no conflict
   */
  hasFileConflicts = async (token: string) => {
    if (!this.currentFileId) return false;

    try {
      const verMeta = await googleDriveRepository.getFileVersion(this.currentFileId, token);
      const serverVersion = verMeta.version ? Number.parseInt(verMeta.version, 10) : null;
      if (
        this.currentVersion !== null &&
        serverVersion !== null &&
        !Number.isNaN(serverVersion) &&
        serverVersion !== this.currentVersion
      ) {
        console.warn(
          `[td2/drive] version conflict detected: local=${this.currentVersion} server=${serverVersion}`
        );
        showError('Conflict Detected', 'The file changed on Google Drive. Reload before saving.', {
          text: 'Save Anyway',
          fn: async () => {
            try {
              // Bypass conflict preflight on the next save
              this.forceNextSave = true;
              // Ask TiddlyWiki to perform a normal save; our saver will handle the force flag
              await tiddlyWikiService.getLatestTWObject()?.saverHandler?.saveWiki();
            } catch (e) {
              console.warn('[td2/drive] forced save failed', e);
            }
          }
        });
        return true;
      }
    } catch (err) {
      // If preflight fails (network/perm), continue and let upload path handle errors.
      console.warn('[td2/drive] version preflight failed', err);
    }
    return false;
  };
}

const googleDriveService = new GoogleDriveService();
export default googleDriveService;
