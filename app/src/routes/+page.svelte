<script lang="ts">
  import { resolve } from '$app/paths';
  import { getAccessToken, initAuth } from '$lib/auth';
  import { loadFile, parseState, registerWikiSaver } from '$lib/drive';
  import { showToast } from '$lib/ui';
  import UiHost from '$lib/ui/UiHost.svelte';
  import { onMount, tick } from 'svelte';

  type Status = 'initializing' | 'no-state' | 'loading' | 'ready' | 'error';

  let iframeEl = $state<HTMLIFrameElement | null>(null);
  let status = $state<Status>('initializing');
  let error = $state<string | null>(null);
  let showSettings = $state(false);
  let settingsDialog = $state<HTMLDialogElement | null>(null);

  // Legacy cookie writer is no longer used; prefs persist via localStorage.
  const PREFS_KEY = 'td2:prefs';
  type Prefs = { autosave: boolean; hotkey: boolean; disableSave: boolean };
  const prefs = $state<Prefs>({ autosave: true, hotkey: true, disableSave: false });

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

  /** Load prefs from localStorage (fallback to cookies for backward-compat). */
  const loadPrefs = (): void => {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Prefs>;
        prefs.autosave = parsed.autosave ?? prefs.autosave;
        prefs.hotkey = parsed.hotkey ?? prefs.hotkey;
        prefs.disableSave = parsed.disableSave ?? prefs.disableSave;
        return;
      }
    } catch {
      /* ignore */
    }
    // Back-compat with old cookies
    prefs.autosave = readCookie('enableautosave') !== 'false';
    prefs.hotkey = readCookie('enablehotkeysave') !== 'false';
    prefs.disableSave = readCookie('disablesave') === 'true';
  };

  /** Persist preferences to localStorage. */
  const persistPrefs = (): void => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  };

  /**
   * Register cmd/ctrl + S handler.
   *
   * @returns Cleanup function to unregister the handler
   */
  const registerHotkey = (): (() => void) => {
    const handler = (e: KeyboardEvent): void => {
      if (!prefs.hotkey) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        manualSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  };

  /** Trigger a save via TiddlyWiki's saver (no direct HTML serialization). */
  const manualSave = (): void => {
    if (prefs.disableSave) {
      showToast('Save disabled');
      return;
    }
    try {
      const win = iframeEl?.contentWindow as unknown as {
        $tw?: { saverHandler?: { saveWiki?: () => void } };
      };
      const saveWiki = win.$tw?.saverHandler?.saveWiki;
      if (typeof saveWiki === 'function') {
        saveWiki();
      } else {
        showToast('TiddlyWiki not ready');
      }
    } catch (e) {
      console.error(e);
      error = 'Save failed';
    }
  };

  /** Initiate interactive auth flow. */
  const authenticate = async (): Promise<void> => {
    await getAccessToken();
  };

  onMount(() => {
    let unregisterHotkey: (() => void) | null = null;
    (async () => {
      loadPrefs();
      const hasState = !!parseState();
      if (!hasState) {
        status = 'no-state';
        return;
      }
      await initAuth();
      status = 'loading';
      // Mount iframe before attempting load
      await tick();
      try {
        if (iframeEl === null) {
          error = 'Internal error: frame missing';
          status = 'error';
          return;
        }
        const frame = iframeEl;
        await loadFile(frame);
        registerWikiSaver(frame, {
          disableSave: () => prefs.disableSave,
          autosaveEnabled: () => prefs.autosave
        });
        unregisterHotkey = registerHotkey();
        status = 'ready';
      } catch (e) {
        error = (e as Error).message;
        status = 'error';
      }
    })();
    return () => {
      if (unregisterHotkey) unregisterHotkey();
    };
  });

  $effect(() => {
    const dlg = settingsDialog;
    if (!dlg) return;
    if (showSettings) {
      if (!dlg.open) dlg.showModal();
    } else if (dlg.open) {
      dlg.close();
    }
  });
</script>

<svelte:head>
  <title>Tiddly Drive 2 – App</title>
  <script src="https://accounts.google.com/gsi/client" async defer></script>
</svelte:head>

<main class="app-shell" class:hasfile={status === 'ready'}>
  {#if status === 'error' && error}
    <div class="error">{error}</div>
  {:else if status === 'no-state'}
    <div class="nofile">
      <h2>No file state provided</h2>
      <p>Launch this page via Google Drive “Open with”.</p>
      <p>
        Need info about the project? Visit the <a href={resolve('/info')}>info site</a>.
      </p>
    </div>
  {:else}
    <div class="frame-wrapper">
      {#if status === 'loading'}
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
      <dialog
        bind:this={settingsDialog}
        class="settings-dialog"
        onclose={() => (showSettings = false)}
        onclick={(e) => {
          if (e.target === settingsDialog) showSettings = false;
        }}
        aria-label="Settings"
      >
        <div class="panel">
          <h3>Settings</h3>
          <label
            ><input
              type="checkbox"
              bind:checked={prefs.autosave}
              onchange={() => {
                persistPrefs();
              }}
            /> Autosave</label
          >
          <label
            ><input
              type="checkbox"
              bind:checked={prefs.hotkey}
              onchange={() => {
                persistPrefs();
              }}
            /> Hotkey Save</label
          >
          <label
            ><input
              type="checkbox"
              bind:checked={prefs.disableSave}
              onchange={() => {
                persistPrefs();
              }}
            /> Disable Drive Save</label
          >
          <div class="actions">
            <button onclick={authenticate}>Authenticate</button>
            <button class="secondary" onclick={() => (showSettings = false)}>Close</button>
          </div>
        </div>
      </dialog>
    </div>
  {/if}
  <UiHost />
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
    bottom: 0.75rem;
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
  dialog.settings-dialog {
    border: none;
    border-radius: 12px;
    padding: 0;
    max-width: min(92vw, 420px);
    width: 92vw;
  }
  :global(dialog.settings-dialog::backdrop) {
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(1px);
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
  button.secondary {
    background: #e1e1e1;
    color: #222;
  }
  button:hover {
    filter: brightness(1.08);
  }
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
