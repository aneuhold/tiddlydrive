/**
 * TiddlyWiki saver entry minimal shape used by the app.
 */
export type TWSaver = {
  info: { name: string; priority: number; capabilities: string[] };
  save: (text: string, method: string, callback: (err?: string) => void) => Promise<boolean>;
};

/**
 * TiddlyWiki saver handler shape used by the app.
 */
export type TWSaverHandler = {
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
};

/**
 * Returns the TiddlyWiki ($tw) object from a window, if available.
 *
 * @param win The window object to extract $tw from
 * @returns The TiddlyWiki object or undefined
 */
export const getTiddlyWikiFromWindow = (win: Window | null): TiddlyWiki | undefined => {
  return (win as unknown as { $tw?: TiddlyWiki } | null)?.$tw;
};
