import type { Prefs } from '$lib/prefs';

/**
 * TiddlyWiki saver entry minimal shape used by the app.
 */
type TWSaver = {
  info: { name: string; priority: number; capabilities: string[] };
  save: (text: string, method: string, callback: (err?: string) => void) => Promise<boolean>;
};

/**
 * TiddlyWiki saver handler shape used by the app.
 */
type TWSaverHandler = {
  savers: TWSaver[];
  numChanges: number;
  updateDirtyStatus: () => void;
  saveWiki: () => Promise<void>;
};

/**
 * Minimal TiddlyWiki interface exposed on window.$tw that we rely on.
 */
export type TiddlyWiki = {
  saverHandler?: TWSaverHandler;
  wiki: {
    getTiddler: (title: string) => Tiddler | undefined;
  };
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
  capabilities: string[];
  saveFunction: SaveFunction;
  onSaveSuccess?: (tw: TiddlyWiki, prefs: Prefs) => void;
};

/**
 * Service class for interacting with TiddlyWiki objects and managing page customizations.
 */
class TiddlyWikiService {
  private latestTWObject: TiddlyWiki | undefined = undefined;
  private originalDocumentTitle: string | undefined;
  private registeredSavers = new Set<string>();

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
   * Gets the latest cached TiddlyWiki object.
   *
   * @returns The latest TiddlyWiki object or undefined
   */
  getLatestTWObject = (): TiddlyWiki | undefined => {
    return this.latestTWObject;
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
    if (this.registeredSavers.has(config.name)) return;

    const attempt = (): void => {
      const win = iframe.contentWindow;
      const tw = this.getTiddlyWikiFromWindow(win);
      if (!tw || !tw.saverHandler || !Array.isArray(tw.saverHandler.savers)) {
        setTimeout(attempt, 600);
        return;
      }

      // Apply page customizations from wiki once TW is available
      this.applyPageCustomizationsFromWiki(opts.preferences(), tw);

      tw.saverHandler.savers.push({
        info: {
          name: config.name,
          priority: config.priority,
          capabilities: config.capabilities
        },
        save: async (text: string, method: string, callback: (err?: string) => void) => {
          // Get preferences
          const prefs = opts.preferences();

          if (prefs.disableDriveSave) {
            callback('Saving disabled');
            return false;
          }
          if (method === 'autosave' && !prefs.autosave) {
            callback('Autosave disabled');
            return false;
          }
          try {
            const result = await config.saveFunction(text, { autosave: method === 'autosave' });

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
                config.onSaveSuccess(tw, prefs);
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
      this.registeredSavers.add(config.name);
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
}

const tiddlyWikiService = new TiddlyWikiService();
export default tiddlyWikiService;
