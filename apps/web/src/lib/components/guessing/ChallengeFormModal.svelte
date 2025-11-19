<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { socket } from '$lib/socket';
  import { t } from '$lib/i18n';
  import ImageUpload from '$lib/components/ImageUpload.svelte';
  import type { GuessingChallenge, GuessingChallengeForm } from '@christmas/core';

  export let open: boolean = false;
  export let challenge: GuessingChallenge | null = null; // null for create, challenge object for edit
  export let roomCode: string;

  const dispatch = createEventDispatcher<{
    close: void;
    saved: { challenge: GuessingChallenge };
  }>();

  let formData: GuessingChallengeForm = {
    title: '',
    description: '',
    image_url: '',
    correct_answer: 0,
    min_guess: 0,
    max_guess: 100,
    allow_multiple_guesses: false,
    reveal_at: null,
  };

  let imageUrl: string = '';
  let isUploading = false;
  let error = '';
  let isSubmitting = false;

  $: if (open && challenge) {
    // Populate form for edit
    formData = {
      title: challenge.title,
      description: challenge.description || '',
      image_url: challenge.image_url,
      correct_answer: challenge.correct_answer,
      min_guess: challenge.min_guess,
      max_guess: challenge.max_guess,
      allow_multiple_guesses: challenge.allow_multiple_guesses,
      reveal_at: challenge.reveal_at,
    };
    imageUrl = challenge.image_url;
  } else if (open && !challenge) {
    // Reset form for create
    formData = {
      title: '',
      description: '',
      image_url: '',
      correct_answer: 0,
      min_guess: 0,
      max_guess: 100,
      allow_multiple_guesses: false,
      reveal_at: null,
    };
    imageUrl = '';
    error = '';
  }

  function handleImageUpload(event: CustomEvent<{ imageUrl: string }>) {
    imageUrl = event.detail.imageUrl;
    formData.image_url = imageUrl;
    error = '';
  }

  function handleImageError(event: CustomEvent<{ message: string }>) {
    error = event.detail.message;
  }

  function handleSubmit() {
    error = '';

    // Validation
    if (!formData.title.trim()) {
      error = t('guessing.form.errors.titleRequired');
      return;
    }

    if (!formData.image_url) {
      error = t('guessing.form.errors.imageRequired');
      return;
    }

    if (formData.min_guess >= formData.max_guess) {
      error = t('guessing.form.errors.invalidBounds');
      return;
    }

    if (
      formData.correct_answer < formData.min_guess ||
      formData.correct_answer > formData.max_guess
    ) {
      error = t('guessing.form.errors.answerOutOfBounds');
      return;
    }

    isSubmitting = true;

    const submitData = {
      ...formData,
      image_url: imageUrl,
    };

    if (challenge) {
      // Update existing challenge
      $socket?.emit(
        'update_guessing_challenge',
        challenge.id,
        roomCode,
        submitData,
        (response: any) => {
          isSubmitting = false;
          if (response.success) {
            dispatch('saved', { challenge: response.challenge });
            closeModal();
          } else {
            error = response.error || t('guessing.form.errors.failedUpdate');
          }
        }
      );
    } else {
      // Create new challenge
      $socket?.emit('create_guessing_challenge', roomCode, submitData, (response: any) => {
        isSubmitting = false;
        if (response.success) {
          dispatch('saved', { challenge: response.challenge });
          closeModal();
        } else {
          error = response.error || t('guessing.form.errors.failedCreate');
        }
      });
    }
  }

  function closeModal() {
    open = false;
    dispatch('close');
  }

  function handleRevealAtChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const value = target.value;
    formData.reveal_at = value ? new Date(value).toISOString() : null;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      closeModal();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
  <div class="modal-overlay" on:click={closeModal} role="dialog" aria-modal="true">
    <div class="modal-content" on:click|stopPropagation>
      <div class="modal-header">
        <h2>{challenge ? t('guessing.form.editTitle') : t('guessing.form.createTitle')}</h2>
        <button type="button" on:click={closeModal} class="close-btn">✕</button>
      </div>

      <div class="modal-body">
        <div class="form-group">
          <label for="title">{t('guessing.form.title')}</label>
          <input
            id="title"
            type="text"
            bind:value={formData.title}
            placeholder={t('guessing.form.titlePlaceholder')}
            maxlength="255"
            required
            disabled={isSubmitting}
          />
        </div>

        <div class="form-group">
          <label for="description">{t('guessing.form.description')}</label>
          <textarea
            id="description"
            bind:value={formData.description}
            placeholder={t('guessing.form.descriptionPlaceholder')}
            rows="3"
            disabled={isSubmitting}
          ></textarea>
        </div>

        <div class="form-group">
          <label>{t('guessing.form.image')}</label>
          <ImageUpload
            currentImageUrl={imageUrl}
            bucket="guessing-challenge-images"
            on:upload={handleImageUpload}
            on:error={handleImageError}
            disabled={isSubmitting}
          />
          <p class="form-hint">{t('guessing.form.imageHint')}</p>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="min_guess">{t('guessing.form.minGuess')}</label>
            <input
              id="min_guess"
              type="number"
              bind:value={formData.min_guess}
              step="0.01"
              required
              disabled={isSubmitting}
            />
          </div>

          <div class="form-group">
            <label for="max_guess">{t('guessing.form.maxGuess')}</label>
            <input
              id="max_guess"
              type="number"
              bind:value={formData.max_guess}
              step="0.01"
              required
              disabled={isSubmitting}
            />
          </div>
        </div>

        <div class="form-group">
          <label for="correct_answer">{t('guessing.form.correctAnswer')}</label>
          <input
            id="correct_answer"
            type="number"
            bind:value={formData.correct_answer}
            step="0.01"
            min={formData.min_guess}
            max={formData.max_guess}
            required
            disabled={isSubmitting}
          />
          <p class="form-hint">{t('guessing.form.correctAnswerHint')}</p>
        </div>

        <div class="form-group">
          <label class="checkbox-label">
            <input
              type="checkbox"
              bind:checked={formData.allow_multiple_guesses}
              disabled={isSubmitting}
            />
            <span>{t('guessing.form.allowMultipleGuesses')}</span>
          </label>
          <p class="form-hint">{t('guessing.form.allowMultipleGuessesHint')}</p>
        </div>

        <div class="form-group">
          <label for="reveal_at">{t('guessing.form.revealAt')} ({t('guessing.form.optional')})</label>
          <input
            id="reveal_at"
            type="datetime-local"
            value={formData.reveal_at ? new Date(formData.reveal_at).toISOString().slice(0, 16) : ''}
            on:change={handleRevealAtChange}
            disabled={isSubmitting}
          />
          <p class="form-hint">{t('guessing.form.revealAtHint')}</p>
        </div>

        {#if error}
          <div class="error-message">{error}</div>
        {/if}
      </div>

      <div class="modal-footer">
        <button type="button" on:click={closeModal} class="btn-secondary" disabled={isSubmitting}>
          {t('common.button.cancel')}
        </button>
        <button type="button" on:click={handleSubmit} class="btn-primary" disabled={isSubmitting}>
          {#if isSubmitting}
            <span class="spinner"></span>
            {t('common.button.saving')}
          {:else}
            {challenge ? t('common.button.save') : t('common.button.create')}
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
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

  .modal-content {
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    border: 3px solid #ffd700;
    border-radius: 1rem;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), 0 0 40px rgba(255, 215, 0, 0.2);
    max-width: 700px;
    width: 100%;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
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

  .modal-header {
    padding: 1.5rem;
    border-bottom: 2px solid rgba(255, 215, 0, 0.3);
    background: rgba(0, 0, 0, 0.2);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.5rem;
    color: #ffd700;
    font-weight: bold;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.7);
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    transition: all 0.2s;
  }

  .close-btn:hover {
    color: white;
    background: rgba(255, 255, 255, 0.1);
  }

  .modal-body {
    padding: 1.5rem;
    overflow-y: auto;
    flex: 1;
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    color: rgba(255, 255, 255, 0.9);
    font-weight: 500;
    font-size: 0.95rem;
  }

  .form-group input[type='text'],
  .form-group input[type='number'],
  .form-group input[type='datetime-local'],
  .form-group textarea {
    width: 100%;
    padding: 0.75rem;
    background: rgba(255, 255, 255, 0.1);
    border: 2px solid rgba(255, 215, 0, 0.3);
    border-radius: 0.5rem;
    color: white;
    font-size: 1rem;
    transition: all 0.2s;
  }

  .form-group input:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: #ffd700;
    background: rgba(255, 255, 255, 0.15);
    box-shadow: 0 0 0 3px rgba(255, 215, 0, 0.1);
  }

  .form-group input:disabled,
  .form-group textarea:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .form-group textarea {
    resize: vertical;
    min-height: 80px;
    font-family: inherit;
  }

  .form-hint {
    margin-top: 0.25rem;
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.5);
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }

  .checkbox-label input[type='checkbox'] {
    width: auto;
    margin: 0;
    cursor: pointer;
  }

  .checkbox-label span {
    margin: 0;
    cursor: pointer;
  }

  .error-message {
    padding: 0.75rem;
    background: rgba(196, 30, 58, 0.3);
    border: 2px solid #c41e3a;
    border-radius: 0.5rem;
    color: #ffcccc;
    margin-top: 1rem;
  }

  .modal-footer {
    padding: 1.5rem;
    border-top: 2px solid rgba(255, 215, 0, 0.3);
    background: rgba(0, 0, 0, 0.2);
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
  }

  .btn-primary,
  .btn-secondary {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 0.5rem;
    font-size: 1rem;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 100px;
    justify-content: center;
  }

  .btn-primary {
    background: linear-gradient(135deg, #c41e3a, #a01a2e);
    color: white;
    border: 2px solid #ffd700;
  }

  .btn-primary:hover:not(:disabled) {
    background: linear-gradient(135deg, #a01a2e, #c41e3a);
    box-shadow: 0 4px 15px rgba(196, 30, 58, 0.4);
  }

  .btn-secondary {
    background: rgba(255, 255, 255, 0.1);
    color: white;
    border: 2px solid rgba(255, 255, 255, 0.2);
  }

  .btn-secondary:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.2);
  }

  .btn-primary:disabled,
  .btn-secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 640px) {
    .form-row {
      grid-template-columns: 1fr;
    }

    .modal-content {
      max-height: 95vh;
    }
  }
</style>

