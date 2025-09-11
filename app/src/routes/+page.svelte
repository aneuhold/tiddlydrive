<script lang="ts">
  import { resolve } from '$app/paths';
  import { getAccessToken, initAuth } from '$lib/auth';
  import { loadFile, parseState, registerWikiSaver, save } from '$lib/drive';
  import { showToast } from '$lib/ui';
  import { onMount, tick } from 'svelte';

  let iframeEl = $state<HTMLIFrameElement | null>(null);
  let hasState = $state(false);
  // 'loading' controls initial app shell readiness before we know if there is state.
  let loading = $state(true);
  // 'fetchingFile' tracks the network fetch after iframe is mounted.
  let fetchingFile = $state(false);
  let error = $state<string | null>(null);
  let autosave = $state(true);
  let hotkey = $state(true);
  let disableSave = $state(false);
  let showSettings = $state(false);

  /**
   * Read a simple cookie value by name.
   *
   * @param name cookie name
   * @returns cookie value or null when missing
   */
  const readCookie = (name: string): string | null => {
    const nameEQ = name + '=';
    return (
      document.cookie
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith(nameEQ))
        ?.substring(nameEQ.length) || null
    );
  };

  /**
   * Write a cookie with expiration in days.
   *
   * @param name cookie name
   * @param value cookie value
   * @param days number of days until expiry
   */
  const writeCookie = (name: string, value: string, days: number): void => {
    const expiry = Date.now() + days * 24 * 60 * 60 * 1000;
    const date = new Date(expiry);
    document.cookie = `${name}=${value}; expires=${date.toUTCString()}; path=/`;
  };

  /** Sync UI boolean prefs from stored cookies. */
  const syncPrefsFromCookies = (): void => {
    autosave = readCookie('enableautosave') !== 'false';
    hotkey = readCookie('enablehotkeysave') !== 'false';
    disableSave = readCookie('disablesave') === 'true';
  };

  /**
   * Persist a boolean preference both logically and as a cookie.
   *
   * @param name semantic name (unused placeholder for potential future state map)
   * @param value boolean value to persist
   * @param cookie cookie key
   */
  const persist = (name: string, value: boolean, cookie: string): void => {
    writeCookie(cookie, value ? 'true' : 'false', 364);
  };

  /**
   * Register cmd/ctrl + S handler.
   *
   * @returns Cleanup function to unregister the handler
   */
  const registerHotkey = (): (() => void) => {
    const handler = (e: KeyboardEvent): void => {
      if (!hotkey) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void manualSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  };

  /** Trigger a manual save ignoring autosave state. */
  const manualSave = async (): Promise<void> => {
    if (disableSave) {
      showToast('Save disabled');
      return;
    }
    try {
      const doc = iframeEl?.contentWindow?.document;
      if (!doc) return;
      const html = `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
      await save(html, {});
    } catch (e) {
      console.error(e);
      error = 'Save failed';
    }
  };

  /** Initiate interactive auth flow. */
  const authenticate = async (): Promise<void> => {
    await getAccessToken({ interactive: true });
  };

  onMount(() => {
    let unregisterHotkey: (() => void) | null = null;
    (async () => {
      syncPrefsFromCookies();
      hasState = !!parseState();
      await initAuth();
      // Allow main UI (and iframe if applicable) to mount
      loading = false;
      if (!hasState) return;
      // Mount iframe before attempting load
      await tick();
      fetchingFile = true;
      try {
        if (iframeEl === null) {
          error = 'Internal error: frame missing';
          return;
        }
        const frame = iframeEl;
        await loadFile(frame);
        registerWikiSaver(frame, {
          disableSave: () => disableSave,
          autosaveEnabled: () => autosave
        });
        unregisterHotkey = registerHotkey();
      } catch (e) {
        error = (e as Error).message;
      } finally {
        fetchingFile = false;
      }
    })();
    return () => {
      if (unregisterHotkey) unregisterHotkey();
    };
  });
</script>

<svelte:head>
  <title>Tiddly Drive 2 – App</title>
  <script src="https://accounts.google.com/gsi/client" async defer></script>
</svelte:head>

<main class="app-shell" class:hasfile={hasState && !error}>
  {#if loading}
    <div class="loader">Initializing…</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else if !hasState}
    <div class="nofile">
      <h2>No file state provided</h2>
      <p>Launch this page via Google Drive “Open with”.</p>
      <p>
        Need info about the project? Visit the <a href={resolve('/info')}>info site</a>.
      </p>
    </div>
  {:else}
    <div class="frame-wrapper">
      {#if fetchingFile}
        <div class="overlay">Loading file…</div>
      {/if}
      <iframe bind:this={iframeEl} title="TiddlyWiki" class="wiki-frame"></iframe>
      <button
        class="settings-fab"
        onclick={() => (showSettings = !showSettings)}
        aria-label="Toggle settings"
      >
        {showSettings ? '×' : '⚙'}
      </button>
      {#if showSettings}
        <aside class="panel settings-overlay">
          <h3>Settings</h3>
          <label
            ><input
              type="checkbox"
              bind:checked={autosave}
              onchange={() => {
                persist('enableautosave', autosave, 'enableautosave');
              }}
            /> Autosave</label
          >
          <label
            ><input
              type="checkbox"
              bind:checked={hotkey}
              onchange={() => {
                persist('enablehotkeysave', hotkey, 'enablehotkeysave');
              }}
            /> Hotkey Save</label
          >
          <label
            ><input
              type="checkbox"
              bind:checked={disableSave}
              onchange={() => {
                persist('disablesave', disableSave, 'disablesave');
              }}
            /> Disable Drive Save</label
          >
          <div class="actions">
            <button onclick={manualSave}>Save Now</button>
            <button onclick={authenticate}>Authenticate</button>
          </div>
        </aside>
      {/if}
    </div>
  {/if}
</main>

<style>
  :root {
    --color-primary: hsla(164, 95%, 28%, 1);
    --color-shadow-light: rgba(0, 0, 0, 0.06);
  }
  :global(html),
  :global(body),
  .app-shell {
    margin: 0;
    padding: 0;
    height: 100%;
  }
  .app-shell {
    font-family: system-ui, sans-serif;
    background: #111;
    color: #222;
    min-height: 100vh;
    position: relative;
  }
  .frame-wrapper {
    position: relative;
    width: 100%;
    height: 100vh;
    overflow: hidden;
  }
  .wiki-frame {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    border: 0;
    background: #fff;
  }
  .settings-fab {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    z-index: 50;
    background: var(--color-primary);
    color: #fff;
    border: none;
    width: 42px;
    height: 42px;
    border-radius: 50%;
    font-size: 1.1rem;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
  }
  .settings-overlay {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    z-index: 40;
    background: #fff;
    max-height: calc(100vh - 1.5rem);
    overflow-y: auto;
    width: 270px;
  }
  .panel {
    background: #fff;
    padding: 0.9rem 1rem 1.2rem;
    border-radius: 12px;
    box-shadow: 0 2px 6px var(--color-shadow-light);
    font-size: 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }
  .panel h3 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
  }
  .panel label {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    font-weight: 500;
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }
  button {
    cursor: pointer;
    background: var(--color-primary);
    color: #fff;
    border: none;
    padding: 0.55rem 0.9rem;
    border-radius: 6px;
    font-weight: 600;
    font-size: 0.8rem;
    letter-spacing: 0.5px;
  }
  button:hover {
    filter: brightness(1.08);
  }
  .loader,
  .error,
  .nofile {
    background: #fff;
    padding: 2rem;
    border-radius: 12px;
    box-shadow: 0 2px 6px var(--color-shadow-light);
    margin: 2rem;
  }
  @media (max-width: 960px) {
    .settings-overlay {
      width: 85%;
    }
  }
  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.3);
    color: #fff;
    font-size: 1.2rem;
    z-index: 10;
    backdrop-filter: blur(1px);
  }
</style>
