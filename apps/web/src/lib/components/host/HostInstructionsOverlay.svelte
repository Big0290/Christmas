<script lang="ts">
  import { GameType } from '@christmas/core';
  import { t } from '$lib/i18n';

  export let gameType: GameType | null;
  export let showInstructions: boolean = false;

  // Helper to check if game type is BINGO (handles undefined GameType.BINGO)
  function isBingo(gt: GameType | string | null): boolean {
    return gt === GameType.BINGO || gt === 'bingo';
  }

  // Debug logging
  $: {
    if (import.meta.env.DEV) {
      console.log('[HostInstructionsOverlay] Props changed:', {
        show: showInstructions,
        gameType,
        isBingoType: isBingo(gameType),
        GameType_BINGO: GameType.BINGO,
        shouldRender: showInstructions && gameType,
        hasBingoRules: !!t('games.bingo.rules.title')
      });
    }
  }
</script>

{#if showInstructions}
  <div class="instructions-overlay">
    <div class="instructions-content frosted-glass">
      {#if gameType === GameType.TRIVIA_ROYALE}
        <h1 class="instructions-title">{t('games.triviaRoyale.rules.title')}</h1>
        <div class="instructions-section">
          <h2 class="instructions-subtitle">{t('games.triviaRoyale.rules.howToPlay.title')}</h2>
          <p class="instructions-text">{t('games.triviaRoyale.rules.howToPlay.description1')}</p>
          <p class="instructions-text">{t('games.triviaRoyale.rules.howToPlay.description2')}</p>
        </div>
        <div class="scoring-section">
          <h2 class="instructions-subtitle">{t('games.triviaRoyale.rules.scoring.title')}</h2>
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
        <h1 class="instructions-title">{t('games.emojiCarol.rules.title')}</h1>
        <div class="instructions-section">
          <h2 class="instructions-subtitle">{t('games.emojiCarol.rules.howToPlay.title')}</h2>
          <p class="instructions-text">{t('games.emojiCarol.rules.howToPlay.description1')}</p>
          <p class="instructions-text">{t('games.emojiCarol.rules.howToPlay.description2')}</p>
        </div>
        <div class="scoring-section">
          <h2 class="instructions-subtitle">{t('games.emojiCarol.rules.scoring.title')}</h2>
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
        <h1 class="instructions-title">{t('games.naughtyOrNice.rules.title')}</h1>
        <div class="instructions-section">
          <h2 class="instructions-subtitle">{t('games.naughtyOrNice.rules.howToPlay.title')}</h2>
          <p class="instructions-text">{t('games.naughtyOrNice.rules.howToPlay.description1')}</p>
          <p class="instructions-text">{t('games.naughtyOrNice.rules.howToPlay.description2')}</p>
        </div>
        <div class="scoring-section">
          <h2 class="instructions-subtitle">{t('games.naughtyOrNice.rules.scoring.title')}</h2>
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
        <h1 class="instructions-title">{t('games.priceIsRight.rules.title')}</h1>
        <div class="instructions-section">
          <h2 class="instructions-subtitle">{t('games.priceIsRight.rules.howToPlay.title')}</h2>
          <p class="instructions-text">{t('games.priceIsRight.rules.howToPlay.description1')}</p>
          <p class="instructions-text">{t('games.priceIsRight.rules.howToPlay.description2')}</p>
        </div>
        <div class="scoring-section">
          <h2 class="instructions-subtitle">{t('games.priceIsRight.rules.scoring.title')}</h2>
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
      {:else if isBingo(gameType)}
        <h1 class="instructions-title">{t('games.bingo.rules.title')}</h1>
        <div class="instructions-section">
          <h2 class="instructions-subtitle">{t('games.bingo.rules.howToPlay.title')}</h2>
          <p class="instructions-text">{t('games.bingo.rules.howToPlay.description1')}</p>
          <p class="instructions-text">{t('games.bingo.rules.howToPlay.description2')}</p>
          <p class="instructions-text">{t('games.bingo.rules.howToPlay.description3')}</p>
        </div>
        <div class="scoring-section">
          <h2 class="instructions-subtitle">{t('games.bingo.rules.scoring.title')}</h2>
          <div class="scoring-breakdown">
            <div class="scoring-item">
              <span class="scoring-label">{t('games.bingo.rules.scoring.item1.label')}</span>
              <span class="scoring-points">{t('games.bingo.rules.scoring.item1.points')}</span>
            </div>
            <div class="scoring-item highlight">
              <span class="scoring-label">{t('games.bingo.rules.scoring.item2.label')}</span>
              <span class="scoring-points">{t('games.bingo.rules.scoring.item2.points')}</span>
            </div>
          </div>
          <p class="scoring-note">{t('games.bingo.rules.scoring.note')}</p>
        </div>
      {:else}
        <!-- Fallback for unknown game type (debug) -->
        {#if import.meta.env.DEV}
          <div class="instructions-section">
            <h1 class="instructions-title">⚠️ Unknown Game Type</h1>
            <p class="instructions-text">gameType: {String(gameType)}</p>
            <p class="instructions-text">isBingo: {String(isBingo(gameType))}</p>
            <p class="instructions-text">GameType.BINGO: {String(GameType.BINGO)}</p>
          </div>
        {/if}
      {/if}
    </div>
  </div>
{/if}

<style>
  .instructions-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    background: rgba(0, 0, 0, 0.6);
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

  .instructions-content {
    max-width: 600px;
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    padding: 2rem;
    border-radius: 2rem;
    border: 3px solid var(--christmas-gold);
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

  .instructions-content::before {
    content: '';
    position: absolute;
    top: -3px;
    left: -3px;
    right: -3px;
    bottom: -3px;
    background: linear-gradient(
      135deg,
      var(--christmas-red),
      var(--christmas-gold),
      var(--christmas-green),
      var(--christmas-gold),
      var(--christmas-red)
    );
    border-radius: 2rem;
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

  .instructions-title {
    font-size: clamp(1.75rem, 5vw, 2.5rem);
    font-weight: bold;
    text-align: center;
    margin-bottom: 2.5rem;
    color: var(--christmas-gold);
    text-shadow: 
      0 0 20px rgba(255, 215, 0, 0.8),
      0 4px 8px rgba(0, 0, 0, 0.5),
      2px 2px 4px rgba(0, 0, 0, 0.7);
    letter-spacing: 2px;
    animation: titlePulse 2s ease-in-out infinite;
  }

  @keyframes titlePulse {
    0%, 100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.02);
    }
  }

  .instructions-section {
    margin-bottom: 2.5rem;
    padding: 1.25rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 1rem;
    border: 1px solid rgba(255, 215, 0, 0.3);
  }

  .instructions-subtitle {
    font-size: clamp(1.25rem, 4vw, 1.5rem);
    font-weight: bold;
    color: var(--christmas-gold);
    margin-bottom: 1rem;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .instructions-text {
    font-size: clamp(0.875rem, 3vw, 1rem);
    line-height: 1.8;
    color: rgba(255, 255, 255, 0.95);
    margin-bottom: 0.8rem;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  }

  .scoring-section {
    margin-top: 2rem;
    padding: 1.25rem;
    background: linear-gradient(
      135deg,
      rgba(255, 215, 0, 0.15) 0%,
      rgba(196, 30, 58, 0.15) 100%
    );
    border-radius: 1rem;
    border: 2px solid rgba(255, 215, 0, 0.4);
    box-shadow: 
      0 4px 15px rgba(0, 0, 0, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.1);
  }

  .scoring-breakdown {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-top: 1.5rem;
  }

  .scoring-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 0.75rem;
    border: 1px solid rgba(255, 215, 0, 0.2);
    transition: all 0.3s ease;
  }

  .scoring-item:hover {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 215, 0, 0.4);
    transform: translateX(5px);
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
    margin-top: 1.5rem;
    font-size: clamp(0.75rem, 2.5vw, 0.875rem);
    color: rgba(255, 255, 255, 0.8);
    font-style: italic;
    text-align: center;
    padding: 0.75rem;
    background: rgba(255, 215, 0, 0.1);
    border-radius: 0.5rem;
    border: 1px solid rgba(255, 215, 0, 0.2);
  }

  /* Scrollbar styling - Candy Cane */
  .instructions-content::-webkit-scrollbar {
    width: 12px;
  }

  .instructions-content::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 6px;
  }

  .instructions-content::-webkit-scrollbar-thumb {
    background: repeating-linear-gradient(
      45deg,
      #C41E3A 0px,
      #C41E3A 6px,
      #ffffff 6px,
      #ffffff 12px
    );
    border-radius: 6px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.2);
  }

  .instructions-content::-webkit-scrollbar-thumb:hover {
    background: repeating-linear-gradient(
      45deg,
      #ff0000 0px,
      #ff0000 6px,
      #ffffff 6px,
      #ffffff 12px
    );
    box-shadow: 
      inset 0 1px 2px rgba(255, 255, 255, 0.3),
      0 0 8px rgba(196, 30, 58, 0.4);
  }
  
  .instructions-content {
    scrollbar-width: thin;
    scrollbar-color: #C41E3A rgba(0, 0, 0, 0.2);
  }

  /* Responsive design */
  @media (max-width: 640px) {
    .instructions-content {
      padding: 1.5rem;
      max-height: 95vh;
    }

    .instructions-section,
    .scoring-section {
      padding: 1rem;
    }
  }
</style>

