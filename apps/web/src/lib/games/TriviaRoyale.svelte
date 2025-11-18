<script lang="ts">
  import { socket, gameState, getServerTime } from '$lib/socket';
  import { GameState } from '@christmas/core';
  import { playSound } from '$lib/audio';
  import { onMount, onDestroy } from 'svelte';
  import { t } from '$lib/i18n';

  $: question = $gameState?.currentQuestion;
  $: hasAnswered = $gameState?.hasAnswered;
  $: state = $gameState?.state;
  $: round = $gameState?.round;
  $: maxRounds = $gameState?.maxRounds;
  $: questionStartTime = $gameState?.questionStartTime || 0;

  let timeRemaining = 15;
  const timePerQuestion = 15000; // 15 seconds
  let timerInterval: ReturnType<typeof setInterval> | null = null;
  let countdownPlayed = false;

  // Update timer with server time synchronization
  $: if (state === GameState.PLAYING && questionStartTime > 0) {
    if (timerInterval) {
      clearInterval(timerInterval);
    }
    // Reset countdown flag when round starts
    countdownPlayed = false;
    const updateTimer = () => {
      // Use server time for accurate calculation
      const serverNow = getServerTime();
      const elapsed = serverNow - questionStartTime;
      const newTimeRemaining = Math.max(0, Math.ceil((timePerQuestion - elapsed) / 1000));
      
      // Play countdown sound when reaching 5 seconds (only once per round)
      // Use server time to ensure accurate timing
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
  $: scoreboard = $gameState?.scoreboard || [];
  $: socketId = $socket?.id;
  $: currentScore = socketId ? $gameState?.scores?.[socketId] || 0 : 0;
  $: answerCounts = $gameState?.answerCounts || {};
  $: answerPercentages = $gameState?.answerPercentages || {};
  $: playersByAnswer = $gameState?.playersByAnswer || {};
  $: showReveal = $gameState?.showReveal || false;
  $: playerAnswer = socketId ? $gameState?.answers?.[socketId] : undefined;

  let previousState = GameState.LOBBY;
  let previousScore = 0;
  let previousRound = 0;
  let correctAnswers = 0;

  onMount(() => {
    previousScore = currentScore;
    previousRound = round || 0;
  });

  // Note: State change sounds (gameStart, roundEnd, gameEnd) are now handled by server
  // via sound_event socket events for synchronization

  function selectAnswer(index: number) {
    if (!hasAnswered && state === GameState.PLAYING) {
      $socket.emit('trivia_answer', index);
      playSound('click');
    }
  }

  // Track score changes
  $: {
    // Check for correct answer
    if (state === GameState.ROUND_END && question && hasAnswered && socketId) {
      const wasCorrect =
        question.correctIndex !== undefined &&
        $gameState?.answers?.[socketId] === question.correctIndex;

      if (wasCorrect) {
        playSound('correct');
        correctAnswers++;
      } else {
        playSound('wrong');
        correctAnswers = 0; // Reset streak
      }
    }

    // Round change notification
    if (round !== previousRound && round > previousRound) {
      previousRound = round;
    }
  }
</script>

<div class="trivia-container">
  {#if !state}
    <div class="loading-overlay">
      <div class="text-6xl mb-4 animate-spin">⏳</div>
      <p class="text-xl text-white/70">{t('games.triviaRoyale.loading')}</p>
    </div>
  {:else if state === GameState.STARTING}
    <div class="countdown-overlay">
      <div class="text-8xl mb-4">🎄</div>
      <h1 class="text-4xl font-bold">{t('games.triviaRoyale.getReady')}</h1>
      <p class="text-xl text-white/70 mt-2">{t('games.triviaRoyale.startingIn', { seconds: 3 })}</p>
    </div>
  {:else if state === GameState.PLAYING && question}
    <div class="question-card">
      <div class="question-header">
        <span class="round-badge">{t('games.triviaRoyale.round', { round, maxRounds })}</span>
        <div class="timer-display">
          <span class="timer-label">⏱️</span>
          <span class="timer-value" class:warning={timeRemaining <= 5}>{t('games.triviaRoyale.timeRemaining', { seconds: timeRemaining })}</span>
        </div>
        {#if question.imageUrl}
          <img src={question.imageUrl} alt="Question" class="question-image" />
        {/if}
      </div>

      <h2 class="question-text">
        {question.question}
      </h2>

      <div class="answers-grid">
        {#each question.answers as answer, index}
          <button
            on:click={() => selectAnswer(index)}
            disabled={hasAnswered}
            class="answer-button"
            class:answered={hasAnswered}
          >
            <span class="answer-letter">
              {String.fromCharCode(65 + index)}
            </span>
            <span class="answer-text">{answer}</span>
          </button>
        {/each}
      </div>

      {#if hasAnswered}
        <div class="waiting-message">✅ {t('games.triviaRoyale.answerSubmitted')}</div>
      {/if}
    </div>
  {:else if state === GameState.ROUND_END && question && showReveal}
    <div class="result-card">
      <div class="text-6xl mb-4">
        {hasAnswered &&
        question.correctIndex !== undefined &&
        playerAnswer === question.correctIndex
          ? '🎉'
          : '❌'}
      </div>
      <h2 class="text-2xl font-bold mb-4">
        {t('games.triviaRoyale.correctAnswer')}: {question.answers[question.correctIndex]}
      </h2>

      <!-- Voting Breakdown -->
      <div class="voting-breakdown">
        <h3 class="breakdown-title">📊 {t('games.triviaRoyale.votingBreakdown')}</h3>
        <div class="answers-reveal">
          {#each question.answers as answer, index}
            {@const count = answerCounts[index] || 0}
            {@const percentage = answerPercentages[index] || 0}
            {@const isCorrect = index === question.correctIndex}
            {@const playerNames = playersByAnswer[index] || []}
            <div
              class="answer-reveal"
              class:correct={isCorrect}
              class:selected={playerAnswer === index}
            >
              <div class="answer-reveal-header">
                <span class="answer-letter-reveal">{String.fromCharCode(65 + index)}</span>
                <span class="answer-text-reveal">{answer}</span>
                {#if isCorrect}
                  <span class="correct-badge">✓ Correct</span>
                {/if}
              </div>
              <div class="percentage-bar-container">
                <div class="percentage-bar" class:correct={isCorrect} style="width: {percentage}%">
                  <span class="percentage-text">{percentage}% ({count})</span>
                </div>
              </div>
              {#if playerNames.length > 0 && playerNames.length <= 5}
                <div class="voters-list">
                  <span class="voters-label">Voters:</span>
                  <span class="voters-names">{playerNames.join(', ')}</span>
                </div>
              {:else if playerNames.length > 5}
                <div class="voters-list">
                  <span class="voters-label">Voters:</span>
                  <span class="voters-names"
                    >{playerNames.slice(0, 5).join(', ')} and {playerNames.length - 5} more</span
                  >
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>

      <div class="scoreboard-mini">
        <h3 class="text-lg font-bold mb-2">Top 5</h3>
        {#each scoreboard.slice(0, 5) as player, i}
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
  .trivia-container {
    min-height: 100%;
    height: auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-y;
  }

  .loading-overlay,
  .countdown-overlay {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
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

  .question-card {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    width: 100%;
    padding-bottom: 1rem;
  }

  .question-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .round-badge {
    background: rgba(196, 30, 58, 0.3);
    border: 2px solid #c41e3a;
    padding: 0.5rem 1rem;
    border-radius: 9999px;
    font-weight: bold;
  }

  .question-image {
    width: 100%;
    max-height: 200px;
    object-fit: cover;
    border-radius: 1rem;
    margin-top: 1rem;
  }

  .question-text {
    font-size: clamp(1.125rem, 4vw, 1.5rem);
    font-weight: bold;
    line-height: 1.5;
    text-align: center;
    padding: 1.25rem;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 1rem;
    word-wrap: break-word;
  }

  .answers-grid {
    display: grid;
    gap: 1rem;
    width: 100%;
  }

  .answer-button {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1.5rem 1.25rem;
    min-height: 60px;
    background: rgba(15, 134, 68, 0.2);
    border: 3px solid #0f8644;
    border-radius: 1rem;
    font-size: clamp(1rem, 3.5vw, 1.125rem);
    font-weight: 600;
    color: white;
    transition: all 0.15s;
    text-align: left;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
    width: 100%;
  }

  .answer-button:active:not(:disabled),
  .answer-button:hover:not(:disabled) {
    transform: scale(0.98);
    background: rgba(15, 134, 68, 0.4);
  }

  .answer-button.answered {
    opacity: 0.5;
  }

  .answer-letter {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 2.5rem;
    width: 2.5rem;
    height: 2.5rem;
    background: #0f8644;
    border-radius: 0.5rem;
    flex-shrink: 0;
    font-size: 1.125rem;
  }

  .answer-text {
    flex: 1;
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

  .result-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 1.5rem;
    width: 100%;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    max-height: 100%;
  }

  .scoreboard-mini {
    width: 100%;
    max-width: 400px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 1rem;
    padding: 1rem;
  }

  .score-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    margin-bottom: 0.5rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 0.5rem;
  }

  .rank {
    font-weight: bold;
    width: 3rem;
  }

  .name {
    flex: 1;
    text-align: left;
  }

  .score {
    font-weight: bold;
    color: #ffd700;
  }

  .voting-breakdown {
    width: 100%;
    max-width: 500px;
    margin: 1.5rem 0;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 1rem;
    padding: 1.25rem;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .breakdown-title {
    font-size: 1.5rem;
    font-weight: bold;
    margin-bottom: 1.5rem;
    text-align: center;
    color: #ffd700;
  }

  .answers-reveal {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .answer-reveal {
    background: rgba(255, 255, 255, 0.05);
    border: 2px solid rgba(255, 255, 255, 0.2);
    border-radius: 0.75rem;
    padding: 1rem;
    transition: all 0.3s;
  }

  .answer-reveal.correct {
    background: rgba(15, 134, 68, 0.2);
    border-color: #0f8644;
    box-shadow: 0 0 20px rgba(15, 134, 68, 0.3);
  }

  .answer-reveal.selected {
    border-color: #ffd700;
    background: rgba(255, 215, 0, 0.1);
  }

  .answer-reveal-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .answer-letter-reveal {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 0.5rem;
    font-weight: bold;
    flex-shrink: 0;
  }

  .answer-reveal.correct .answer-letter-reveal {
    background: #0f8644;
  }

  .answer-text-reveal {
    flex: 1;
    font-weight: 600;
    font-size: 1.125rem;
  }

  .correct-badge {
    background: #0f8644;
    color: white;
    padding: 0.25rem 0.75rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: bold;
  }

  .percentage-bar-container {
    width: 100%;
    height: 2rem;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 0.5rem;
    overflow: hidden;
    margin-bottom: 0.5rem;
    position: relative;
  }

  .percentage-bar {
    height: 100%;
    background: linear-gradient(90deg, rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.2));
    transition: width 0.5s ease-out;
    display: flex;
    align-items: center;
    padding: 0 0.75rem;
    color: white;
    font-weight: bold;
    font-size: 0.875rem;
  }

  .percentage-bar.correct {
    background: linear-gradient(90deg, #0f8644, #0a5d2e);
  }

  .percentage-text {
    white-space: nowrap;
  }

  .voters-list {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.7);
    margin-top: 0.5rem;
  }

  .voters-label {
    font-weight: 600;
  }

  .voters-names {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .timer-display {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 1.25rem;
    min-height: 44px;
    background: rgba(255, 215, 0, 0.2);
    border: 2px solid #ffd700;
    border-radius: 9999px;
    font-weight: bold;
    touch-action: manipulation;
  }

  .timer-label {
    font-size: 1rem;
  }

  .timer-value {
    font-size: 1.25rem;
    color: #ffd700;
    min-width: 2.5rem;
    text-align: center;
  }

  .timer-value.warning {
    color: #ff3d3d;
    animation: pulse-warning 1s ease-in-out infinite;
  }

  @keyframes pulse-warning {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.6;
    }
  }

  /* Mobile optimizations */
  @media (max-width: 640px) {
    .question-text {
      font-size: 1.125rem;
      padding: 1rem;
    }

    .answer-button {
      padding: 1.25rem 1rem;
      min-height: 56px;
      font-size: 1rem;
    }

    .answer-letter {
      min-width: 2rem;
      width: 2rem;
      height: 2rem;
      font-size: 1rem;
    }

    .question-header {
      flex-direction: column;
      gap: 0.75rem;
      align-items: stretch;
    }

    .timer-display {
      width: 100%;
      margin: 0;
    }

    .voting-breakdown {
      padding: 1rem;
    }

    .breakdown-title {
      font-size: 1.25rem;
    }
  }
</style>
