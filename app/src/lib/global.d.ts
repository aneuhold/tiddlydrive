import type { GoogleOAuth2TokenResponse, GoogleTokenClient } from '$lib/types';
import type { TiddlyWiki } from './services/tiddlyWiki/types';

// Minimal ambient declarations for Google Identity Services and TiddlyWiki
declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (resp: GoogleOAuth2TokenResponse) => void;
          }) => GoogleTokenClient;
        };
      };
    };
    $tw?: TiddlyWiki;
    gapi?: typeof gapi;
  }
}
export {};
