<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { clearUiError, toasts, uiError } from './store';
</script>

<svelte:window />

{#if $uiError}
  <div
    class="td2-modal"
    role="button"
    tabindex="0"
    on:keydown={(e) => {
      if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') {
        clearUiError();
      }
    }}
  >
    <div
      class="td2-modal-card"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      on:mousedown|stopPropagation
      on:touchstart|stopPropagation
    >
      <h3>{$uiError.title}</h3>
      <p>{$uiError.body}</p>
      <div class="actions">
        <button
          on:click={() => {
            clearUiError();
          }}
        >
          OK
        </button>
      </div>
    </div>
  </div>
{/if}

<div class="td2-toast-container">
  {#each $toasts as t (t.id)}
    <div class="toast {t.kind}" in:fly={{ y: 10, duration: 120 }} out:fade={{ duration: 150 }}>
      {t.message}
    </div>
  {/each}
  <!-- Keep this element to ensure container exists even when empty -->
  <span style="display:none"></span>
</div>

<style>
  .td2-toast-container {
    position: fixed;
    bottom: 1rem;
    right: 1rem;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    pointer-events: none;
  }
  .toast {
    background: rgba(0, 0, 0, 0.85);
    color: #fff;
    padding: 0.6rem 0.9rem;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    pointer-events: auto;
  }
  .toast.success {
    background: rgba(10, 150, 80, 0.9);
  }
  .toast.error {
    background: rgba(180, 20, 20, 0.9);
  }

  .td2-modal {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    backdrop-filter: blur(1px);
  }
  .td2-modal-card {
    background: #fff;
    color: #222;
    border-radius: 12px;
    padding: 1rem 1.1rem 1.1rem;
    min-width: 260px;
    max-width: 90vw;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2);
  }
  .td2-modal-card h3 {
    margin: 0 0 0.5rem;
    font-size: 1.05rem;
  }
  .td2-modal-card .actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 0.75rem;
  }
  .td2-modal-card button {
    cursor: pointer;
    background: var(--color-primary, #0a7250);
    color: #fff;
    border: none;
    padding: 0.55rem 0.9rem;
    border-radius: 6px;
    font-weight: 600;
    font-size: 0.8rem;
    letter-spacing: 0.5px;
  }
</style>
