import type { Prefs } from '$lib/prefs';
import type { TiddlyWiki } from './types';

/**
 * Encapsulates page-level customizations derived from a loaded TiddlyWiki instance.
 * Currently supports: favicon and document.title overrides.
 */
class PageCustomizer {
  private originalDocumentTitle: string | undefined;

  /**
   * Applies all enabled customizations to the provided document based on prefs and wiki state.
   *
   * @param prefs User preferences controlling which customizations to apply
   * @param tw TiddlyWiki object to read tiddlers from
   * @param doc Target document (defaults to global document when available)
   */
  applyFromWiki = (prefs: Prefs, tw?: TiddlyWiki, doc: Document = document): void => {
    try {
      if (!tw) return;

      // Favicon
      if (prefs.useWikiFavicon) {
        this.applyFaviconFromWiki(tw, doc);
      } else {
        this.removeWikiFaviconOverride(doc);
      }

      // Title
      if (prefs.useWikiTitle) {
        this.applyTitleFromWiki(tw, doc);
      } else if (this.originalDocumentTitle !== undefined) {
        this.restoreOriginalTitle(doc);
      }
    } catch (_err) {
      // Non-fatal customization failure; prefer silent fallback over user disruption
    }
  };

  /**
   * Applies favicon from `$:/favicon.ico` tiddler to the page by injecting link tags.
   *
   * @param tw The TiddlyWiki instance to read from
   * @param doc The target document to mutate
   */
  private applyFaviconFromWiki = (tw: TiddlyWiki, doc: Document): void => {
    const tiddler = tw.wiki.getTiddler('$:/favicon.ico');
    if (!tiddler) return;

    const raw = (tiddler.fields.text || '').trim();
    if (!raw) return;
    const mime = tiddler.fields.type || 'image/x-icon';
    const dataUrl = `data:${mime};base64,${raw}`;

    // Remove previous overrides we control
    this.removeWikiFaviconOverride(doc);

    const ensureIdLink = (id: string, rel: string): void => {
      let link = doc.getElementById(id) as HTMLLinkElement | null;
      if (!link) {
        link = doc.createElement('link');
        link.id = id;
        link.rel = rel;
        doc.head.appendChild(link);
      }
      link.href = dataUrl;
    };

    ensureIdLink('td2-wiki-favicon', 'icon');
    ensureIdLink('td2-wiki-favicon-shortcut', 'shortcut icon');
  };

  /**
   * Applies document.title from `$:/SiteTitle` and `$:/SiteSubtitle` tiddlers.
   * Format: `SiteTitle - SiteSubtitle`, or whichever is available.
   *
   * @param tw The TiddlyWiki instance to read from
   * @param doc The target document to mutate
   */
  private applyTitleFromWiki = (tw: TiddlyWiki, doc: Document): void => {
    try {
      const siteTitle = tw.wiki.getTiddler('$:/SiteTitle')?.fields.text.trim();
      const siteSubtitle = tw.wiki.getTiddler('$:/SiteSubtitle')?.fields.text.trim();

      if (!siteTitle && !siteSubtitle) return;

      if (this.originalDocumentTitle === undefined) {
        this.originalDocumentTitle = doc.title;
      }

      const title = [siteTitle, siteSubtitle].filter(Boolean).join(' - ');
      if (title) doc.title = title;
    } catch (_err) {
      // Ignore title failures; avoid user disruption
    }
  };

  /**
   * Restores the original document title if an override was applied previously.
   *
   * @param doc The target document to mutate
   */
  private restoreOriginalTitle = (doc: Document): void => {
    if (this.originalDocumentTitle !== undefined) {
      doc.title = this.originalDocumentTitle;
      this.originalDocumentTitle = undefined;
    }
  };

  /**
   * Removes our override favicon tags if present.
   *
   * @param doc The document to clean up
   */
  removeWikiFaviconOverride = (doc: Document = document): void => {
    try {
      doc.getElementById('td2-wiki-favicon')?.remove();
      doc.getElementById('td2-wiki-favicon-shortcut')?.remove();
    } catch (_err) {
      // Ignore cleanup failures
    }
  };
}

const pageCustomizer = new PageCustomizer();
export default pageCustomizer;
