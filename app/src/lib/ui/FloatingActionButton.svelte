<script lang="ts">
  const props = $props<{
    open?: boolean;
    label?: string;
    onClick?: () => void;
  }>();
</script>

<button
  class="settings-fab"
  aria-label={props.label ?? 'Toggle settings'}
  onclick={() => props.onClick?.()}
>
  {props.open ? '×' : '⚙'}
</button>

<style>
  .settings-fab {
    position: absolute;
    bottom: 2rem;
    right: 2rem;
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
</style>
