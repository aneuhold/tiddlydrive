import type { TiddlyWiki } from './types.js';

// Minimal ambient declarations for Google Identity Services and TiddlyWiki
declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (resp: unknown) => void;
          }) => unknown;
        };
      };
    };
    $tw?: TiddlyWiki;
  }
}
export {};
