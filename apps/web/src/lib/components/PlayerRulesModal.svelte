<script lang="ts">
  import { GameType } from '@christmas/core';
  import { t } from '$lib/i18n';
  import { onMount, onDestroy } from 'svelte';

  export let gameType: GameType | null;
  export let show: boolean = false;
  export let onClose: (() => void) | null = null;

  const AUTO_DISMISS_DURATION = 5000; // 5 seconds
  let autoDismissTimer: ReturnType<typeof setTimeout> | null = null;

  // Debug logging
  $: {
    console.log('[PlayerRulesModal] Props changed:', {
      show,
      gameType,
      shouldRender: show && gameType
    });
  }

  $: if (show && gameType) {
    // Clear any existing timer
    if (autoDismissTimer) {
      clearTimeout(autoDismissTimer);
    }
    // Set auto-dismiss timer
    autoDismissTimer = setTimeout(() => {
      if (onClose) {
        onClose();
      }
    }, AUTO_DISMISS_DURATION);
  }

  onDestroy(() => {
    if (autoDismissTimer) {
      clearTimeout(autoDismissTimer);
    }
  });

  function handleClose() {
    if (autoDismissTimer) {
      clearTimeout(autoDismissTimer);
      autoDismissTimer = null;
    }
    if (onClose) {
      onClose();
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  }
</script>

{#if show && gameType}
  <div class="rules-overlay" on:click={handleBackdropClick} role="dialog" aria-modal="true">
    <div class="rules-content" on:click|stopPropagation>
      {#if gameType === GameType.TRIVIA_ROYALE}
        <h1 class="rules-title">{t('games.triviaRoyale.rules.title')}</h1>
        <div class="rules-section">
          <h2 class="rules-subtitle">{t('games.triviaRoyale.rules.howToPlay.title')}</h2>
          <p class="rules-text">{t('games.triviaRoyale.rules.howToPlay.description1')}</p>
          <p class="rules-text">{t('games.triviaRoyale.rules.howToPlay.description2')}</p>
        </div>
        <div class="scoring-section">
          <h2 class="rules-subtitle">{t('games.triviaRoyale.rules.scoring.title')}</h2>
          <div class="scoring-breakdown">
            <div class="scoring-item">
              <span class="scoring-label">{t('games.triviaRoyale.rules.scoring.item1.label')}</span>
              <span class="scoring-points">{t('games.triviaRoyale.rules.scoring.item1.points')}</span>
            </div>
            <div class="scoring-item">
              <span class="scoring-label">{t('games.triviaRoyale.rules.scoring.item2.label')}</span>
              <span class="scoring-points">{t('games.triviaRoyale.rules.scoring.item2.points')}</span>
            </div>
            <div class="scoring-item highlight">
              <span class="scoring-label">{t('games.triviaRoyale.rules.scoring.item3.label')}</span>
              <span class="scoring-points">{t('games.triviaRoyale.rules.scoring.item3.points')}</span>
            </div>
          </div>
          <p class="scoring-note">{t('games.triviaRoyale.rules.scoring.note')}</p>
        </div>
      {:else if gameType === GameType.EMOJI_CAROL}
        <h1 class="rules-title">{t('games.emojiCarol.rules.title')}</h1>
        <div class="rules-section">
          <h2 class="rules-subtitle">{t('games.emojiCarol.rules.howToPlay.title')}</h2>
          <p class="rules-text">{t('games.emojiCarol.rules.howToPlay.description1')}</p>
          <p class="rules-text">{t('games.emojiCarol.rules.howToPlay.description2')}</p>
        </div>
        <div class="scoring-section">
          <h2 class="rules-subtitle">{t('games.emojiCarol.rules.scoring.title')}</h2>
          <div class="scoring-breakdown">
            <div class="scoring-item">
              <span class="scoring-label">{t('games.emojiCarol.rules.scoring.item1.label')}</span>
              <span class="scoring-points">{t('games.emojiCarol.rules.scoring.item1.points')}</span>
            </div>
            <div class="scoring-item">
              <span class="scoring-label">{t('games.emojiCarol.rules.scoring.item2.label')}</span>
              <span class="scoring-points">{t('games.emojiCarol.rules.scoring.item2.points')}</span>
            </div>
            <div class="scoring-item">
              <span class="scoring-label">{t('games.emojiCarol.rules.scoring.item3.label')}</span>
              <span class="scoring-points">{t('games.emojiCarol.rules.scoring.item3.points')}</span>
            </div>
            <div class="scoring-item highlight">
              <span class="scoring-label">{t('games.emojiCarol.rules.scoring.item4.label')}</span>
              <span class="scoring-points">{t('games.emojiCarol.rules.scoring.item4.points')}</span>
            </div>
          </div>
          <p class="scoring-note">{t('games.emojiCarol.rules.scoring.note')}</p>
        </div>
      {:else if gameType === GameType.NAUGHTY_OR_NICE}
        <h1 class="rules-title">{t('games.naughtyOrNice.rules.title')}</h1>
        <div class="rules-section">
          <h2 class="rules-subtitle">{t('games.naughtyOrNice.rules.howToPlay.title')}</h2>
          <p class="rules-text">{t('games.naughtyOrNice.rules.howToPlay.description1')}</p>
          <p class="rules-text">{t('games.naughtyOrNice.rules.howToPlay.description2')}</p>
        </div>
        <div class="scoring-section">
          <h2 class="rules-subtitle">{t('games.naughtyOrNice.rules.scoring.title')}</h2>
          <div class="scoring-breakdown">
            <div class="scoring-item">
              <span class="scoring-label">{t('games.naughtyOrNice.rules.scoring.item1.label')}</span>
              <span class="scoring-points">{t('games.naughtyOrNice.rules.scoring.item1.points')}</span>
            </div>
            <div class="scoring-item">
              <span class="scoring-label">{t('games.naughtyOrNice.rules.scoring.item2.label')}</span>
              <span class="scoring-points">{t('games.naughtyOrNice.rules.scoring.item2.points')}</span>
            </div>
            <div class="scoring-item highlight">
              <span class="scoring-label">{t('games.naughtyOrNice.rules.scoring.item3.label')}</span>
              <span class="scoring-points">{t('games.naughtyOrNice.rules.scoring.item3.points')}</span>
            </div>
          </div>
          <p class="scoring-note">{t('games.naughtyOrNice.rules.scoring.note')}</p>
        </div>
      {:else if gameType === GameType.PRICE_IS_RIGHT}
        <h1 class="rules-title">{t('games.priceIsRight.rules.title')}</h1>
        <div class="rules-section">
          <h2 class="rules-subtitle">{t('games.priceIsRight.rules.howToPlay.title')}</h2>
          <p class="rules-text">{t('games.priceIsRight.rules.howToPlay.description1')}</p>
          <p class="rules-text">{t('games.priceIsRight.rules.howToPlay.description2')}</p>
        </div>
        <div class="scoring-section">
          <h2 class="rules-subtitle">{t('games.priceIsRight.rules.scoring.title')}</h2>
          <div class="scoring-breakdown">
            <div class="scoring-item">
              <span class="scoring-label">{t('games.priceIsRight.rules.scoring.item1.label')}</span>
              <span class="scoring-points">{t('games.priceIsRight.rules.scoring.item1.points')}</span>
            </div>
            <div class="scoring-item">
              <span class="scoring-label">{t('games.priceIsRight.rules.scoring.item2.label')}</span>
              <span class="scoring-points">{t('games.priceIsRight.rules.scoring.item2.points')}</span>
            </div>
            <div class="scoring-item highlight">
              <span class="scoring-label">{t('games.priceIsRight.rules.scoring.item3.label')}</span>
              <span class="scoring-points">{t('games.priceIsRight.rules.scoring.item3.points')}</span>
            </div>
          </div>
          <p class="scoring-note">{t('games.priceIsRight.rules.scoring.note')}</p>
        </div>
      {/if}
      <button class="close-button" on:click={handleClose} aria-label={t('common.button.close')}>
        {t('common.button.close')}
      </button>
    </div>
  </div>
{/if}

<style>
  .rules-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
    animation: fadeIn 0.3s ease-in;
    padding: 1rem;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .rules-content {
    max-width: 600px;
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    padding: 2rem;
    border-radius: 1.5rem;
    border: 2px solid var(--christmas-gold);
    box-shadow: 
      0 8px 32px rgba(0, 0, 0, 0.4),
      0 0 40px rgba(255, 215, 0, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.2);
    background: linear-gradient(
      135deg,
      rgba(196, 30, 58, 0.2) 0%,
      rgba(15, 134, 68, 0.2) 50%,
      rgba(0, 52, 96, 0.2) 100%
    );
    position: relative;
    animation: slideUp 0.4s ease-out;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }

  @keyframes slideUp {
    from {
      transform: translateY(30px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .rules-content::before {
    content: '';
    position: absolute;
    top: -2px;
    left: -2px;
    right: -2px;
    bottom: -2px;
    background: linear-gradient(
      135deg,
      var(--christmas-red),
      var(--christmas-gold),
      var(--christmas-green),
      var(--christmas-gold),
      var(--christmas-red)
    );
    border-radius: 1.5rem;
    z-index: -1;
    opacity: 0.6;
    animation: borderGlow 3s ease-in-out infinite;
  }

  @keyframes borderGlow {
    0%, 100% {
      opacity: 0.4;
    }
    50% {
      opacity: 0.8;
    }
  }

  .rules-title {
    font-size: clamp(1.75rem, 5vw, 2.5rem);
    font-weight: bold;
    text-align: center;
    margin-bottom: 1.5rem;
    color: var(--christmas-gold);
    text-shadow: 
      0 0 20px rgba(255, 215, 0, 0.8),
      0 4px 8px rgba(0, 0, 0, 0.5);
    letter-spacing: 1px;
  }

  .rules-section {
    margin-bottom: 1.5rem;
    padding: 1.25rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 0.75rem;
    border: 1px solid rgba(255, 215, 0, 0.3);
  }

  .rules-subtitle {
    font-size: clamp(1.25rem, 4vw, 1.5rem);
    font-weight: bold;
    color: var(--christmas-gold);
    margin-bottom: 0.75rem;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
  }

  .rules-text {
    font-size: clamp(0.875rem, 3vw, 1rem);
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.95);
    margin-bottom: 0.5rem;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  }

  .scoring-section {
    margin-top: 1.5rem;
    padding: 1.25rem;
    background: linear-gradient(
      135deg,
      rgba(255, 215, 0, 0.15) 0%,
      rgba(196, 30, 58, 0.15) 100%
    );
    border-radius: 0.75rem;
    border: 2px solid rgba(255, 215, 0, 0.4);
    box-shadow: 
      0 4px 15px rgba(0, 0, 0, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.1);
  }

  .scoring-breakdown {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: 1rem;
  }

  .scoring-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 0.5rem;
    border: 1px solid rgba(255, 215, 0, 0.2);
    transition: all 0.3s ease;
  }

  .scoring-item.highlight {
    background: linear-gradient(
      135deg,
      rgba(255, 215, 0, 0.2) 0%,
      rgba(196, 30, 58, 0.2) 100%
    );
    border: 2px solid var(--christmas-gold);
    box-shadow: 
      0 4px 15px rgba(255, 215, 0, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.2);
    font-weight: bold;
  }

  .scoring-label {
    font-size: clamp(0.875rem, 3vw, 1rem);
    color: rgba(255, 255, 255, 0.95);
    font-weight: 500;
  }

  .scoring-item.highlight .scoring-label {
    color: var(--christmas-gold);
    text-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
  }

  .scoring-points {
    font-size: clamp(0.875rem, 3vw, 1rem);
    font-weight: bold;
    color: var(--christmas-gold);
    text-shadow: 0 0 10px rgba(255, 215, 0, 0.6);
  }

  .scoring-note {
    margin-top: 1rem;
    font-size: clamp(0.75rem, 2.5vw, 0.875rem);
    color: rgba(255, 255, 255, 0.8);
    font-style: italic;
    text-align: center;
    padding: 0.5rem;
    background: rgba(255, 215, 0, 0.1);
    border-radius: 0.5rem;
    border: 1px solid rgba(255, 215, 0, 0.2);
  }

  .close-button {
    margin-top: 1.5rem;
    width: 100%;
    padding: 0.875rem 1.5rem;
    background: rgba(255, 215, 0, 0.2);
    border: 2px solid var(--christmas-gold);
    border-radius: 0.75rem;
    color: var(--christmas-gold);
    font-weight: bold;
    font-size: clamp(0.875rem, 3vw, 1rem);
    cursor: pointer;
    transition: all 0.2s ease;
    text-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
  }

  .close-button:active,
  .close-button:hover {
    background: rgba(255, 215, 0, 0.3);
    transform: scale(0.98);
    box-shadow: 0 4px 15px rgba(255, 215, 0, 0.4);
  }

  /* Scrollbar styling */
  .rules-content::-webkit-scrollbar {
    width: 8px;
  }

  .rules-content::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 4px;
  }

  .rules-content::-webkit-scrollbar-thumb {
    background: repeating-linear-gradient(
      45deg,
      #C41E3A 0px,
      #C41E3A 4px,
      #ffffff 4px,
      #ffffff 8px
    );
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.3);
  }

  .rules-content {
    scrollbar-width: thin;
    scrollbar-color: #C41E3A rgba(0, 0, 0, 0.2);
  }

  /* Mobile optimizations */
  @media (max-width: 640px) {
    .rules-content {
      padding: 1.5rem;
      max-height: 95vh;
    }

    .rules-section,
    .scoring-section {
      padding: 1rem;
    }
  }
</style>

