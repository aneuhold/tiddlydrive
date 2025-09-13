import type { Prefs } from '$lib/prefs';

/**
 * Minimal TiddlyWiki interface exposed on `window.$tw` that we rely on.
 */
export type TiddlyWiki = {
  saverHandler?: TWSaverHandler;
  wiki: {
    getTiddler: (title: string) => Tiddler | undefined;
  };
};

/**
 * TiddlyWiki saver handler shape used by the app. This is the object at `window.$tw.saverHandler`.
 */
type TWSaverHandler = {
  savers: TWSaver[];
  numChanges: number;
  updateDirtyStatus: () => void;
  saveWiki: () => Promise<void>;
};

/**
 * TiddlyWiki saver entry minimal shape used by the app.
 */
type TWSaver = {
  info: { name: string; priority: number; capabilities: string[] };
  save: (text: string, method: string, callback: (err?: string) => void) => Promise<boolean>;
};

type Tiddler = {
  fields: {
    text: string;
    title: string;
    /**
     * The type can be used to identify special tiddlers like the favicon (type: 'image/x-icon').
     */
    type: string;
  };
};

/**
 * Options used when registering the TiddlyWiki saver integration.
 */
export type SaverOptions = {
  preferences: () => Prefs;
};

/**
 * Options for saving a wiki.
 */
export type SaveOptions = {
  autosave?: boolean;
};

/**
 * Function signature for save operations that can be registered with TiddlyWiki.
 */
export type SaveFunction = (html: string, options?: SaveOptions) => Promise<boolean>;

/**
 * Configuration for registering a custom saver with TiddlyWiki.
 */
export type SaverRegistrationConfig = {
  name: string;
  priority: number;
  saveFunction: SaveFunction;
  onSaveSuccess?: (tw: TiddlyWiki, prefs: Prefs) => void;
};

/**
 * Service class for interacting with TiddlyWiki objects and managing page customizations.
 */
class TiddlyWikiService {
  private latestTWObject: TiddlyWiki | undefined = undefined;
  private originalDocumentTitle: string | undefined;
  private currentSaverConfig: SaverRegistrationConfig | undefined = undefined;
  private currentIframe: HTMLIFrameElement | undefined = undefined;
  private currentSaverOptions: SaverOptions | undefined = undefined;
  private isOnline: boolean = navigator.onLine;
  private onlineStatusListenersAdded: boolean = false;

  /**
   * Returns the TiddlyWiki ($tw) object from a window, if available.
   *
   * @param win The window object to extract $tw from
   * @returns The TiddlyWiki object or undefined
   */
  getTiddlyWikiFromWindow = (win: Window | null): TiddlyWiki | undefined => {
    const tw = win?.$tw;
    if (tw) this.latestTWObject = tw;
    return tw;
  };

  /**
   * Saves the current wiki using TiddlyWiki's built-in saveWiki method.
   */
  saveWiki = async (): Promise<void> => {
    await this.latestTWObject?.saverHandler?.saveWiki();
  };

  /**
   * Registers a custom saver with TiddlyWiki's saver pipeline.
   *
   * @param iframe The iframe containing the wiki
   * @param opts Saver options including preferences
   * @param config Configuration for the saver to register
   */
  registerSaver = (
    iframe: HTMLIFrameElement,
    opts: SaverOptions,
    config: SaverRegistrationConfig
  ): void => {
    // Store references for dynamic registration/unregistration
    this.currentIframe = iframe;
    this.currentSaverOptions = opts;
    this.currentSaverConfig = config;

    // Perform initial registration
    this.performSaverRegistration(iframe, opts, config);
  };

  /**
   * Unregisters the TiddlyDrive saver from TiddlyWiki's saver pipeline.
   */
  unregisterSaver = (): void => {
    const tw = this.latestTWObject;
    if (!tw || !tw.saverHandler || !Array.isArray(tw.saverHandler.savers)) {
      return;
    }

    const index = tw.saverHandler.savers.findIndex(
      (saver) => saver.info.name === this.currentSaverConfig?.name
    );
    if (index >= 0) {
      tw.saverHandler.savers.splice(index, 1);
      console.log(`[td2/tw] Unregistered saver`);
    }
  };

  /**
   * Updates saver registration based on current preferences.
   * Used when preferences change to update saver registration state.
   *
   * @param prefs Current preferences
   */
  updateSaverRegistration = (prefs: Prefs): void => {
    if (!this.currentIframe || !this.currentSaverOptions || !this.currentSaverConfig) return;

    const isRegistered = this.isSaverRegistered();

    // Saver should be active if autosave is enabled AND we're online
    const shouldBeActive = prefs.autosave && this.isOnline;

    if (shouldBeActive && !isRegistered) {
      // Register the saver
      this.registerSaverIfNeeded();
    } else if (!shouldBeActive && isRegistered) {
      // Unregister the saver
      this.unregisterSaver();
    }
  };

