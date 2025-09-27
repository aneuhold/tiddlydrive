/** Centered popup handling for OAuth flows */
export class OAuthPopup {
  /**
   * Opens an OAuth popup (or falls back to navigation) and waits until completion.
   *
   * @param popupUrl Authorization start URL used for the popup window
   * @param fallbackUrl Fallback navigation URL if the popup is blocked
   * @returns Promise that resolves when auth flow completes
   */
  openAndWait(popupUrl: string, fallbackUrl: string): Promise<void> {
    return new Promise((resolve) => {
      const popup = this.openCentered(popupUrl, 500, 600);
      if (!popup) {
        window.location.href = fallbackUrl;
        resolve();
        return;
      }
      const poll = setInterval(() => {
        if (popup.closed) {
          clearInterval(poll);
          resolve();
        }
      }, 300);
    });
  }

  /**
   * Opens a centered popup; navigates current tab if blocked.
   *
   * @param url URL to open
   * @param w Width
   * @param h Height
   * @returns Popup window or null if blocked
   */
  private openCentered(url: string, w: number, h: number): Window | null {
    const vw = window.innerWidth || document.documentElement.clientWidth || screen.width;
    const vh = window.innerHeight || document.documentElement.clientHeight || screen.height;
    const left = vw / 2 - w / 2 + (window.screenX || 0);
    const top = vh / 2 - h / 2 + (window.screenY || 0);
    const features = `scrollbars=yes,width=${w},height=${h},top=${top},left=${left}`;
    const popup = window.open(url, 'td2_auth', features);
    return popup;
  }
}
