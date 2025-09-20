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
    // First, restore any previous overrides we made, then re-apply fresh
    // (handles MIME/type changes and ensures we don't stack stateful changes)
    this.removeWikiFaviconOverride(doc);

    // We own the HTML and guarantee IDs exist. Update them directly.
    const targets = this.getFaviconElements(doc);

    for (const el of targets) {
      const tag = el.tagName.toLowerCase();
      if (tag === 'link') {
        const link = el as HTMLLinkElement;
        if (!link.dataset.td2FaviconOrigHref) {
          const orig = link.getAttribute('href') || '';
          link.dataset.td2FaviconOrigHref = orig;
        }
        link.dataset.td2FaviconOverridden = '1';
        link.setAttribute('type', mime);
        link.href = dataUrl;
      } else if (tag === 'meta') {
        const meta = el as HTMLMetaElement;
        if (!meta.dataset.td2FaviconOrigContent) {
          const orig = meta.getAttribute('content') || '';
          meta.dataset.td2FaviconOrigContent = orig;
        }
        meta.dataset.td2FaviconOverridden = '1';
        meta.setAttribute('content', dataUrl);
      }
    }
  };

  /**
   * Returns the favicon link elements we own in the base HTML.
   * The IDs are guaranteed by `app/src/app.html` which we control.
   *
   * @param doc The target document to query
   * @returns Array of link elements to override (favicon + apple-touch)
   */
  private getFaviconElements = (doc: Document): (HTMLLinkElement | HTMLMetaElement)[] => {
    const favicon = doc.getElementById('td2-app-favicon') as HTMLLinkElement | null;
    const appleTouch = doc.getElementById('td2-app-apple-touch-icon') as HTMLLinkElement | null;
    const ogImage = doc.getElementById('td2-app-og-image') as HTMLMetaElement | null;
    const twitterImage = doc.getElementById('td2-app-twitter-image') as HTMLMetaElement | null;
    return [favicon, appleTouch, ogImage, twitterImage].filter(Boolean) as Array<
      HTMLLinkElement | HTMLMetaElement
    >;
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
  private removeWikiFaviconOverride = (doc: Document = document): void => {
    try {
      // Revert the two known ID targets only (we own the HTML)
      const targets = this.getFaviconElements(doc);

      for (const el of targets) {
        const tag = el.tagName.toLowerCase();
        if (tag === 'link') {
          const link = el as HTMLLinkElement;
          const orig = link.dataset.td2FaviconOrigHref;
          if (typeof orig === 'string') {
            link.href = orig;
          }
          delete link.dataset.td2FaviconOrigHref;
          delete link.dataset.td2FaviconOverridden;
          link.removeAttribute('type');
        } else if (tag === 'meta') {
          const meta = el as HTMLMetaElement;
          const orig = meta.dataset.td2FaviconOrigContent;
          if (typeof orig === 'string') {
            meta.setAttribute('content', orig);
          }
          delete meta.dataset.td2FaviconOrigContent;
          delete meta.dataset.td2FaviconOverridden;
        }
      }
    } catch (_err) {
      // Ignore cleanup failures
    }
  };
}

const pageCustomizer = new PageCustomizer();
export default pageCustomizer;
