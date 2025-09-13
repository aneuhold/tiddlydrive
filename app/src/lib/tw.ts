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

export let latestTWObject: TiddlyWiki | undefined = undefined;

let originalDocumentTitle: string | undefined;

/**
 * Returns the TiddlyWiki ($tw) object from a window, if available.
 *
 * @param win The window object to extract $tw from
 * @returns The TiddlyWiki object or undefined
 */
export const getTiddlyWikiFromWindow = (win: Window | null): TiddlyWiki | undefined => {
  const tw = win?.$tw;
  if (tw) latestTWObject = tw;
  return tw;
};

/**
 * Applies the favicon from the wiki's `$:/favicon.ico` tiddler to the document.
 *
 * @param tw The TiddlyWiki object (from `window.$tw`)
 * @param doc The document to apply the favicon to
 */
const applyFaviconFromWiki = (tw: TiddlyWiki, doc: Document): void => {
  console.log('Applying favicon from wiki');
  const tiddler = tw.wiki.getTiddler('$:/favicon.ico');
  if (!tiddler) return;
  const raw = tiddler.fields.text.trim();
  const mime = tiddler.fields.type || 'image/x-icon';
  const dataUrl = `data:${mime};base64,${raw}`;

  // Add our own links at the end so they take precedence. Remove any previous overrides first.
  removeWikiFaviconOverride(doc);

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
const applyTitleFromWiki = (tw: TiddlyWiki, doc: Document): void => {
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
      if (originalDocumentTitle === undefined) originalDocumentTitle = doc.title;
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
const restoreOriginalTitle = (doc: Document): void => {
  if (originalDocumentTitle !== undefined) {
    doc.title = originalDocumentTitle;
  }
};

/**
 * Removes the override favicon links we add when `useWikiFavicon` is enabled.
 *
 * @param doc The document to remove override links from
 */
export const removeWikiFaviconOverride = (doc: Document = document): void => {
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
 * Applies page-level customizations derived from the loaded wiki.
 * Currently: applies the favicon from `$:/favicon.ico`.
 *
 * @param prefs User preferences controlling which customizations to apply
 * @param tw The TiddlyWiki object (from `window.$tw`)
 * @param doc Optional document to apply customizations to (defaults to global `document`)
 */
export const applyPageCustomizationsFromWiki = (
  prefs: Prefs,
  tw: TiddlyWiki | undefined = latestTWObject,
  // `document` can't be used as a default parameter because SSR needs to be able to statically render
  // without access to `window` or `document`.
  doc?: Document
): void => {
  try {
    if (!doc && typeof document !== 'undefined') doc = document;
    if (!tw || !doc) return;
    if (prefs.useWikiFavicon) {
      applyFaviconFromWiki(tw, doc);
    } else {
      removeWikiFaviconOverride(doc);
    }

    if (prefs.useWikiTitle) {
      applyTitleFromWiki(tw, doc);
    } else {
      restoreOriginalTitle(doc);
    }
  } catch (err) {
    console.warn('[td2/tw] applyPageCustomizationsFromWiki failed', err);
  }
};
