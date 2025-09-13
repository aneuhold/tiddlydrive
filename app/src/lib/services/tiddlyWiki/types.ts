/**
 * Minimal TiddlyWiki interface exposed on `window.$tw` that we rely on.
 */
export type TiddlyWiki = {
  saverHandler?: TWSaverHandler;
  wiki: {
    getTiddler: (title: string) => Tiddler | undefined;
  };
};

/**
 * TiddlyWiki saver handler shape used by the app. This is the object at `window.$tw.saverHandler`.
 */
export type TWSaverHandler = {
  savers: TWSaver[];
  numChanges: number;
  updateDirtyStatus: () => void;
  saveWiki: () => Promise<void>;
};

/**
 * TiddlyWiki saver entry minimal shape used by the app.
 */
export type TWSaver = {
  info: { name: string; priority: number; capabilities: string[] };
  save: (text: string, method: string, callback: (err?: string) => void) => Promise<boolean>;
};

export type Tiddler = {
  fields: {
    text: string;
    title: string;
    /** The type can be used to identify special tiddlers like the favicon (type: 'image/x-icon'). */
    type: string;
  };
};

// Saver contracts shared across modules
import type { Prefs } from '$lib/prefs';

/** Options used when registering the TiddlyWiki saver integration. */
export type SaverOptions = {
  preferences: () => Prefs;
};

/** Options for saving a wiki. */
export type SaveOptions = {
  autosave?: boolean;
};

/** Function signature for save operations that can be registered with TiddlyWiki. */
export type SaveFunction = (html: string, options?: SaveOptions) => Promise<boolean>;

/** Configuration for registering a custom saver with TiddlyWiki. */
export type SaverRegistrationConfig = {
  name: string;
  priority: number;
  saveFunction: SaveFunction;
  onSaveSuccess?: (tw: TiddlyWiki, prefs: Prefs) => void;
};
