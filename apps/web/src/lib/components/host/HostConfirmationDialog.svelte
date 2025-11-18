<script lang="ts">
  import { t } from '$lib/i18n';

  export let showConfirmDialog = false;
  export let confirmMessage = '';
  export let confirmAction: (() => void) | null = null;

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
    }
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
    <div class="confirm-dialog" on:click|stopPropagation role="document">
      <h3 id="confirm-title">{t('common.button.confirm')}</h3>
      <p id="confirm-message">{confirmMessage}</p>
      <div class="confirm-buttons">
        <button on:click={confirm} class="btn-primary">{t('common.button.confirm')}</button>
        <button on:click={cancelConfirm} class="btn-secondary">{t('common.button.cancel')}</button>
      </div>
    </div>
  </div>
{/if}