  /**
   * Internal method that performs the actual saver registration.
   *
   * @param iframe The iframe containing the wiki
   * @param opts Saver options including preferences
   * @param config Configuration for the saver to register
   */
  private performSaverRegistration = (
    iframe: HTMLIFrameElement,
    opts: SaverOptions,
    config: SaverRegistrationConfig
  ): void => {
    // Recursive method if needed to wait for TW to be available
    const attempt = (): void => {
      const win = iframe.contentWindow;
      const tw = this.getTiddlyWikiFromWindow(win);

      // Wait for TW and saverHandler to be available
      if (!tw || !tw.saverHandler || !Array.isArray(tw.saverHandler.savers)) {
        setTimeout(attempt, 600);
        return;
      }

      // Return if already registered
      if (tw.saverHandler.savers.find((saver) => saver.info.name === config.name)) {
        return;
      }

      // Apply page customizations from wiki once TW is available
      const prefs = opts.preferences();
      this.applyPageCustomizationsFromWiki(prefs, tw);

      // Always set up online status listeners for automatic saver management
      this.setupOnlineStatusListeners();

      // Check if this saver should be active based on current preferences and online status
      if (!prefs.autosave || !this.isOnline) {
        const reason = !prefs.autosave ? 'autosave disabled' : 'offline';
        console.log(`[td2/tw] Skipping registration of ${config.name} - ${reason}`);
        return;
      }

      tw.saverHandler.savers.push({
        info: {
          name: config.name,
          priority: config.priority,
          capabilities: ['save', 'autosave']
        },
        save: async (text: string, method: string, callback: (err?: string) => void) => {
          // Get preferences
          const currentPrefs = opts.preferences();

          if (!currentPrefs.autosave) {
            callback('Autosave disabled');
            return false;
          }

          try {
            const result = await config.saveFunction(text, { autosave: true });

            // Return false if save failed (handled conflict or error)
            // There will be a dialog for the user if there was an error
            if (!result) {
              return false;
            }

            // Reset change counter so TW clears dirty indicator.
            try {
              const sh = tw.saverHandler;
              if (sh) {
                sh.numChanges = 0;
                sh.updateDirtyStatus();
              }
              // Call optional success callback
              if (config.onSaveSuccess) {
                config.onSaveSuccess(tw, currentPrefs);
              }
            } catch (err) {
              console.warn('[td2/tw] failed to reset TW dirty status', err);
            }
            // Purposefully skip the callback here, so it doesn't show the built-in "saved" toast.
            return true;
          } catch (e) {
            callback((e as Error).message);
            return false;
          }
        }
      });
    };
    attempt();
  };

  /**
   * Applies page-level customizations derived from the loaded wiki.
   * Currently: applies the favicon from `$:/favicon.ico`.
   *
   * @param prefs User preferences controlling which customizations to apply
   * @param tw The TiddlyWiki object (from `window.$tw`)
   * @param doc Optional document to apply customizations to (defaults to global `document`)
   */
  applyPageCustomizationsFromWiki = (
    prefs: Prefs,
    tw: TiddlyWiki | undefined = this.latestTWObject,
    // `document` can't be used as a default parameter because SSR needs to be able to statically render
    // without access to `window` or `document`.
    doc?: Document
  ): void => {
    try {
      if (!doc && typeof document !== 'undefined') doc = document;
      if (!tw || !doc) return;
      if (prefs.useWikiFavicon) {
        this.applyFaviconFromWiki(tw, doc);
      } else {
        this.removeWikiFaviconOverride(doc);
      }

      if (prefs.useWikiTitle) {
        this.applyTitleFromWiki(tw, doc);
      } else {
        this.restoreOriginalTitle(doc);
      }
    } catch (err) {
      console.warn('[td2/tw] applyPageCustomizationsFromWiki failed', err);
    }
  };

  /**
   * Applies the favicon from the wiki's `$:/favicon.ico` tiddler to the document.
   *
   * @param tw The TiddlyWiki object (from `window.$tw`)
   * @param doc The document to apply the favicon to
   */
  private applyFaviconFromWiki = (tw: TiddlyWiki, doc: Document): void => {
    const tiddler = tw.wiki.getTiddler('$:/favicon.ico');
    if (!tiddler) return;
    const raw = tiddler.fields.text.trim();
    const mime = tiddler.fields.type || 'image/x-icon';
    const dataUrl = `data:${mime};base64,${raw}`;

    // Add our own links at the end so they take precedence. Remove any previous overrides first.
    this.removeWikiFaviconOverride(doc);

    const ensureIdLink = (id: string, rel: string): void => {
      let link = doc.getElementById(id) as HTMLLinkElement | null;
      if (!link) {
        link = doc.createElement('link');
        link.id = id;
        link.rel = rel;
        doc.head.appendChild(link);
      } else if (link.parentElement !== doc.head) {
        // Ensure it's inside <head> and last
        doc.head.appendChild(link);
      }
      link.type = mime;
      link.href = dataUrl;
    };

    ensureIdLink('td2-wiki-favicon', 'icon');
    ensureIdLink('td2-wiki-favicon-shortcut', 'shortcut icon');
  };

