<script lang="ts">
  import { enhance } from '$app/forms';
  import { page } from '$app/stores';
  import { invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';
  import { getClientFingerprint } from '$lib/utils/fingerprint';
  import { t } from '$lib/i18n';
  import { goto } from '$app/navigation';
  import type { GuessingChallengePublic } from '@christmas/core';
  import type { PageData } from './$types';

  export let data: PageData;

  // Check if data is valid - redirect if missing
  $: if (data && (!data.challenge || !data.roomCode)) {
    goto('/');
  }

  $: challenge = data?.challenge;
  $: roomCode = data?.roomCode;
  let playerName: string = '';
  let guess: string | number = '';
  let fingerprint: string = '';
  let submitting = false;
  let submitted = false;
  let error = '';

  onMount(async () => {
    // Generate fingerprint on page load (no authentication required - public page)
    try {
      fingerprint = await getClientFingerprint();
    } catch (err) {
      console.error('[Guess Page] Error generating fingerprint:', err);
      error = 'Failed to initialize. Please refresh the page.';
    }
  });

</script>

<svelte:head>
  <title>{challenge?.title || 'Guessing Game'} - Guessing Game</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <meta name="sveltekit:preload-data" content="off" />
</svelte:head>

<div class="guess-container">
  {#if !challenge || !roomCode}
    <div class="loading-screen">
      <div class="spinner"></div>
      <p>{t('guessing.loading') || 'Loading challenge...'}</p>
    </div>
  {:else if submitted}
    <div class="success-screen">
      <div class="success-icon">✓</div>
      <h1 class="success-title">{t('guessing.submit.success')}</h1>
      <p class="success-message">{t('guessing.submit.thankYou')}</p>
      <p class="success-hint">{t('guessing.submit.watchHost')}</p>
    </div>
  {:else}
    <div class="challenge-display">
      <!-- Challenge Image -->
      <div class="challenge-image-container">
        <img src={challenge.image_url} alt={challenge.title} class="challenge-image" />
      </div>

      <!-- Challenge Info -->
      <div class="challenge-info">
        <h1 class="challenge-title">{challenge.title}</h1>
        {#if challenge.description}
          <p class="challenge-description">{challenge.description}</p>
        {/if}
        <div class="guess-bounds">
          <span class="bounds-label">{t('guessing.bounds')}:</span>
          <span class="bounds-value">{challenge.min_guess} - {challenge.max_guess}</span>
        </div>
      </div>

      <!-- Submission Form -->
      <form
        method="POST"
        action="?/submitGuess"
        use:enhance={({ formData, cancel }) => {
          // Validate before submitting
          if (!fingerprint) {
            error = 'Please wait, initializing...';
            cancel();
            return;
          }

          const nameValue = formData.get('playerName');
          const name = typeof nameValue === 'string' ? nameValue : String(nameValue || '');
          const trimmedName = name.trim();
          if (!trimmedName || trimmedName.length === 0) {
            error = 'Please enter your name';
            cancel();
            return;
          }

          if (trimmedName.length > 100) {
            error = 'Name must be 100 characters or less';
            cancel();
            return;
          }

          const guessValueRaw = formData.get('guess');
          const guessStr = typeof guessValueRaw === 'string' ? guessValueRaw : String(guessValueRaw || '');
          const guessValue = parseFloat(guessStr);
          if (isNaN(guessValue)) {
            error = 'Please enter a valid number';
            cancel();
            return;
          }

          if (challenge && (guessValue < challenge.min_guess || guessValue > challenge.max_guess)) {
            error = `Guess must be between ${challenge.min_guess} and ${challenge.max_guess}`;
            cancel();
            return;
          }

          // Start submitting
          submitting = true;
          error = '';

          return async ({ result, update }) => {
            submitting = false;
            
            if (result.type === 'success') {
              // Clear form inputs on success
              playerName = '';
              guess = '';
              submitted = true;
              error = '';
            } else if (result.type === 'failure') {
              submitted = false;
              error = result.data?.error || result.data?.message || 'Failed to submit guess. Please try again.';
            }
            
            // Update the page with the result
            await update();
          };
        }}
        class="guess-form"
      >
        <input type="hidden" name="fingerprint" value={fingerprint} />
        
        <div class="input-group">
          <label for="playerName" class="input-label">{t('guessing.playerName') || 'Your Name'}</label>
          <input
            id="playerName"
            name="playerName"
            type="text"
            bind:value={playerName}
            class="player-name-input"
            placeholder={t('guessing.playerNamePlaceholder') || 'Enter your name'}
            required
            maxlength="100"
            disabled={submitting || !fingerprint}
          />
        </div>

        <div class="input-group">
          <label for="guess" class="input-label">{t('guessing.enterGuess')}</label>
          <input
            id="guess"
            name="guess"
            type="number"
            bind:value={guess}
            min={challenge?.min_guess || 0}
            max={challenge?.max_guess || 100}
            step="0.01"
            class="guess-input"
            placeholder={challenge ? `${challenge.min_guess} - ${challenge.max_guess}` : 'Enter your guess'}
            required
            disabled={submitting || !fingerprint || !challenge}
            inputmode="decimal"
          />
        </div>

        {#if error}
          <div class="error-message">{error}</div>
        {/if}

        <button
          type="submit"
          class="submit-button"
          disabled={submitting || !fingerprint || !playerName || !(typeof playerName === 'string' && playerName.trim().length > 0) || guess === '' || guess === null || isNaN(Number(guess))}
        >
          {#if submitting}
            <span class="spinner"></span>
            {t('guessing.submit.submitting')}
          {:else}
            {t('guessing.submit.button')}
          {/if}
        </button>
      </form>
    </div>
  {/if}
</div>

<style>
  .guess-container {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: linear-gradient(
      135deg,
      rgba(196, 30, 58, 0.2) 0%,
      rgba(15, 134, 68, 0.2) 50%,
      rgba(196, 30, 58, 0.2) 100%
    );
  }

  .challenge-display {
    max-width: 500px;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .challenge-image-container {
    width: 100%;
    aspect-ratio: 4/3;
    border-radius: 1rem;
    overflow: hidden;
    border: 3px solid var(--christmas-gold);
    box-shadow: 
      0 8px 32px rgba(0, 0, 0, 0.4),
      0 0 40px rgba(255, 215, 0, 0.3);
    background: rgba(0, 0, 0, 0.2);
  }

  .challenge-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .challenge-info {
    text-align: center;
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
    border: 2px solid rgba(255, 215, 0, 0.4);
    border-radius: 1rem;
    padding: 1.5rem;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  }

  .challenge-title {
    font-size: clamp(1.5rem, 5vw, 2rem);
    font-weight: bold;
    color: var(--christmas-gold);
    margin-bottom: 0.75rem;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  }

  .challenge-description {
    font-size: clamp(0.875rem, 3vw, 1rem);
    color: rgba(255, 255, 255, 0.9);
    line-height: 1.6;
    margin-bottom: 1rem;
  }

  .guess-bounds {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: rgba(255, 215, 0, 0.2);
    border: 2px solid var(--christmas-gold);
    border-radius: 0.5rem;
    font-weight: bold;
  }

  .bounds-label {
    color: rgba(255, 255, 255, 0.9);
    font-size: clamp(0.875rem, 3vw, 1rem);
  }

  .bounds-value {
    color: var(--christmas-gold);
    font-size: clamp(1rem, 4vw, 1.25rem);
    text-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
  }

  .guess-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
    border: 2px solid rgba(255, 215, 0, 0.4);
    border-radius: 1rem;
    padding: 1.5rem;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  }

  .input-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .input-label {
    font-size: clamp(0.875rem, 3vw, 1rem);
    font-weight: bold;
    color: rgba(255, 255, 255, 0.9);
    text-align: center;
  }

  .player-name-input {
    width: 100%;
    padding: 1rem;
    font-size: clamp(1rem, 4vw, 1.25rem);
    text-align: center;
    background: rgba(255, 255, 255, 0.15);
    border: 2px solid var(--christmas-gold);
    border-radius: 0.5rem;
    color: rgba(255, 255, 255, 0.9);
    -webkit-appearance: none;
    box-shadow: 
      0 2px 10px rgba(0, 0, 0, 0.2),
      inset 0 1px 3px rgba(255, 255, 255, 0.1);
  }

  .player-name-input:focus {
    outline: none;
    border-color: var(--christmas-gold);
    box-shadow: 
      0 4px 20px rgba(255, 215, 0, 0.4),
      0 0 30px rgba(255, 215, 0, 0.2),
      inset 0 1px 3px rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.2);
  }

  .player-name-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .guess-input {
    width: 100%;
    padding: 1.25rem;
    font-size: clamp(1.5rem, 6vw, 2.5rem);
    text-align: center;
    background: rgba(255, 255, 255, 0.15);
    border: 3px solid var(--christmas-gold);
    border-radius: 0.75rem;
    color: var(--christmas-gold);
    font-weight: bold;
    -webkit-appearance: none;
    -moz-appearance: textfield;
    box-shadow: 
      0 4px 15px rgba(0, 0, 0, 0.3),
      inset 0 2px 4px rgba(255, 255, 255, 0.1);
  }

  .guess-input::-webkit-inner-spin-button,
  .guess-input::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .guess-input:focus {
    outline: none;
    border-color: var(--christmas-gold);
    box-shadow: 
      0 6px 25px rgba(255, 215, 0, 0.5),
      0 0 40px rgba(255, 215, 0, 0.3),
      inset 0 2px 4px rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.2);
  }

  .error-message {
    padding: 0.75rem;
    background: rgba(196, 30, 58, 0.3);
    border: 2px solid var(--christmas-red);
    border-radius: 0.5rem;
    color: #ffcccc;
    text-align: center;
    font-size: clamp(0.875rem, 3vw, 1rem);
    font-weight: 500;
  }

  .submit-button {
    width: 100%;
    padding: 1.25rem;
    font-size: clamp(1.25rem, 4vw, 1.5rem);
    font-weight: bold;
    color: white;
    background: linear-gradient(135deg, var(--christmas-red), #a01a2e);
    border: 3px solid var(--christmas-gold);
    border-radius: 0.75rem;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 
      0 4px 15px rgba(196, 30, 58, 0.4),
      0 0 20px rgba(255, 215, 0, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    touch-action: manipulation;
    min-height: 60px;
  }

  .submit-button:hover:not(:disabled) {
    background: linear-gradient(135deg, #a01a2e, var(--christmas-red));
    box-shadow: 
      0 6px 20px rgba(196, 30, 58, 0.6),
      0 0 30px rgba(255, 215, 0, 0.4);
    transform: translateY(-2px);
  }

  .submit-button:active:not(:disabled) {
    transform: translateY(0) scale(0.98);
  }

  .submit-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .spinner {
    width: 1.25rem;
    height: 1.25rem;
    border: 3px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .success-screen {
    max-width: 500px;
    width: 100%;
    text-align: center;
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
    border: 3px solid var(--christmas-gold);
    border-radius: 1rem;
    padding: 3rem 2rem;
    box-shadow: 
      0 8px 32px rgba(0, 0, 0, 0.4),
      0 0 40px rgba(255, 215, 0, 0.3);
  }

  .success-icon {
    font-size: 6rem;
    color: var(--christmas-green);
    margin-bottom: 1.5rem;
    animation: successPop 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    text-shadow: 0 0 30px rgba(15, 134, 68, 0.8);
  }

  @keyframes successPop {
    0% {
      transform: scale(0) rotate(-180deg);
    }
    50% {
      transform: scale(1.2) rotate(0deg);
    }
    100% {
      transform: scale(1) rotate(0deg);
    }
  }

  .success-title {
    font-size: clamp(2rem, 6vw, 2.5rem);
    font-weight: bold;
    color: var(--christmas-gold);
    margin-bottom: 1rem;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  }

  .success-message {
    font-size: clamp(1rem, 4vw, 1.25rem);
    color: rgba(255, 255, 255, 0.9);
    margin-bottom: 0.5rem;
    line-height: 1.6;
  }

  .success-hint {
    font-size: clamp(0.875rem, 3vw, 1rem);
    color: rgba(255, 255, 255, 0.7);
    margin-top: 1rem;
    font-style: italic;
  }

  .loading-screen {
    max-width: 500px;
    width: 100%;
    text-align: center;
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
    border: 3px solid var(--christmas-gold);
    border-radius: 1rem;
    padding: 3rem 2rem;
    box-shadow: 
      0 8px 32px rgba(0, 0, 0, 0.4),
      0 0 40px rgba(255, 215, 0, 0.3);
  }

  .loading-screen .spinner {
    width: 3rem;
    height: 3rem;
    margin: 0 auto 1.5rem;
  }

  .loading-screen p {
    font-size: clamp(1rem, 4vw, 1.25rem);
    color: rgba(255, 255, 255, 0.9);
  }

  /* Mobile optimizations */
  @media (max-width: 640px) {
    .guess-container {
      padding: 0.75rem;
    }

    .challenge-display {
      gap: 1rem;
    }

    .challenge-image-container {
      border-width: 2px;
    }

    .challenge-info,
    .guess-form {
      padding: 1rem;
    }

    .guess-input {
      padding: 1rem;
    }

    .submit-button {
      padding: 1rem;
      min-height: 55px;
    }

    .success-screen {
      padding: 2rem 1.5rem;
    }
  }
</style>

