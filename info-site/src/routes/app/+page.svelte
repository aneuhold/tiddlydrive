<script lang="ts">
  import { getAccessToken, initAuth } from '$lib/td2/auth';
  import { loadFile, parseState, save } from '$lib/td2/drive';
  import { showToast } from '$lib/td2/ui';
  import { onMount } from 'svelte';

  let iframeEl: HTMLIFrameElement;
  let hasState = false;
  let loading = true;
  let error: string | null = null;
  let autosave = true;
  let hotkey = true;
  let disableSave = false;

  /**
   *
   * @param name
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
   *
   * @param name
   * @param value
   * @param days
   */
  function writeCookie(name: string, value: string, days: number) {
    const date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `${name}=${value}; expires=${date.toUTCString()}; path=/`;
  }

  /**
   *
   */
  function syncPrefsFromCookies() {
    autosave = readCookie('enableautosave') !== 'false';
    hotkey = readCookie('enablehotkeysave') !== 'false';
    disableSave = readCookie('disablesave') === 'true';
  }

  /**
   *
   * @param name
   * @param value
   * @param cookie
   */
  function persist(name: string, value: boolean, cookie: string) {
    writeCookie(cookie, value ? 'true' : 'false', 364);
  }

  let autosaveInterval: number | null = null;
  /**
   *
   */
  function startAutosaveLoop() {
    if (autosaveInterval) window.clearInterval(autosaveInterval);
    autosaveInterval = window.setInterval(async () => {
      if (!autosave || disableSave) return;
      try {
        const doc = iframeEl?.contentWindow?.document;
        if (!doc) return;
        const html = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
        await save(html, { autosave: true });
      } catch {}
    }, 5000);
  }

  /**
   *
   */
  function registerHotkey() {
    window.addEventListener('keydown', (e) => {
      if (!hotkey) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        manualSave();
      }
    });
  }

  /**
   *
   */
  async function manualSave() {
    if (disableSave) {
      showToast('Save disabled');
      return;
    }
    try {
      const doc = iframeEl?.contentWindow?.document;
      if (!doc) return;
      const html = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
      await save(html, {});
    } catch (e) {
      console.error(e);
      error = 'Save failed';
    }
  }

  /**
   *
   */
  async function authenticate() {
    await getAccessToken({ interactive: true });
  }

  onMount(async () => {
    syncPrefsFromCookies();
    hasState = !!parseState();
    await initAuth();
    if (!hasState) {
      loading = false;
      return;
    }
    try {
      await loadFile(iframeEl);
      startAutosaveLoop();
      registerHotkey();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head>
  <title>Tiddly Drive 2 – App</title>
  <script src="https://accounts.google.com/gsi/client" async defer></script>
</svelte:head>

<main class="app-shell">
  {#if loading}
    <div class="loader">Loading…</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else if !hasState}
    <div class="nofile">
      <h2>No file state provided</h2>
      <p>Launch this page via Google Drive “Open with”.</p>
    </div>
  {:else}
    <iframe bind:this={iframeEl} title="TiddlyWiki" class="wiki-frame" />
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
  .app-shell {
    display: grid;
    grid-template-columns: 1fr 260px;
    gap: 1rem;
    padding: 1rem;
    align-items: start;
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
