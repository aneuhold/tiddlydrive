<!--
Fun spinner. Created by Claude 4. Can't take credit for this one 😅

@component
-->
<script lang="ts">
  const { size = '40px' } = $props<{
    size?: string;
  }>();
</script>

<div class="spinner-container" style="--spinner-size: {size};">
  <div class="spinner">
    <div class="dot dot1"></div>
    <div class="dot dot2"></div>
    <div class="dot dot3"></div>
    <div class="center-circle"></div>
  </div>
</div>

<style>
  .spinner-container {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .spinner {
    position: relative;
    width: var(--spinner-size);
    height: var(--spinner-size);
    animation: spin 2s linear infinite;
  }

  .dot {
    position: absolute;
    width: 20%;
    height: 20%;
    border-radius: 50%;
    background: var(--color-primary);
    animation: pulse 1.5s ease-in-out infinite;
  }

  .dot1 {
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    animation-delay: 0s;
  }

  .dot2 {
    top: 50%;
    right: 0;
    transform: translateY(-50%);
    animation-delay: 0.5s;
  }

  .dot3 {
    bottom: 0;
    left: 50%;
    transform: translate(-50%, 0);
    animation-delay: 1s;
  }

  .center-circle {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 30%;
    height: 30%;
    border: 2px solid var(--color-primary);
    border-radius: 50%;
    transform: translate(-50%, -50%);
    animation: centerPulse 2s ease-in-out infinite;
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  @keyframes pulse {
    0%,
    100% {
      transform: scale(0.8);
      opacity: 0.5;
    }
    50% {
      transform: scale(1.2);
      opacity: 1;
    }
  }

  @keyframes centerPulse {
    0%,
    100% {
      transform: translate(-50%, -50%) scale(0.8);
      opacity: 0.3;
    }
    50% {
      transform: translate(-50%, -50%) scale(1.1);
      opacity: 0.8;
    }
  }
</style>
