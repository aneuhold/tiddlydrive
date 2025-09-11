<script lang="ts">
  import { resolve } from '$app/paths';
  import { getAccessToken, initAuth } from '$lib/auth';
  import { loadFile, parseState, save } from '$lib/drive';
  import { showToast } from '$lib/ui';
  import { onMount, tick } from 'svelte';

  let iframeEl: HTMLIFrameElement;
  let hasState = false;
  // 'loading' controls initial app shell readiness before we know if there is state.
  let loading = true;
  // 'fetchingFile' tracks the network fetch after iframe is mounted.
  let fetchingFile = false;
  let error: string | null = null;
  let autosave = true;
  let hotkey = true;
  let disableSave = false;

  /**
   * Read a simple cookie value by name.
   *
   * @param name cookie name
   * @returns value or null
   */
  function readCookie(name: string): string | null {
    const nameEQ = name + '=';
    return (
      document.cookie
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith(nameEQ))
        ?.substring(nameEQ.length) || null
    );
  }
  /**
   * Write a cookie with expiration in days.
   *
   * @param name cookie name
   * @param value cookie value
   * @param days number of days until expiry
   */
  function writeCookie(name: string, value: string, days: number) {
    const expiry = Date.now() + days * 24 * 60 * 60 * 1000;
    const date = new Date(expiry);
    document.cookie = `${name}=${value}; expires=${date.toUTCString()}; path=/`;
  }
  /** Sync UI boolean prefs from stored cookies. */
  function syncPrefsFromCookies() {
    autosave = readCookie('enableautosave') !== 'false';
    hotkey = readCookie('enablehotkeysave') !== 'false';
    disableSave = readCookie('disablesave') === 'true';
  }
  /**
   * Persist a boolean preference both logically and as a cookie.
   *
   * @param name semantic name (unused placeholder for potential future state map)
   * @param value boolean value to persist
   * @param cookie cookie key
   */
  function persist(name: string, value: boolean, cookie: string) {
    writeCookie(cookie, value ? 'true' : 'false', 364);
  }
  let autosaveInterval: number | null = null;
  /** Start (or restart) autosave interval if enabled. */
  function startAutosaveLoop() {
    if (autosaveInterval) window.clearInterval(autosaveInterval);
    autosaveInterval = window.setInterval(() => {
      if (!autosave || disableSave) return;
      const doc = iframeEl.contentWindow?.document;
      if (!doc) return;
      const html = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
      // Fire and forget
      void save(html, { autosave: true });
    }, 5000);
  }
  /** Register cmd/ctrl + S handler. */
  function registerHotkey() {
    window.addEventListener('keydown', (e) => {
      if (!hotkey) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        manualSave();
      }
    });
  }
  /** Trigger a manual save ignoring autosave state. */
  async function manualSave() {
    if (disableSave) {
      showToast('Save disabled');
      return;
    }
    try {
      const doc = iframeEl.contentWindow?.document;
      if (!doc) return;
      const html = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
      await save(html, {});
    } catch (e) {
      console.error(e);
      error = 'Save failed';
    }
  }
  /** Initiate interactive auth flow. */
  async function authenticate() {
    await getAccessToken({ interactive: true });
  }
  onMount(async () => {
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
      await loadFile(iframeEl);
      startAutosaveLoop();
      registerHotkey();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      fetchingFile = false;
    }
  });
</script>

<svelte:head>
  <title>Tiddly Drive 2 – App</title>
  <script src="https://accounts.google.com/gsi/client" async defer></script>
</svelte:head>

<main class="app-shell">
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
    </div>
  {/if}
  <aside class="panel">
    <h3>Settings</h3>
    <label
      ><input
        type="checkbox"
        bind:checked={autosave}
        on:change={() => {
          persist('enableautosave', autosave, 'enableautosave');
          startAutosaveLoop();
        }}
      /> Autosave</label
    >
    <label
      ><input
        type="checkbox"
        bind:checked={hotkey}
        on:change={() => {
          persist('enablehotkeysave', hotkey, 'enablehotkeysave');
        }}
      /> Hotkey Save</label
    >
    <label
      ><input
        type="checkbox"
        bind:checked={disableSave}
        on:change={() => {
          persist('disablesave', disableSave, 'disablesave');
        }}
      /> Disable Drive Save</label
    >
    <div class="actions">
      <button on:click={manualSave}>Save Now</button>
      <button on:click={authenticate}>Authenticate</button>
    </div>
  </aside>
</main>

<style>
  :root {
    --color-primary: hsla(164, 95%, 28%, 1);
    --color-shadow-light: rgba(0, 0, 0, 0.06);
  }
  .app-shell {
    display: grid;
    grid-template-columns: 1fr 260px;
    gap: 1rem;
    padding: 1rem;
    align-items: start;
    font-family: system-ui, sans-serif;
    background: #f5f7f8;
    min-height: 100vh;
  }
  .wiki-frame {
    width: 100%;
    min-height: 80vh;
    border: 1px solid var(--color-shadow-light);
    border-radius: 8px;
    background: #fff;
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
    grid-column: 1 / span 2;
    background: #fff;
    padding: 2rem;
    border-radius: 12px;
    box-shadow: 0 2px 6px var(--color-shadow-light);
  }
  @media (max-width: 960px) {
    .app-shell {
      grid-template-columns: 1fr;
    }
    .panel {
      order: -1;
    }
  }
</style>
