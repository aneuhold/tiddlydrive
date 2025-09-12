<script lang="ts" module>
  export type Prefs = { autosave: boolean; hotkey: boolean; disableSave: boolean };
</script>

<script lang="ts">
  import { resolve } from '$app/paths';

  const props = $props<{
    open: boolean;
    prefs: import('./SettingsDialog.svelte').Prefs;
    hideFab?: boolean;
    onClose?: () => void;
    onAuthenticate?: () => void;
    onPrefsChange?: (p: { key: 'autosave' | 'hotkey' | 'disableSave'; value: boolean }) => void;
    onHideFabChange?: (value: boolean) => void;
  }>();

  let dialogEl = $state<HTMLDialogElement | null>(null);

  $effect(() => {
    const dlg = dialogEl;
    if (!dlg) return;
    if (props.open) {
      if (!dlg.open) dlg.showModal();
    } else if (dlg.open) {
      dlg.close();
    }
  });
</script>

<dialog
  bind:this={dialogEl}
  class="settings-dialog"
  onclose={() => props.onClose?.()}
  onclick={(e) => {
    if (e.target === dialogEl) props.onClose?.();
  }}
  aria-label="Settings"
>
  <div class="panel">
    <h3>Settings</h3>

    <label>
      <input
        type="checkbox"
        checked={props.prefs.autosave}
        onchange={(e) =>
          props.onPrefsChange?.({
            key: 'autosave',
            value: (e.currentTarget as HTMLInputElement).checked
          })}
      />
      Autosave
    </label>

    <label>
      <input
        type="checkbox"
        checked={props.prefs.hotkey}
        onchange={(e) =>
          props.onPrefsChange?.({
            key: 'hotkey',
            value: (e.currentTarget as HTMLInputElement).checked
          })}
      />
      Hotkey Save
    </label>

    <label>
      <input
        type="checkbox"
        checked={props.prefs.disableSave}
        onchange={(e) =>
          props.onPrefsChange?.({
            key: 'disableSave',
            value: (e.currentTarget as HTMLInputElement).checked
          })}
      />
      Disable Drive Save
    </label>

    <label>
      <input
        type="checkbox"
        checked={!!props.hideFab}
        onchange={(e) => props.onHideFabChange?.((e.currentTarget as HTMLInputElement).checked)}
      />
      Hide settings button until next reload
    </label>

    <p class="help">
      Learn more on the
      <a href={resolve('/info')} target="_blank" rel="noreferrer noopener">info site</a>.
    </p>

    <div class="actions">
      <button onclick={() => props.onAuthenticate?.()}>Authenticate</button>
      <button class="secondary" onclick={() => props.onClose?.()}>Close</button>
    </div>
  </div>
</dialog>

<style>
  dialog.settings-dialog {
    border: none;
    border-radius: 12px;
    padding: 0;
    max-width: min(92vw, 420px);
    width: 92vw;
  }
  :global(dialog.settings-dialog::backdrop) {
    background: rgba(0, 0, 0, 0.3);
  }
  .panel {
    background: #fff;
    padding: 0.9rem 1rem 1.2rem;
    border-radius: 12px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
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
  .help {
    margin: 0.25rem 0 0.25rem;
    color: #333;
  }
  .help a {
    color: #0a8f6a;
    text-decoration: underline;
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
  button {
    cursor: pointer;
    background: hsla(164, 95%, 28%, 1);
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
</style>