  /**
   * Applies the document.title using `$:/SiteTitle` and `$:/SiteSubtitle` tiddlers.
   * Format: `SiteTitle - SiteSubtitle`. If one is missing, falls back to the other.
   * If both are missing, no change is applied.
   *
   * @param tw The TiddlyWiki object (from `window.$tw`)
   * @param doc The document whose title to update
   */
  private applyTitleFromWiki = (tw: TiddlyWiki, doc: Document): void => {
    try {
      const siteTitleTid = tw.wiki.getTiddler('$:/SiteTitle');
      const siteSubtitleTid = tw.wiki.getTiddler('$:/SiteSubtitle');

      const siteTitle = siteTitleTid?.fields.text.trim();
      const siteSubtitle = siteSubtitleTid?.fields.text.trim();

      let newTitle: string | undefined;
      if (siteTitle && siteSubtitle) newTitle = `${siteTitle} - ${siteSubtitle}`;
      else if (siteTitle) newTitle = siteTitle;
      else if (siteSubtitle) newTitle = siteSubtitle;

      if (newTitle) {
        if (this.originalDocumentTitle === undefined) this.originalDocumentTitle = doc.title;
        doc.title = newTitle;
      }
    } catch (err) {
      console.warn('[td2/tw] applyTitleFromWiki failed', err);
    }
  };

  /**
   * Restores the original document.title if we previously overrode it.
   *
   * @param doc The document whose title should be restored
   */
  private restoreOriginalTitle = (doc: Document): void => {
    if (this.originalDocumentTitle !== undefined) {
      doc.title = this.originalDocumentTitle;
    }
  };

  /**
   * Removes the override favicon links we add when `useWikiFavicon` is enabled.
   *
   * @param doc The document to remove override links from
   */
  private removeWikiFaviconOverride = (doc: Document = document): void => {
    try {
      const ids = ['td2-wiki-favicon', 'td2-wiki-favicon-shortcut'];
      ids.forEach((id) => {
        const el = doc.getElementById(id);
        if (el && el.parentElement) el.parentElement.removeChild(el);
      });
    } catch (err) {
      console.warn('[td2/tw] removeWikiFaviconOverride failed', err);
    }
  };

  /**
   * Sets up online/offline event listeners to automatically manage saver registration.
   * Always sets up listeners when a saver is first registered.
   */
  private setupOnlineStatusListeners = (): void => {
    if (this.onlineStatusListenersAdded) return;

    const handleOnlineStatusChange = (): void => {
      const wasOnline = this.isOnline;
      this.isOnline = navigator.onLine;

      // Only process if status actually changed
      if (wasOnline === this.isOnline) return;

      if (this.isOnline) {
        // Came back online - register saver if autosave is enabled
        if (this.currentSaverOptions) {
          const prefs = this.currentSaverOptions.preferences();
          if (prefs.autosave) {
            this.registerSaverIfNeeded();
          }
        }
        return;
      }
      // Went offline - always unregister saver
      if (this.isSaverRegistered()) {
        this.unregisterSaver();

        // Show toast message only if autosave was enabled
        if (this.currentSaverOptions) {
          const prefs = this.currentSaverOptions.preferences();
          if (prefs.autosave) {
            console.log('[td2/tw] Went offline - saver unregistered, will save locally');
          }
        }
      }
    };

    window.addEventListener('online', handleOnlineStatusChange);
    window.addEventListener('offline', handleOnlineStatusChange);
    this.onlineStatusListenersAdded = true;
  };

  /**
   * Checks if the TiddlyDrive saver is currently registered.
   *
   * @returns True if the saver is registered, false otherwise
   */
  private isSaverRegistered = (): boolean => {
    const tw = this.latestTWObject;
    if (!tw || !tw.saverHandler) return false;

    return tw.saverHandler.savers.some(
      (saver) => saver.info.name === this.currentSaverConfig?.name
    );
  };

  /**
   * Registers the saver if not already registered and conditions are met.
   */
  private registerSaverIfNeeded = (): void => {
    if (!this.currentIframe || !this.currentSaverOptions || !this.currentSaverConfig) return;

    if (!this.isSaverRegistered()) {
      this.performSaverRegistration(
        this.currentIframe,
        this.currentSaverOptions,
        this.currentSaverConfig
      );
      console.log('[td2/tw] Saver registered (came back online)');
    }
  };
}

const tiddlyWikiService = new TiddlyWikiService();
export default tiddlyWikiService;
