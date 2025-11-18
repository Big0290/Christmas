<script lang="ts">
  import { socket, gameState } from '$lib/socket';
  import { GameState } from '@christmas/core';
  import { onDestroy } from 'svelte';
  import { playSound } from '$lib/audio';

  $: prompt = $gameState?.currentPrompt;
  $: hasVoted = $gameState?.hasVoted;
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
      <p class="text-xl text-white/70">{t('games.naughtyOrNice.loading')}</p>
    </div>
  {:else if state === GameState.STARTING}
    <div class="countdown-overlay">
      <div class="text-8xl mb-4">😇</div>
      <h1 class="text-4xl font-bold">{t('games.naughtyOrNice.getReady')}</h1>
      <p class="text-xl text-white/70 mt-2">{t('games.naughtyOrNice.startingSoon')}</p>
    </div>
  {:else if state === GameState.PLAYING && prompt}
    <div class="voting-card">
      <div class="round-badge">{t('games.naughtyOrNice.round', { round, maxRounds })}</div>
      <div class="timer-display">
        <span class="timer-label">⏱️</span>
        <span class="timer-value" class:warning={timeRemaining <= 5}>{t('games.naughtyOrNice.timeRemaining', { seconds: timeRemaining })}</span>
      </div>

      <div class="prompt-card">
        <h2 class="prompt-text">{prompt.prompt}</h2>
      </div>

      <div class="vote-question">
        <p class="text-xl font-bold">{t('games.naughtyOrNice.question')}</p>
      </div>

      <div class="vote-buttons">
        <button
          on:click={() => vote('naughty')}
          disabled={hasVoted}
          class="vote-btn naughty-btn"
        >
          <div class="vote-icon">😈</div>
          <div class="vote-label">{t('games.naughtyOrNice.naughty')}</div>
        </button>

        <button
          on:click={() => vote('nice')}
          disabled={hasVoted}
          class="vote-btn nice-btn"
        >
          <div class="vote-icon">👼</div>
          <div class="vote-label">{t('games.naughtyOrNice.nice')}</div>
        </button>
      </div>

      {#if hasVoted}
        <div class="waiting-message">
          ✅ {t('games.naughtyOrNice.voteSubmitted')}
        </div>
      {/if}
    </div>
  {:else if state === GameState.ROUND_END}
    <div class="result-card">
      <div class="text-6xl mb-4">📊</div>
      <h2 class="text-2xl font-bold mb-4">Round Results</h2>
      
      {#if $gameState}
        {@const votes = $gameState.votes || {}}
        {@const naughtyCount = Object.values(votes).filter(v => v === 'naughty').length}
        {@const niceCount = Object.values(votes).filter(v => v === 'nice').length}
        {@const majority = naughtyCount > niceCount ? 'naughty' : 'nice'}
        
        <div class="results-bars">
        <div class="result-bar">
          <div class="result-bar-label">
            <span class="result-icon">😈</span>
            <span>Naughty</span>
          </div>
          <div class="result-bar-value">{naughtyCount}</div>
        </div>
        <div class="result-bar">
          <div class="result-bar-label">
            <span class="result-icon">👼</span>
            <span>Nice</span>
          </div>
          <div class="result-bar-value">{niceCount}</div>
        </div>
      </div>

        <p class="text-white/70 mt-4 mb-4">
          {majority === 'naughty' ? '😈' : '👼'} {majority.charAt(0).toUpperCase() + majority.slice(1)} wins!
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
      {/if}
    </div>
  {/if}
</div>

<style>
  .voting-container {
    min-height: 100%;
    height: auto;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-y;
  }

  .voting-card {
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

  .prompt-card {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 1.5rem;
    padding: 1.5rem;
    min-height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .prompt-text {
    font-size: clamp(1.125rem, 4vw, 1.5rem);
    font-weight: bold;
    text-align: center;
    line-height: 1.5;
    word-wrap: break-word;
  }

  .vote-question {
    text-align: center;
  }

  .vote-buttons {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    width: 100%;
  }

  .vote-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem 1rem;
    min-height: 140px;
    border-radius: 1.5rem;
    border: 4px solid;
    transition: all 0.15s;
    gap: 1rem;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
  }

  .naughty-btn {
    background: rgba(196, 30, 58, 0.2);
    border-color: #c41e3a;
  }

  .naughty-btn:active:not(:disabled),
  .naughty-btn:hover:not(:disabled) {
    transform: scale(0.98);
    background: rgba(196, 30, 58, 0.4);
  }

  .nice-btn {
    background: rgba(15, 134, 68, 0.2);
    border-color: #0f8644;
  }

  .nice-btn:active:not(:disabled),
  .nice-btn:hover:not(:disabled) {
    transform: scale(0.98);
    background: rgba(15, 134, 68, 0.4);
  }

  .vote-btn:disabled {
    opacity: 0.5;
  }

  .vote-icon {
    font-size: clamp(3rem, 10vw, 4rem);
  }

  .vote-label {
    font-size: clamp(1rem, 3.5vw, 1.25rem);
    font-weight: bold;
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

  .results-bars {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: 100%;
    max-width: 400px;
    margin: 1.5rem 0;
  }

  .result-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 0.75rem;
  }

  .result-bar-label {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-weight: bold;
    font-size: clamp(1rem, 3.5vw, 1.125rem);
  }

  .result-icon {
    font-size: 1.5rem;
  }

  .result-bar-value {
    font-size: clamp(1.25rem, 4vw, 1.5rem);
    font-weight: bold;
    color: #ffd700;
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

  /* Mobile optimizations */
  @media (max-width: 640px) {
    .vote-buttons {
      gap: 0.75rem;
    }

    .vote-btn {
      padding: 1.5rem 0.75rem;
      min-height: 120px;
    }

    .vote-icon {
      font-size: 3rem;
    }

    .vote-label {
      font-size: 1rem;
    }

    .prompt-text {
      font-size: 1.125rem;
      padding: 1rem;
    }

    .prompt-card {
      padding: 1.25rem;
      min-height: 100px;
    }

    .timer-display {
      width: 100%;
      margin: 0;
    }
  }
</style>
