<script lang="ts">
  import { GameType } from '@christmas/core';

  export let gameType: GameType | null;
  export let showInstructions: boolean = false;
</script>

{#if showInstructions}
  <div class="instructions-overlay">
    <div class="instructions-content frosted-glass">
      {#if gameType === GameType.TRIVIA_ROYALE}
        <h1 class="instructions-title">🎄 Christmas Trivia Royale</h1>
        <div class="instructions-section">
          <h2 class="instructions-subtitle">How to Play</h2>
          <p class="instructions-text">Answer trivia questions as fast as you can!</p>
          <p class="instructions-text">Select the correct answer on your phone.</p>
        </div>
        <div class="scoring-section">
          <h2 class="instructions-subtitle">📊 Scoring System</h2>
          <div class="scoring-breakdown">
            <div class="scoring-item">
              <span class="scoring-label">✓ Correct Answer:</span>
              <span class="scoring-points">100 points</span>
            </div>
            <div class="scoring-item">
              <span class="scoring-label">⚡ Speed Bonus:</span>
              <span class="scoring-points">Up to +50 points</span>
            </div>
            <div class="scoring-item highlight">
              <span class="scoring-label">🏆 Total (if correct):</span>
              <span class="scoring-points">100 + speed bonus</span>
            </div>
          </div>
          <p class="scoring-note">⚡ Faster answers = More bonus points!</p>
        </div>
      {:else if gameType === GameType.EMOJI_CAROL}
        <h1 class="instructions-title">🎶 Emoji Carol Battle</h1>
        <div class="instructions-section">
          <h2 class="instructions-subtitle">How to Play</h2>
          <p class="instructions-text">
            Pick an emoji that you think most people will choose!
          </p>
          <p class="instructions-text">Be strategic - go with the crowd or be unique!</p>
        </div>
        <div class="scoring-section">
          <h2 class="instructions-subtitle">📊 Scoring System</h2>
          <div class="scoring-breakdown">
            <div class="scoring-item">
              <span class="scoring-label">👥 Majority Bonus:</span>
              <span class="scoring-points">10 points</span>
            </div>
            <div class="scoring-item">
              <span class="scoring-label">✨ Uniqueness Bonus:</span>
              <span class="scoring-points">5 points</span>
            </div>
            <div class="scoring-item">
              <span class="scoring-label">⚡ Speed Bonus:</span>
              <span class="scoring-points">Up to +25 points</span>
            </div>
            <div class="scoring-item highlight">
              <span class="scoring-label">🏆 Maximum Total:</span>
              <span class="scoring-points">15 + speed bonus</span>
            </div>
          </div>
          <p class="scoring-note">
            ⚡ Speed bonus only applies if you get majority or uniqueness bonus!
          </p>
        </div>
      {:else if gameType === GameType.NAUGHTY_OR_NICE}
        <h1 class="instructions-title">😇 Naughty or Nice</h1>
        <div class="instructions-section">
          <h2 class="instructions-subtitle">How to Play</h2>
          <p class="instructions-text">
            Vote whether each prompt is Naughty 😈 or Nice 😇
          </p>
          <p class="instructions-text">Vote with the majority to earn points!</p>
        </div>
        <div class="scoring-section">
          <h2 class="instructions-subtitle">📊 Scoring System</h2>
          <div class="scoring-breakdown">
            <div class="scoring-item">
              <span class="scoring-label">👥 Majority Vote:</span>
              <span class="scoring-points">10 points</span>
            </div>
            <div class="scoring-item">
              <span class="scoring-label">⚡ Speed Bonus:</span>
              <span class="scoring-points">Up to +25 points</span>
            </div>
            <div class="scoring-item highlight">
              <span class="scoring-label">🏆 Total (if majority):</span>
              <span class="scoring-points">10 + speed bonus</span>
            </div>
          </div>
          <p class="scoring-note">⚡ Faster votes = More bonus points!</p>
        </div>
      {:else if gameType === GameType.PRICE_IS_RIGHT}
        <h1 class="instructions-title">💰 Price Is Right</h1>
        <div class="instructions-section">
          <h2 class="instructions-subtitle">How to Play</h2>
          <p class="instructions-text">Guess the price of the item shown!</p>
          <p class="instructions-text">The closest guess wins points!</p>
        </div>
        <div class="scoring-section">
          <h2 class="instructions-subtitle">📊 Scoring System</h2>
          <div class="scoring-breakdown">
            <div class="scoring-item">
              <span class="scoring-label">🎯 Closest Guess:</span>
              <span class="scoring-points">100 points</span>
            </div>
            <div class="scoring-item">
              <span class="scoring-label">⚡ Speed Bonus:</span>
              <span class="scoring-points">Up to +50 points</span>
            </div>
            <div class="scoring-item highlight">
              <span class="scoring-label">🏆 Total:</span>
              <span class="scoring-points">100 + speed bonus</span>
            </div>
          </div>
          <p class="scoring-note">⚡ Fastest closest guess gets the speed bonus!</p>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .instructions-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    animation: fadeIn 0.3s ease-in;
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
    max-width: 900px;
    width: 90%;
    max-height: 85vh;
    overflow-y: auto;
    padding: 3rem 4rem;
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
    font-size: 3.5rem;
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
    padding: 1.5rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 1rem;
    border: 1px solid rgba(255, 215, 0, 0.3);
  }

  .instructions-subtitle {
    font-size: 1.8rem;
    font-weight: bold;
    color: var(--christmas-gold);
    margin-bottom: 1rem;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .instructions-text {
    font-size: 1.3rem;
    line-height: 1.8;
    color: rgba(255, 255, 255, 0.95);
    margin-bottom: 0.8rem;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  }

  .scoring-section {
    margin-top: 2rem;
    padding: 2rem;
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
    font-size: 1.2rem;
    color: rgba(255, 255, 255, 0.95);
    font-weight: 500;
  }

  .scoring-item.highlight .scoring-label {
    color: var(--christmas-gold);
    text-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
  }

  .scoring-points {
    font-size: 1.3rem;
    font-weight: bold;
    color: var(--christmas-gold);
    text-shadow: 0 0 10px rgba(255, 215, 0, 0.6);
  }

  .scoring-note {
    margin-top: 1.5rem;
    font-size: 1.1rem;
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
  @media (max-width: 768px) {
    .instructions-content {
      padding: 2rem 2.5rem;
      width: 95%;
    }

    .instructions-title {
      font-size: 2.5rem;
    }

    .instructions-subtitle {
      font-size: 1.5rem;
    }

    .instructions-text {
      font-size: 1.1rem;
    }

    .scoring-label {
      font-size: 1rem;
    }

    .scoring-points {
      font-size: 1.1rem;
    }
  }
</style>

