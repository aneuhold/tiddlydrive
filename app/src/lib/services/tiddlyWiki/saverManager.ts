import type { Prefs } from '$lib/prefs';
import type { SaverOptions, SaverRegistrationConfig, TiddlyWiki } from './types';

/**
 * Handles registration, unregistration, and status management of a custom TiddlyWiki saver.
 */
class SaverManager {
  private latestTWObject: TiddlyWiki | undefined;
  private currentSaverConfig: SaverRegistrationConfig | undefined;
  private currentSaverOptions: SaverOptions | undefined;
  private isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private onlineStatusListenersAdded = false;

  /**
   * Capture latest $tw reference for subsequent checks.
   *
   * @param tw The TiddlyWiki instance to store
   */
  setLatestTW(tw: TiddlyWiki | undefined): void {
    this.latestTWObject = tw;
  }

  /**
   * Update inputs and attempt registration.
   *
   * @param opts Saver options including preferences accessor
   * @param config Saver configuration for registration
   * @param applyCustomizations Callback to apply page customizations once TW is available
   */
  register(
    opts: SaverOptions,
    config: SaverRegistrationConfig,
    applyCustomizations: (prefs: Prefs, tw?: TiddlyWiki) => void
  ): void {
    this.currentSaverOptions = opts;
    this.currentSaverConfig = config;

    this.performSaverRegistration(opts, config, applyCustomizations);
  }

  /** Remove our saver from the pipeline. */
  unregister(): void {
    const tw = this.latestTWObject;
    if (!tw || !tw.saverHandler || !Array.isArray(tw.saverHandler.savers)) return;
    const index = tw.saverHandler.savers.findIndex(
      (saver) => saver.info.name === this.currentSaverConfig?.name
    );
    if (index >= 0) {
      tw.saverHandler.savers.splice(index, 1);
      console.log('[td2/tw] Unregistered saver');
    }
  }

  /**
   * Update registration based on prefs changes.
   *
   * @param prefs The current user preferences
   */
  updateRegistration(prefs: Prefs): void {
    if (!this.currentSaverOptions || !this.currentSaverConfig) return;
    const isRegistered = this.isSaverRegistered();
    const shouldBeActive = prefs.autosave && this.isOnline;
    if (shouldBeActive && !isRegistered) {
      this.registerIfNeeded();
    } else if (!shouldBeActive && isRegistered) {
      this.unregister();
    }
  }

  /**
   * Check current saver registration state.
   *
   * @returns True if saver is currently registered
   */
  private isSaverRegistered(): boolean {
    const tw = this.latestTWObject;
    if (!tw || !tw.saverHandler) return false;
    return tw.saverHandler.savers.some(
      (saver) => saver.info.name === this.currentSaverConfig?.name
    );
  }

  /**
   * Register saver when TW is ready; also setup online listeners.
   *
   * @param opts Saver options including preferences accessor
   * @param config Saver configuration for registration
   * @param applyCustomizations Callback to apply page customizations once TW is available
   */
  private performSaverRegistration(
    opts: SaverOptions,
    config: SaverRegistrationConfig,
    applyCustomizations: (prefs: Prefs, tw?: TiddlyWiki) => void
  ): void {
    const attempt = (): void => {
      const tw = this.latestTWObject;
      if (!tw || !tw.saverHandler || !Array.isArray(tw.saverHandler.savers)) {
        setTimeout(attempt, 600);
        return;
      }
      if (tw.saverHandler.savers.find((s) => s.info.name === config.name)) return;

      const prefs = opts.preferences();
      applyCustomizations(prefs, tw);
      this.setupOnlineStatusListeners();

      if (!prefs.autosave || !this.isOnline) {
        const reason = !prefs.autosave ? 'autosave disabled' : 'offline';
        console.log(`[td2/tw] Skipping registration of ${config.name} - ${reason}`);
        return;
      }

      tw.saverHandler.savers.push({
        info: { name: config.name, priority: config.priority, capabilities: ['save', 'autosave'] },
        save: async (text: string, _method: string, callback: (err?: string) => void) => {
          const currentPrefs = opts.preferences();
          if (!currentPrefs.autosave) {
            callback('Autosave disabled');
            return false;
          }
          try {
            const result = await config.saveFunction(text, { autosave: true });
            if (!result) return false;
            try {
              const sh = tw.saverHandler;
              if (sh) {
                // Reset change counter so TW clears dirty indicator
                sh.numChanges = 0;
                sh.updateDirtyStatus();
              }
              if (config.onSaveSuccess) config.onSaveSuccess(tw, currentPrefs);
            } catch (err) {
              console.warn('[td2/tw] failed to reset TW dirty status', err);
            }
            return true;
          } catch (e) {
            callback((e as Error).message);
            return false;
          }
        }
      });
    };
    attempt();
  }

  /** Setup online/offline to auto-manage saver registration. */
  private setupOnlineStatusListeners(): void {
    if (this.onlineStatusListenersAdded) return;

    const handle = (): void => {
      const wasOnline = this.isOnline;
      this.isOnline = navigator.onLine;
      if (wasOnline === this.isOnline) return;

      if (this.isOnline) {
        if (this.currentSaverOptions) {
          const prefs = this.currentSaverOptions.preferences();
          if (prefs.autosave) this.registerIfNeeded();
        }
        return;
      }
      if (this.isSaverRegistered()) {
        this.unregister();
        if (this.currentSaverOptions) {
          const prefs = this.currentSaverOptions.preferences();
          if (prefs.autosave) {
            console.log('[td2/tw] Went offline - saver unregistered, will save locally');
          }
        }
      }
    };

    window.addEventListener('online', handle);
    window.addEventListener('offline', handle);
    this.onlineStatusListenersAdded = true;
  }

  /** Register saver if inputs exist and not already registered. */
  private registerIfNeeded(): void {
    if (!this.currentSaverOptions || !this.currentSaverConfig) return;
    if (!this.isSaverRegistered()) {
      // Re-run registration path which also ensures TW is ready
      this.performSaverRegistration(this.currentSaverOptions, this.currentSaverConfig, () => {
        /* no-op from here; caller may re-apply customizations later */
      });
      console.log('[td2/tw] Saver registered (came back online)');
    }
  }
}

const saverManager = new SaverManager();
export default saverManager;
