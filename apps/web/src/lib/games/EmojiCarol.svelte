<script lang="ts">
  import { socket, gameState } from '$lib/socket';
  import { GameState } from '@christmas/core';
  import { onMount, onDestroy } from 'svelte';
  import { playSound } from '$lib/audio';

  $: emojis = $gameState?.availableEmojis || [];
  $: hasPicked = $gameState?.hasPicked;
  $: state = $gameState?.state;
  $: round = $gameState?.round;
  $: maxRounds = $gameState?.maxRounds;
  $: roundStartTime = $gameState?.roundStartTime || 0;
  $: scoreboard = $gameState?.scoreboard || [];
  
  let timeRemaining = 15;
  const timePerRound = 15000; // 15 seconds
  let timerInterval: ReturnType<typeof setInterval> | null = null;
  let countdownPlayed = false;
  
  // Update timer
  $: if (state === GameState.PLAYING && roundStartTime > 0) {
    if (timerInterval) {
      clearInterval(timerInterval);
    }
    // Reset countdown flag when round starts
    countdownPlayed = false;
    const updateTimer = () => {
      const elapsed = Date.now() - roundStartTime;
      const newTimeRemaining = Math.max(0, Math.ceil((timePerRound - elapsed) / 1000));
      
      // Play countdown sound when reaching 5 seconds (only once per round)
      if (newTimeRemaining <= 5 && newTimeRemaining > 0 && !countdownPlayed) {
        playSound('countdown');
        countdownPlayed = true;
      }
      
      timeRemaining = newTimeRemaining;
    };
    updateTimer();
    timerInterval = setInterval(updateTimer, 100);
  } else {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    countdownPlayed = false;
  }

  onDestroy(() => {
    if (timerInterval) {
      clearInterval(timerInterval);
    }
  });

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
      <p class="text-xl text-white/70">{t('games.emojiCarol.loading')}</p>
    </div>
  {:else if state === GameState.STARTING}
    <div class="countdown-overlay">
      <div class="text-8xl mb-4">🎶</div>
      <h1 class="text-4xl font-bold">{t('games.emojiCarol.getReady')}</h1>
      <p class="text-xl text-white/70 mt-2">{t('games.naughtyOrNice.startingSoon')}</p>
    </div>
  {:else if state === GameState.PLAYING}
    <div class="emoji-card">
      <div class="round-badge">{t('games.emojiCarol.round', { round, maxRounds })}</div>
      <div class="timer-display">
        <span class="timer-label">⏱️</span>
        <span class="timer-value" class:warning={timeRemaining <= 5}>{t('games.emojiCarol.timeRemaining', { seconds: timeRemaining })}</span>
      </div>

      <h2 class="instruction">
        {t('games.emojiCarol.pickEmoji')}
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
          ✅ {t('games.emojiCarol.voteSubmitted')}
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

      <p class="text-white/70 mt-4 mb-4">
        Majority emoji gets points!
      </p>

      <!-- Leaderboard -->
      <div class="scoreboard-mini">
        <h3 class="text-lg font-bold mb-2">📊 Leaderboard</h3>
        {#each scoreboard.slice(0, 10) as player, i}
          <div class="score-row">
            <span class="rank">#{i + 1}</span>
            <span class="name">{player.name}</span>
            <span class="score">{player.score}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .emoji-container {
    min-height: 100%;
    height: auto;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-y;
  }

  .emoji-card {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    width: 100%;
    padding-bottom: 1rem;
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
    font-size: clamp(1rem, 4vw, 1.25rem);
    font-weight: bold;
    text-align: center;
    padding: 1.25rem;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 1rem;
    line-height: 1.5;
  }

  .emoji-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.875rem;
    width: 100%;
    padding: 0.5rem 0;
  }

  .emoji-button {
    aspect-ratio: 1;
    min-height: 70px;
    min-width: 70px;
    font-size: clamp(2.5rem, 8vw, 3rem);
    background: rgba(15, 134, 68, 0.2);
    border: 3px solid #0f8644;
    border-radius: 1rem;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
  }

  .emoji-button:active:not(:disabled),
  .emoji-button:hover:not(:disabled) {
    transform: scale(0.95);
    background: rgba(15, 134, 68, 0.4);
  }

  .emoji-button.picked {
    opacity: 0.5;
  }

  .waiting-message {
    text-align: center;
    padding: 1.25rem;
    background: rgba(255, 215, 0, 0.2);
    border: 2px solid #ffd700;
    border-radius: 1rem;
    font-weight: bold;
    font-size: clamp(0.875rem, 3vw, 1rem);
  }

  .loading-overlay, .countdown-overlay {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
  }

  .result-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 1.5rem;
    width: 100%;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
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

  .timer-display {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    min-height: 44px;
    background: rgba(255, 215, 0, 0.2);
    border: 2px solid #ffd700;
    border-radius: 9999px;
    font-weight: bold;
    margin: 0 auto;
    width: fit-content;
    touch-action: manipulation;
  }

  .timer-label {
    font-size: 1.25rem;
  }

  .timer-value {
    font-size: 1.5rem;
    color: #ffd700;
    min-width: 3rem;
    text-align: center;
  }

  .timer-value.warning {
    color: #ff3d3d;
    animation: pulse-warning 1s ease-in-out infinite;
  }

  @keyframes pulse-warning {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.6;
    }
  }

  .scoreboard-mini {
    width: 100%;
    max-width: 500px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 1rem;
    padding: 1rem;
    margin-top: 1.5rem;
  }

  .score-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    margin-bottom: 0.5rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 0.5rem;
    font-size: clamp(0.875rem, 3vw, 1rem);
  }

  .rank {
    font-weight: bold;
    width: 3rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .name {
    flex: 1;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin: 0 0.5rem;
  }

  .score {
    font-weight: bold;
    color: #ffd700;
    min-width: 4rem;
    text-align: right;
  }

  /* Mobile optimizations */
  @media (max-width: 640px) {
    .emoji-grid {
      gap: 0.75rem;
      padding: 0.25rem 0;
    }

    .emoji-button {
      min-height: 65px;
      min-width: 65px;
      font-size: 2.5rem;
    }

    .instruction {
      font-size: 1rem;
      padding: 1rem;
    }

    .timer-display {
      width: 100%;
      margin: 0;
    }

    .scoreboard-mini {
      padding: 0.875rem;
      margin-top: 1rem;
    }

    .score-row {
      padding: 0.625rem;
      font-size: 0.875rem;
    }

    .rank {
      width: 2.5rem;
      font-size: 0.875rem;
    }

    .name {
      font-size: 0.875rem;
    }

    .score {
      min-width: 3rem;
      font-size: 0.875rem;
    }
  }
</style>
