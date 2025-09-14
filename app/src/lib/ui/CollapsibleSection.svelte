<script lang="ts">
  import type { Snippet } from 'svelte';
  const { title, children } = $props<{
    title: string;
    children?: Snippet;
  }>();
</script>

<details class="collapsible">
  <summary>{title}</summary>
  <div class="content">
    {@render children?.()}
  </div>
  <div class="divider"></div>
</details>

<style>
  .collapsible {
    border: 1px solid #e6e6e6;
    border-radius: 8px;
    background: #fafafa;
    padding: 0.25rem 0.5rem 0.5rem;
  }
  /* spacing handled by parent layout */
  summary {
    cursor: pointer;
    font-weight: 600;
    list-style: none;
    outline: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary:before {
    content: '▸';
    display: inline-block;
    margin-right: 0.35rem;
    transition: transform 120ms ease;
  }
  details[open] summary:before {
    transform: rotate(90deg);
  }
  .content {
    margin-top: 0.35rem;
    padding-left: 1.1rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .divider {
    height: 0.25rem;
  }
</style>
