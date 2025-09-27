/** Message type posted from the OAuth callback page to the opener */
const AUTH_COMPLETE_MESSAGE = 'td2_auth_complete';

/** Centered popup handling for OAuth flows */
export class OAuthPopup {
  /**
   * Opens an OAuth popup (or falls back to navigation) and waits until completion.
   *
   * @param url Authorization start URL
   * @returns Promise that resolves when auth flow completes
   */
  openAndWait(url: string): Promise<void> {
    return new Promise((resolve) => {
      const popup = this.openCentered(url, 500, 600);
      if (!popup) {
        resolve();
        return;
      }
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        window.removeEventListener('message', onMessage);
        clearInterval(poll);
        resolve();
      };
      const onMessage = (ev: MessageEvent) => {
        if (ev.data && ev.data.type === AUTH_COMPLETE_MESSAGE) finish();
      };
      window.addEventListener('message', onMessage);
      const poll = setInterval(() => {
        if (popup.closed) finish();
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
    if (!popup) window.location.href = url;
    return popup;
  }
}
