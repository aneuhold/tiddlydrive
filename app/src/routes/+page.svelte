<script lang="ts">
  import { resolve } from '$app/paths';
  import { initAuth, reauthenticateWithConsent } from '$lib/auth';
  import { prefsStore } from '$lib/prefs';
  import googleDriveService from '$lib/services/googleDriveService';

  import FloatingActionButton from '$lib/ui/FloatingActionButton.svelte';
  import SettingsDialog from '$lib/ui/SettingsDialog.svelte';
  import UiHost, { showError, showToast } from '$lib/ui/UiHost.svelte';
  import { onMount, tick } from 'svelte';

  type Status = 'initializing' | 'no-state' | 'loading' | 'ready' | 'error';

  let iframeEl = $state<HTMLIFrameElement | null>(null);
  let status = $state<Status>('initializing');
  let error = $state<string | null>(null);
  let showSettings = $state(false);
  let hideFab = $state(false);

  /** Force re-authentication with consent prompt, clearing any cached tokens. */
  const forceAuthenticate = async (): Promise<void> => {
    try {
      // Force a fresh authentication with consent prompt
      await reauthenticateWithConsent();
      showToast('Re-authenticated successfully');
    } catch (error) {
      console.error('Force authentication failed:', error);
      showError('Authentication failed', error instanceof Error ? error.message : String(error));
    }
  };

  onMount(() => {
    (async () => {
      // prefs loaded via store initialization
      const hasState = !!googleDriveService.parseState();
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
        await googleDriveService.loadFile(frame);
        googleDriveService.registerWikiSaver(frame, {
          preferences: () => $prefsStore
        });
        status = 'ready';
      } catch (e) {
        error = (e as Error).message;
        status = 'error';
      }
    })();
  });
</script>

<svelte:head>
  <title>Tiddly Drive 2 – App</title>
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
      {#if !hideFab}
        <FloatingActionButton
          open={showSettings}
          onClick={() => (showSettings = !showSettings)}
          label="Toggle settings"
        />
      {/if}
      <SettingsDialog
        open={showSettings}
        {hideFab}
        onAuthenticate={forceAuthenticate}
        onClose={() => (showSettings = false)}
        onHideFabChange={(value) => {
          hideFab = value;
        }}
      />
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
  }
  .app-shell {
    font-family: system-ui, sans-serif;
    color: #222;
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background-color: #e0e0e0;
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
  /* button base styles remain in child components */
  .error,
  .nofile {
    background: #fff;
    padding: 2rem;
    border-radius: 12px;
    box-shadow: 0 2px 6px var(--color-shadow-light);
    margin: 2rem;
  }
  /* responsive tweaks handled by dialog native sizing */
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
