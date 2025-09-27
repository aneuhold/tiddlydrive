import { AuthError } from './errors';
import { AuthErrorCode } from './types';

const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const WEB_API_KEY = 'AIzaSyBa2pekTr_FkdjYQlZDjHGuuxwNO6EY9Pg';

/** Wrapper around the Google API (gapi) loader */
export class GapiClient {
  private client: typeof window.gapi | null = null;
  private loadingPromise: Promise<void> | null = null;

  /**
   * Ensures gapi is loaded and initialized.
   *
   * @returns Promise that resolves when ready
   */
  async ensureLoaded(): Promise<void> {
    if (this.client) return;
    if (this.loadingPromise) return this.loadingPromise;
    this.loadingPromise = this.bootstrap();
    await this.loadingPromise;
  }

  /**
   * Sets the current OAuth access token into gapi.
   *
   * @param token Access token string
   */
  setAccessToken(token: string): void {
    const g = this.client?.client || window.gapi?.client;
    if (!g) throw new AuthError(AuthErrorCode.GapiUnavailable);
    g.setToken({ access_token: token });
  }

  private async bootstrap(): Promise<void> {
    await this.waitForBase();
    await new Promise<void>((resolve) => {
      window.gapi?.load('client', () => {
        resolve();
      });
    });
    const gapiRef = window.gapi;
    if (!gapiRef?.client) throw new AuthError(AuthErrorCode.GapiUnavailable);
    await gapiRef.client.init({ apiKey: WEB_API_KEY, discoveryDocs: [DISCOVERY_DOC] });
    this.client = gapiRef;
  }

  private waitForBase(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.gapi) {
        resolve();
        return;
      }
      const iv = setInterval(() => {
        if (window.gapi) {
          clearInterval(iv);
          resolve();
        }
      }, 50);
      setTimeout(() => {
        if (!window.gapi) {
          clearInterval(iv);
          reject(new AuthError(AuthErrorCode.GapiUnavailable));
        }
      }, 10000);
    });
  }
}
