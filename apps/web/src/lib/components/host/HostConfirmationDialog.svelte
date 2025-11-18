<script lang="ts">
  import { t } from '$lib/i18n';
  import { onMount } from 'svelte';

  export let showConfirmDialog = false;
  export let confirmMessage = '';
  export let confirmAction: (() => void) | null = null;

  let dialogElement: HTMLDivElement | null = null;

  function cancelConfirm() {
    showConfirmDialog = false;
    confirmAction = null;
  }

  function confirm() {
    if (confirmAction) {
      confirmAction();
    }
    showConfirmDialog = false;
    confirmAction = null;
  }

  function handleConfirmKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      cancelConfirm();
    } else if (event.key === 'Enter' && event.target === dialogElement) {
      confirm();
    }
  }

  // Focus the dialog when it opens for accessibility
  $: if (showConfirmDialog && dialogElement) {
    // Use setTimeout to ensure the element is rendered before focusing
    setTimeout(() => {
      dialogElement?.focus();
    }, 0);
  }
</script>

{#if showConfirmDialog}
  <div
    class="confirm-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="confirm-title"
    aria-describedby="confirm-message"
    on:click={cancelConfirm}
    on:keydown={handleConfirmKeydown}
    tabindex="-1"
  >
    <div
      bind:this={dialogElement}
      class="confirm-dialog"
      on:click|stopPropagation
      on:keydown={handleConfirmKeydown}
      role="dialog"
      tabindex="-1"
    >
      <div class="confirm-header">
        <h3 id="confirm-title">⚠️ {t('common.button.confirm')}</h3>
      </div>
      <div class="confirm-body">
        <p id="confirm-message">{confirmMessage}</p>
      </div>
      <div class="confirm-buttons">
        <button on:click={cancelConfirm} class="btn-secondary">{t('common.button.cancel')}</button>
        <button on:click={confirm} class="btn-danger">{t('common.button.confirm')}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .confirm-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
    padding: 1rem;
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .confirm-dialog {
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    border: 3px solid #ffd700;
    border-radius: 1rem;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), 0 0 40px rgba(255, 215, 0, 0.2);
    max-width: 500px;
    width: 100%;
    animation: slideUp 0.3s ease-out;
    overflow: hidden;
  }

  @keyframes slideUp {
    from {
      transform: translateY(20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .confirm-header {
    padding: 1.5rem 1.5rem 1rem 1.5rem;
    border-bottom: 2px solid rgba(255, 215, 0, 0.3);
    background: rgba(0, 0, 0, 0.2);
  }

  .confirm-header h3 {
    margin: 0;
    font-size: 1.5rem;
    color: #ffd700;
    text-align: center;
    font-weight: bold;
  }

  .confirm-body {
    padding: 1.5rem;
  }

  .confirm-body p {
    margin: 0;
    font-size: 1.1rem;
    color: rgba(255, 255, 255, 0.9);
    text-align: center;
    line-height: 1.6;
  }

  .confirm-buttons {
    display: flex;
    gap: 1rem;
    padding: 1rem 1.5rem 1.5rem 1.5rem;
    justify-content: flex-end;
  }

  .confirm-buttons button {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.2s;
    min-width: 100px;
  }

  .confirm-buttons .btn-secondary {
    background: rgba(255, 255, 255, 0.1);
    color: white;
    border: 2px solid rgba(255, 255, 255, 0.2);
  }

  .confirm-buttons .btn-secondary:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(255, 255, 255, 0.2);
  }

  .confirm-buttons .btn-danger {
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
    color: white;
    border: 2px solid #dc2626;
  }

  .confirm-buttons .btn-danger:hover {
    background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(220, 38, 38, 0.5);
  }

  .confirm-buttons .btn-danger:active {
    transform: translateY(0);
  }

  .confirm-buttons .btn-secondary:active {
    transform: translateY(0);
  }

  /* Mobile Responsive */
  @media (max-width: 768px) {
    .confirm-dialog {
      max-width: 90vw;
    }

    .confirm-header h3 {
      font-size: 1.25rem;
    }

    .confirm-body p {
      font-size: 1rem;
    }

    .confirm-buttons {
      flex-direction: column-reverse;
    }

    .confirm-buttons button {
      width: 100%;
    }
  }
</style>

