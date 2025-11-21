<script lang="ts">
  import { browser } from '$app/environment';
  import { t } from '$lib/i18n';
  
  export let dialogId: string;
  export let title: string;
  export let setName: string;
  export let setDescription: string;
  export let creating: boolean;
  export let onCreate: () => void;
  
  function closeDialog() {
    if (browser) {
      const dialog = document.getElementById(dialogId);
      if (dialog instanceof HTMLDialogElement) {
        dialog.close();
      }
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      closeDialog();
    }
  }

  function handleBackdropClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (target.id === dialogId || target.classList.contains('dialog-backdrop')) {
      closeDialog();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<dialog id={dialogId} class="create-set-dialog" on:click={handleBackdropClick}>
  <div class="dialog-backdrop"></div>
  <div class="dialog-content" on:click|stopPropagation>
    <div class="dialog-header">
      <div class="header-icon">✨</div>
      <h3 class="dialog-title">{title}</h3>
      <button
        type="button"
        on:click={closeDialog}
        class="close-button"
        aria-label="Close dialog"
      >
        ✕
      </button>
    </div>
    
    <div class="dialog-body">
      <div class="form-field">
        <label for="set-name" class="form-label">
          <span class="label-icon">📝</span>
          {t('createSet.setName')}
          <span class="required">*</span>
        </label>
        <input
          id="set-name"
          type="text"
          bind:value={setName}
          placeholder={t('createSet.setNamePlaceholder')}
          class="form-input"
          maxlength="255"
          disabled={creating}
          autofocus
        />
        <div class="char-count">{setName.length}/255</div>
      </div>
      
      <div class="form-field">
        <label for="set-description" class="form-label">
          <span class="label-icon">📄</span>
          {t('createSet.description')}
        </label>
        <textarea
          id="set-description"
          bind:value={setDescription}
          placeholder={t('createSet.descriptionPlaceholder')}
          class="form-textarea"
          rows="3"
          disabled={creating}
        ></textarea>
      </div>
    </div>
    
    <div class="dialog-footer">
      <button
        type="button"
        on:click={closeDialog}
        class="btn-cancel"
        disabled={creating}
      >
        {t('common.button.cancel')}
      </button>
      <button
        type="button"
        on:click={onCreate}
        disabled={creating || !setName.trim()}
        class="btn-create"
        class:creating={creating}
      >
        {#if creating}
          <span class="spinner"></span>
          <span>{t('createSet.creating')}</span>
        {:else}
          <span class="button-icon">✨</span>
          <span>{t('createSet.createSet')}</span>
        {/if}
      </button>
    </div>
  </div>
</dialog>

<style>
  .create-set-dialog {
    position: fixed;
    inset: 0;
    z-index: 2000;
    border: none;
    padding: 0;
    background: transparent;
    animation: fadeIn 0.2s ease-out;
  }

  .create-set-dialog::backdrop {
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(8px);
  }

  .dialog-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(8px);
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .dialog-content {
    position: relative;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
    border: 2px solid rgba(255, 215, 0, 0.4);
    border-radius: 1.25rem;
    box-shadow: 
      0 20px 60px rgba(0, 0, 0, 0.6),
      0 0 40px rgba(255, 215, 0, 0.15),
      inset 0 1px 0 rgba(255, 255, 255, 0.1);
    max-width: 500px;
    width: calc(100% - 2rem);
    margin: auto;
    display: flex;
    flex-direction: column;
    animation: slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    overflow: hidden;
  }

  @keyframes slideUp {
    from {
      transform: translateY(30px) scale(0.95);
      opacity: 0;
    }
    to {
      transform: translateY(0) scale(1);
      opacity: 1;
    }
  }

  .dialog-header {
    padding: 1.5rem;
    border-bottom: 2px solid rgba(255, 215, 0, 0.2);
    background: linear-gradient(180deg, rgba(255, 215, 0, 0.1) 0%, transparent 100%);
    display: flex;
    align-items: center;
    gap: 1rem;
    position: relative;
  }

  .header-icon {
    font-size: 2rem;
    animation: sparkle 2s ease-in-out infinite;
    filter: drop-shadow(0 0 8px rgba(255, 215, 0, 0.6));
  }

  @keyframes sparkle {
    0%, 100% {
      transform: scale(1) rotate(0deg);
      filter: drop-shadow(0 0 8px rgba(255, 215, 0, 0.6));
    }
    50% {
      transform: scale(1.1) rotate(5deg);
      filter: drop-shadow(0 0 12px rgba(255, 215, 0, 0.9));
    }
  }

  .dialog-title {
    flex: 1;
    font-size: 1.5rem;
    font-weight: bold;
    color: #ffd700;
    margin: 0;
    text-shadow: 0 2px 8px rgba(255, 215, 0, 0.3);
  }

  .close-button {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: rgba(255, 255, 255, 0.8);
    font-size: 1.25rem;
    width: 2rem;
    height: 2rem;
    border-radius: 0.5rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .close-button:hover {
    background: rgba(255, 255, 255, 0.2);
    color: white;
    transform: rotate(90deg);
  }

  .dialog-body {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .form-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.95rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.95);
  }

  .label-icon {
    font-size: 1.1rem;
  }

  .required {
    color: #ff6b6b;
    margin-left: 0.25rem;
  }

  .form-input,
  .form-textarea {
    width: 100%;
    padding: 0.875rem 1rem;
    background: rgba(255, 255, 255, 0.08);
    border: 2px solid rgba(255, 215, 0, 0.3);
    border-radius: 0.75rem;
    color: white;
    font-size: 1rem;
    font-family: inherit;
    transition: all 0.2s;
  }

  .form-input:focus,
  .form-textarea:focus {
    outline: none;
    border-color: #ffd700;
    background: rgba(255, 255, 255, 0.12);
    box-shadow: 
      0 0 0 3px rgba(255, 215, 0, 0.15),
      0 4px 12px rgba(255, 215, 0, 0.1);
  }

  .form-input:disabled,
  .form-textarea:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .form-textarea {
    resize: vertical;
    min-height: 80px;
    line-height: 1.5;
  }

  .char-count {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.5);
    text-align: right;
    margin-top: -0.25rem;
  }

  .dialog-footer {
    padding: 1.5rem;
    border-top: 2px solid rgba(255, 215, 0, 0.2);
    background: rgba(0, 0, 0, 0.2);
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
  }

  .btn-cancel,
  .btn-create {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 0.75rem;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 120px;
    justify-content: center;
  }

  .btn-cancel {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .btn-cancel:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.15);
    color: white;
    transform: translateY(-1px);
  }

  .btn-create {
    background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%);
    color: #1a1a2e;
    box-shadow: 0 4px 12px rgba(255, 215, 0, 0.3);
  }

  .btn-create:hover:not(:disabled) {
    background: linear-gradient(135deg, #ffed4e 0%, #ffd700 100%);
    box-shadow: 0 6px 16px rgba(255, 215, 0, 0.4);
    transform: translateY(-2px);
  }

  .btn-create:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  .btn-create.creating {
    background: linear-gradient(135deg, rgba(255, 215, 0, 0.6) 0%, rgba(255, 237, 78, 0.6) 100%);
  }

  .button-icon {
    font-size: 1.1rem;
    animation: sparkle 2s ease-in-out infinite;
  }

  /* Spinner uses global Christmas-themed style from app.css */

  @media (max-width: 640px) {
    .dialog-content {
      max-width: 100%;
      margin: 1rem;
      border-radius: 1rem;
    }

    .dialog-header,
    .dialog-body,
    .dialog-footer {
      padding: 1.25rem;
    }

    .dialog-title {
      font-size: 1.25rem;
    }

    .btn-cancel,
    .btn-create {
      flex: 1;
      min-width: auto;
    }
  }
</style>

