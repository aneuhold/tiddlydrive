import type { Prefs } from '$lib/prefs';
import pageCustomizer from '$lib/services/tiddlyWiki/pageCustomizer';
import saverManager from '$lib/services/tiddlyWiki/saverManager';
import type {
  SaveFunction,
  SaveOptions,
  SaverOptions,
  SaverRegistrationConfig,
  TiddlyWiki
} from '$lib/services/tiddlyWiki/types';
export type { SaveFunction, SaveOptions, SaverOptions, SaverRegistrationConfig, TiddlyWiki };

/**
 * Service class for interacting with TiddlyWiki objects and managing page customizations.
 */
class TiddlyWikiService {
  private latestTWObject: TiddlyWiki | undefined = undefined;

  /**
   * Returns the TiddlyWiki ($tw) object from a window, if available.
   *
   * @param win The window object to extract $tw from
   * @returns The TiddlyWiki object or undefined
   */
  getTiddlyWikiFromWindow = (win: Window | null): TiddlyWiki | undefined => {
    const tw = win?.$tw;
    if (tw) this.latestTWObject = tw;
    saverManager.setLatestTW(tw);
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
    // Seed TW reference once iframe has a contentWindow
    const seedTW = (): void => {
      const win = iframe.contentWindow;
      if (win) {
        const tw = this.getTiddlyWikiFromWindow(win);
        if (tw) return; // latestTW set inside
      }
      setTimeout(seedTW, 200);
    };
    seedTW();

    saverManager.register(opts, config, (prefs: Prefs, tw?: TiddlyWiki) => {
      this.applyPageCustomizationsFromWiki(prefs, tw);
    });
  };

  /**
   * Unregisters the TiddlyDrive saver from TiddlyWiki's saver pipeline.
   */
  unregisterSaver = (): void => {
    saverManager.unregister();
  };

  /**
   * Updates saver registration based on current preferences.
   * Used when preferences change to update saver registration state.
   *
   * @param prefs Current preferences
   */
  updateSaverRegistration = (prefs: Prefs): void => {
    saverManager.updateRegistration(prefs);
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
      if (!doc) return;
      pageCustomizer.applyFromWiki(prefs, tw, doc);
    } catch (err) {
      console.warn('[td2/tw] applyPageCustomizationsFromWiki failed', err);
    }
  };
}

const tiddlyWikiService = new TiddlyWikiService();
export default tiddlyWikiService;
