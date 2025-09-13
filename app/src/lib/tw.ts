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
 * Returns the TiddlyWiki ($tw) object from a window, if available.
 *
 * @param win The window object to extract $tw from
 * @returns The TiddlyWiki object or undefined
 */
export const getTiddlyWikiFromWindow = (win: Window | null): TiddlyWiki | undefined => {
  const tw = win?.$tw;
  return tw;
};

/**
 * Applies the favicon from the wiki's `$:/favicon.ico` tiddler to the document.
 *
 * @param tw The TiddlyWiki object (from `window.$tw`)
 * @param doc The document to apply the favicon to
 */
const applyFaviconFromWiki = (tw: TiddlyWiki, doc: Document): void => {
  const tiddler = tw.wiki.getTiddler('$:/favicon.ico');
  if (!tiddler) return;
  const raw = tiddler.fields.text.trim();
  const mime = tiddler.fields.type || 'image/x-icon';
  const dataUrl = `data:${mime};base64,${raw}`;

  // Ensure we update or create <link rel="icon"> and <link rel="shortcut icon">
  const ensureLink = (rel: string): void => {
    let link = doc.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
    if (!link) {
      link = doc.createElement('link');
      link.rel = rel;
      doc.head.appendChild(link);
    }
    link.type = mime;
    link.href = dataUrl;
  };

  ensureLink('icon');
  ensureLink('shortcut icon');
};

/**
 * Applies page-level customizations derived from the loaded wiki.
 * Currently: applies the favicon from `$:/favicon.ico`.
 *
 * @param tw The TiddlyWiki object (from `window.$tw`)
 * @param doc Optional document to apply customizations to (defaults to global `document`)
 * @param prefs User preferences controlling which customizations to apply
 */
export const applyPageCustomizationsFromWiki = (
  tw: TiddlyWiki | undefined,
  doc: Document = document,
  prefs: Prefs
): void => {
  try {
    if (!tw) return;
    if (prefs.useWikiFavicon) {
      applyFaviconFromWiki(tw, doc);
    }
  } catch (err) {
    console.warn('[td2/tw] applyPageCustomizationsFromWiki failed', err);
  }
};
