<script lang="ts">
  import { GameType } from '@christmas/core';

  export let gameType: GameType | null;
  export let showInstructions: boolean = false;
</script>

{#if showInstructions}
  <div class="instructions-overlay">
    <div class="instructions-content">
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

