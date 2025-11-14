<script lang="ts">
  import { socket, gameState } from '$lib/socket';
  import { GameState } from '@christmas/core';

  $: emojis = $gameState?.availableEmojis || [];
  $: hasPicked = $gameState?.hasPicked;
  $: state = $gameState?.state;
  $: round = $gameState?.round;
  $: maxRounds = $gameState?.maxRounds;

  function pickEmoji(emoji: string) {
    if (!hasPicked && state === GameState.PLAYING) {
      $socket.emit('emoji_pick', emoji);
    }
  }
</script>

<div class="emoji-container">
  {#if !state}
    <div class="loading-overlay">
      <div class="text-6xl mb-4 animate-spin">⏳</div>
      <p class="text-xl text-white/70">Loading game...</p>
    </div>
  {:else if state === GameState.STARTING}
    <div class="countdown-overlay">
      <div class="text-8xl mb-4">🎶</div>
      <h1 class="text-4xl font-bold">Get Ready!</h1>
      <p class="text-xl text-white/70 mt-2">Starting soon...</p>
    </div>
  {:else if state === GameState.PLAYING}
    <div class="emoji-card">
      <div class="round-badge">Round {round}/{maxRounds}</div>

      <h2 class="instruction">
        Pick an emoji that you think most people will choose!
      </h2>

      <div class="emoji-grid">
        {#each emojis as emoji}
          <button
            on:click={() => pickEmoji(emoji)}
            disabled={hasPicked}
            class="emoji-button"
            class:picked={hasPicked}
          >
            {emoji}
          </button>
        {/each}
      </div>

      {#if hasPicked}
        <div class="waiting-message">
          ✅ Emoji picked! Waiting for others...
        </div>
      {/if}
    </div>
  {:else if state === GameState.ROUND_END}
    <div class="result-card">
      <div class="text-6xl mb-4">🎶</div>
      <h2 class="text-2xl font-bold mb-4">Round Results</h2>
      
      <div class="results-grid">
        {#each Object.entries($gameState?.roundResults?.[$gameState?.round - 1]?.emojiCounts || {}) as [emoji, count]}
          <div class="result-row">
            <span class="result-emoji">{emoji}</span>
            <span class="result-count">×{count}</span>
          </div>
        {/each}
      </div>

      <p class="text-white/70 mt-4">
        Majority emoji gets points!
      </p>
    </div>
  {:else if state === GameState.GAME_END}
    <div class="game-end">
      <div class="text-8xl mb-6">🏆</div>
      <h1 class="text-4xl font-bold mb-4">Game Over!</h1>
      <p class="text-xl text-white/70">Check the scoreboard on the host screen!</p>
    </div>
  {/if}
</div>

<style>
  .emoji-container {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .emoji-card {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .round-badge {
    background: rgba(196, 30, 58, 0.3);
    border: 2px solid #c41e3a;
    padding: 0.5rem 1rem;
    border-radius: 9999px;
    font-weight: bold;
    text-align: center;
    width: fit-content;
    margin: 0 auto;
  }

  .instruction {
    font-size: 1.25rem;
    font-weight: bold;
    text-align: center;
    padding: 1rem;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 1rem;
  }

  .emoji-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1rem;
  }

  .emoji-button {
    aspect-ratio: 1;
    font-size: 3rem;
    background: rgba(15, 134, 68, 0.2);
    border: 3px solid #0f8644;
    border-radius: 1rem;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .emoji-button:active:not(:disabled) {
    transform: scale(0.9);
    background: rgba(15, 134, 68, 0.4);
  }

  .emoji-button.picked {
    opacity: 0.5;
  }

  .waiting-message {
    text-align: center;
    padding: 1rem;
    background: rgba(255, 215, 0, 0.2);
    border: 2px solid #ffd700;
    border-radius: 1rem;
    font-weight: bold;
  }

  .loading-overlay, .countdown-overlay {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
  }

  .result-card, .game-end {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 2rem;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .animate-spin {
    animation: spin 1s linear infinite;
  }

  .results-grid {
    width: 100%;
    display: grid;
    gap: 0.75rem;
  }

  .result-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 0.75rem;
  }

  .result-emoji {
    font-size: 2rem;
  }

  .result-count {
    font-size: 1.5rem;
    font-weight: bold;
    color: #ffd700;
  }
</style>
