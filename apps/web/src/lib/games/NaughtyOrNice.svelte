<script lang="ts">
  import { socket, gameState } from '$lib/socket';
  import { GameState } from '@christmas/core';

  $: prompt = $gameState?.currentPrompt;
  $: hasVoted = $gameState?.hasVoted;
  $: state = $gameState?.state;
  $: round = $gameState?.round;
  $: maxRounds = $gameState?.maxRounds;

  function vote(choice: 'naughty' | 'nice') {
    if (!hasVoted && state === GameState.PLAYING) {
      $socket.emit('vote', choice);
    }
  }
</script>

<div class="voting-container">
  {#if !state}
    <div class="loading-overlay">
      <div class="text-6xl mb-4 animate-spin">⏳</div>
      <p class="text-xl text-white/70">Loading game...</p>
    </div>
  {:else if state === GameState.STARTING}
    <div class="countdown-overlay">
      <div class="text-8xl mb-4">😇</div>
      <h1 class="text-4xl font-bold">Get Ready!</h1>
      <p class="text-xl text-white/70 mt-2">Starting soon...</p>
    </div>
  {:else if state === GameState.PLAYING && prompt}
    <div class="voting-card">
      <div class="round-badge">Round {round}/{maxRounds}</div>

      <div class="prompt-card">
        <h2 class="prompt-text">{prompt.prompt}</h2>
      </div>

      <div class="vote-question">
        <p class="text-xl font-bold">Naughty or Nice?</p>
      </div>

      <div class="vote-buttons">
        <button
          on:click={() => vote('naughty')}
          disabled={hasVoted}
          class="vote-btn naughty-btn"
        >
          <div class="vote-icon">😈</div>
          <div class="vote-label">NAUGHTY</div>
        </button>

        <button
          on:click={() => vote('nice')}
          disabled={hasVoted}
          class="vote-btn nice-btn"
        >
          <div class="vote-icon">👼</div>
          <div class="vote-label">NICE</div>
        </button>
      </div>

      {#if hasVoted}
        <div class="waiting-message">
          ✅ Vote submitted! Waiting for others...
        </div>
      {/if}
    </div>
  {:else if state === GameState.ROUND_END}
    <div class="result-card">
      <div class="text-6xl mb-4">📊</div>
      <h2 class="text-2xl font-bold mb-4">Results</h2>
      
      <div class="results-bars">
        {#each Object.entries($gameState?.votes || {}) as [playerId, vote]}
          <!-- Results would be displayed here -->
        {/each}
        <p class="text-white/70 mt-4">
          Check the host screen for full results!
        </p>
      </div>
    </div>
  {:else if state === GameState.GAME_END}
    <div class="game-end">
      <div class="text-8xl mb-6">🏆</div>
      <h1 class="text-4xl font-bold mb-4">Game Over!</h1>
      <p class="text-xl text-white/70">Thanks for playing!</p>
    </div>
  {/if}
</div>

<style>
  .voting-container {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .voting-card {
    display: flex;
    flex-direction: column;
    gap: 2rem;
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

  .prompt-card {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 1.5rem;
    padding: 2rem;
    min-height: 150px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .prompt-text {
    font-size: 1.5rem;
    font-weight: bold;
    text-align: center;
    line-height: 1.4;
  }

  .vote-question {
    text-align: center;
  }

  .vote-buttons {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .vote-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem 1rem;
    border-radius: 1.5rem;
    border: 4px solid;
    transition: all 0.2s;
    gap: 1rem;
  }

  .naughty-btn {
    background: rgba(196, 30, 58, 0.2);
    border-color: #c41e3a;
  }

  .naughty-btn:active:not(:disabled) {
    transform: scale(0.95);
    background: rgba(196, 30, 58, 0.4);
  }

  .nice-btn {
    background: rgba(15, 134, 68, 0.2);
    border-color: #0f8644;
  }

  .nice-btn:active:not(:disabled) {
    transform: scale(0.95);
    background: rgba(15, 134, 68, 0.4);
  }

  .vote-btn:disabled {
    opacity: 0.5;
  }

  .vote-icon {
    font-size: 4rem;
  }

  .vote-label {
    font-size: 1.25rem;
    font-weight: bold;
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

  .results-bars {
    width: 100%;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 1rem;
    padding: 2rem;
  }
</style>
