<script lang="ts">
  import { socket, gameState, getServerTime } from '$lib/socket';
  import { GameState, GameType } from '@christmas/core';
  import { playSound } from '$lib/audio';
  import { onMount, onDestroy } from 'svelte';
  import { t } from '$lib/i18n';
  import PlayerRulesModal from '$lib/components/PlayerRulesModal.svelte';
  import { get } from 'svelte/store';

  $: question = $gameState?.currentQuestion;
  $: hasAnswered = $gameState?.hasAnswered;
  $: state = $gameState?.state;
  $: round = $gameState?.round;
  $: maxRounds = $gameState?.maxRounds;
  $: questionStartTime = $gameState?.questionStartTime || 0;
  $: gameType = $gameState?.gameType;

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

  let previousState: GameState | null | undefined = undefined;
  let previousScore = 0;
  let previousRound = 0;
  let correctAnswers = 0;
  let showRulesModal = false;
  let rulesShownForGameType: GameType | null = null; // Track which game type we've shown rules for
  let lastGameType: GameType | null = null;
  
  // Watch gameState store directly to catch all state changes
  $: currentState = $gameState?.state;
  $: currentGameType = $gameState?.gameType;
  
  // Show rules modal when game starts - simplified reactive logic
  $: {
    const state = currentState;
    const gameType = currentGameType;
    
    // Debug logging
    if (state !== undefined && state !== null) {
      console.log('[TriviaRoyale] State changed:', {
        state,
        gameType,
        previousState,
        rulesShownForGameType,
        showRulesModal
      });
    }
    
    if (state !== undefined && state !== null && gameType) {
      // Use enum comparisons only - state is normalized in socket.ts
      const isStartingOrPlaying = 
        state === GameState.STARTING || state === GameState.PLAYING;
      
      // Show modal if state is STARTING/PLAYING and we haven't shown it for this gameType yet
      if (isStartingOrPlaying && rulesShownForGameType !== gameType) {
        console.log('[TriviaRoyale] Showing rules modal for gameType:', gameType, 'state:', state);
        showRulesModal = true;
        rulesShownForGameType = gameType;
        lastGameType = gameType;
      }
      
      // Reset when game ends or returns to lobby
      if (state === GameState.LOBBY || state === GameState.GAME_END) {
        console.log('[TriviaRoyale] Resetting modal state');
        showRulesModal = false;
        rulesShownForGameType = null;
        lastGameType = null;
      }
      
      // Track state changes
      if (state !== previousState) {
        previousState = state;
      }
    }
  }
  
  function closeRulesModal() {
    showRulesModal = false;
  }

  onMount(() => {
    previousScore = currentScore;
    previousRound = round || 0;
    
    // Subscribe to gameState changes as a backup
    const unsubscribe = gameState.subscribe((state) => {
      if (!state) return;
      
      const stateValue = state.state;
      const gameTypeValue = state.gameType;
      
      console.log('[TriviaRoyale] gameState subscription update:', {
        state: stateValue,
        gameType: gameTypeValue,
        rulesShownForGameType,
        showRulesModal
      });
      
      if (gameTypeValue === GameType.TRIVIA_ROYALE) {
        const isStartingOrPlaying = 
          stateValue === GameState.STARTING || stateValue === GameState.PLAYING;
        
        if (isStartingOrPlaying && rulesShownForGameType !== gameTypeValue) {
          console.log('[TriviaRoyale] Subscription - showing modal');
          showRulesModal = true;
          rulesShownForGameType = gameTypeValue;
          lastGameType = gameTypeValue;
        }
      }
    });
    
    // Check initial state on mount
    const initialState = get(gameState);
    console.log('[TriviaRoyale] onMount - checking initial state:', {
      currentState,
      currentGameType,
      initialStateState: initialState?.state,
      initialStateGameType: initialState?.gameType,
      rulesShownForGameType
    });
    
    const isStartingOrPlaying = 
      currentState === GameState.STARTING || currentState === GameState.PLAYING;
    
    if (isStartingOrPlaying && 
        currentGameType && 
        rulesShownForGameType !== currentGameType) {
      console.log('[TriviaRoyale] onMount - showing modal');
      showRulesModal = true;
      rulesShownForGameType = currentGameType;
      lastGameType = currentGameType;
    }
    
    return () => {
      unsubscribe();
    };
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

<PlayerRulesModal gameType={currentGameType || GameType.TRIVIA_ROYALE} show={showRulesModal} onClose={closeRulesModal} />

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
    position: relative;
    overflow: hidden;
  }

  .question-card::before {
    content: '';
    position: absolute;
    inset: -2px;
    border-radius: 1rem;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, rgba(173, 216, 230, 0.2) 50%, rgba(255, 255, 255, 0.3) 100%);
    background-size: 200% 200%;
    animation: frost-shimmer 3s ease-in-out infinite;
    z-index: -1;
    opacity: 0.5;
  }

  .question-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .round-badge {
    background: rgba(173, 216, 230, 0.2);
    border: 2px solid rgba(255, 255, 255, 0.4);
    padding: 0.5rem 1rem;
    border-radius: 9999px;
    font-weight: bold;
    position: relative;
    backdrop-filter: blur(5px);
    -webkit-backdrop-filter: blur(5px);
  }

  .round-badge::before {
    content: '❄️';
    margin-right: 0.25rem;
    animation: sparkle 2s ease-in-out infinite;
  }

  @keyframes sparkle {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.7; transform: scale(1.1); }
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
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border-radius: 1rem;
    word-wrap: break-word;
    text-shadow: 0 0 10px rgba(255, 255, 255, 0.3), 0 0 20px rgba(173, 216, 230, 0.3);
    filter: drop-shadow(0 0 5px rgba(255, 255, 255, 0.2));
    position: relative;
    overflow: hidden;
  }

  .question-text::before {
    content: '';
    position: absolute;
    inset: -2px;
    border-radius: 1rem;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, rgba(173, 216, 230, 0.2) 50%, rgba(255, 255, 255, 0.3) 100%);
    background-size: 200% 200%;
    animation: frost-shimmer 3s ease-in-out infinite;
    z-index: -1;
    opacity: 0.6;
  }

  @keyframes frost-shimmer {
    0%, 100% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
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
    background: rgba(173, 216, 230, 0.15);
    backdrop-filter: blur(5px);
    -webkit-backdrop-filter: blur(5px);
    border: 2px solid rgba(255, 255, 255, 0.3);
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
    position: relative;
    overflow: hidden;
  }

  .answer-button::after {
    content: '';
    position: absolute;
    inset: -3px;
    border-radius: 1rem;
    background: 
      linear-gradient(0deg, transparent 0%, transparent 20%, #ff0000 20%, #ff0000 22%, transparent 22%, transparent 40%, #00ff00 40%, #00ff00 42%, transparent 42%, transparent 60%, #0000ff 60%, #0000ff 62%, transparent 62%, transparent 80%, #ffff00 80%, #ffff00 82%, transparent 82%, transparent 100%),
      linear-gradient(90deg, transparent 0%, transparent 20%, #ff0000 20%, #ff0000 22%, transparent 22%, transparent 40%, #00ff00 40%, #00ff00 42%, transparent 42%, transparent 60%, #0000ff 60%, #0000ff 62%, transparent 62%, transparent 80%, #ffff00 80%, #ffff00 82%, transparent 82%, transparent 100%),
      linear-gradient(180deg, transparent 0%, transparent 20%, #ff0000 20%, #ff0000 22%, transparent 22%, transparent 40%, #00ff00 40%, #00ff00 42%, transparent 42%, transparent 60%, #0000ff 60%, #0000ff 62%, transparent 62%, transparent 80%, #ffff00 80%, #ffff00 82%, transparent 82%, transparent 100%),
      linear-gradient(270deg, transparent 0%, transparent 20%, #ff0000 20%, #ff0000 22%, transparent 22%, transparent 40%, #00ff00 40%, #00ff00 42%, transparent 42%, transparent 60%, #0000ff 60%, #0000ff 62%, transparent 62%, transparent 80%, #ffff00 80%, #ffff00 82%, transparent 82%, transparent 100%);
    background-size: 100% 3px, 3px 100%, 100% 3px, 3px 100%;
    background-position: 0 0, 0 0, 0 100%, 100% 0;
    background-repeat: repeat-x, repeat-y, repeat-x, repeat-y;
    opacity: 0;
    pointer-events: none;
    animation: christmas-lights-card 1.5s ease-in-out infinite;
    filter: blur(0.5px);
    z-index: 1;
  }

  @keyframes christmas-lights-card {
    0%, 100% { opacity: 0.4; filter: blur(0.5px) brightness(0.9); }
    25% { opacity: 0.9; filter: blur(0.3px) brightness(1.4); }
    50% { opacity: 0.6; filter: blur(0.5px) brightness(1.1); }
    75% { opacity: 1; filter: blur(0.3px) brightness(1.5); }
  }

  .answer-button:active:not(:disabled),
  .answer-button:hover:not(:disabled) {
    transform: scale(0.98);
    background: rgba(173, 216, 230, 0.25);
    border-color: rgba(255, 255, 255, 0.5);
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
    background: rgba(173, 216, 230, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.4);
    border-radius: 0.5rem;
    flex-shrink: 0;
    font-size: 1.125rem;
    backdrop-filter: blur(5px);
    -webkit-backdrop-filter: blur(5px);
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
    position: relative;
    overflow: hidden;
  }

  .result-card::before {
    content: '';
    position: absolute;
    inset: -2px;
    border-radius: 1rem;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, rgba(173, 216, 230, 0.2) 50%, rgba(255, 255, 255, 0.3) 100%);
    background-size: 200% 200%;
    animation: frost-shimmer 3s ease-in-out infinite;
    z-index: -1;
    opacity: 0.5;
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
    color: var(--christmas-gold);
  }

  [data-theme="winter"] .score {
    color: var(--winter-silver);
  }

  .voting-breakdown {
    width: 100%;
    max-width: 500px;
    margin: 1.5rem 0;
    background: rgba(173, 216, 230, 0.15);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border-radius: 1rem;
    padding: 1.25rem;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    position: relative;
    overflow: hidden;
    border: 2px solid rgba(255, 255, 255, 0.3);
  }

  /* Theme-aware background colors */
  [data-theme="traditional"] .voting-breakdown {
    background: rgba(15, 134, 68, 0.15);
  }

  [data-theme="winter"] .voting-breakdown {
    background: rgba(173, 216, 230, 0.15);
  }

  [data-theme="mixed"] .voting-breakdown {
    background: rgba(173, 216, 230, 0.15);
  }

  .voting-breakdown::before {
    content: '';
    position: absolute;
    inset: -2px;
    border-radius: 1rem;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(173, 216, 230, 0.3) 50%, rgba(255, 255, 255, 0.4) 100%);
    background-size: 200% 200%;
    animation: frost-shimmer 3s ease-in-out infinite;
    z-index: -1;
    opacity: 0.6;
  }

  [data-theme="traditional"] .voting-breakdown::before {
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(15, 134, 68, 0.3) 50%, rgba(255, 255, 255, 0.4) 100%);
  }

  [data-theme="winter"] .voting-breakdown::before {
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(173, 216, 230, 0.3) 50%, rgba(255, 255, 255, 0.4) 100%);
  }

  [data-theme="mixed"] .voting-breakdown::before {
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(196, 30, 58, 0.2) 25%, rgba(173, 216, 230, 0.3) 50%, rgba(15, 134, 68, 0.2) 75%, rgba(255, 255, 255, 0.4) 100%);
  }

  .voting-breakdown::after {
    content: '';
    position: absolute;
    inset: -4px;
    border-radius: 1rem;
    background: 
      linear-gradient(0deg, transparent 0%, transparent 10%, #ff0000 10%, #ff0000 12%, transparent 12%, transparent 20%, #00ff00 20%, #00ff00 22%, transparent 22%, transparent 30%, #0000ff 30%, #0000ff 32%, transparent 32%, transparent 40%, #ffff00 40%, #ffff00 42%, transparent 42%, transparent 50%, #ff00ff 50%, #ff00ff 52%, transparent 52%, transparent 60%, #00ffff 60%, #00ffff 62%, transparent 62%, transparent 70%, #ff8800 70%, #ff8800 72%, transparent 72%, transparent 80%, #ff0088 80%, #ff0088 82%, transparent 82%, transparent 90%, #88ff00 90%, #88ff00 92%, transparent 92%, transparent 100%),
      linear-gradient(90deg, transparent 0%, transparent 10%, #ff0000 10%, #ff0000 12%, transparent 12%, transparent 20%, #00ff00 20%, #00ff00 22%, transparent 22%, transparent 30%, #0000ff 30%, #0000ff 32%, transparent 32%, transparent 40%, #ffff00 40%, #ffff00 42%, transparent 42%, transparent 50%, #ff00ff 50%, #ff00ff 52%, transparent 52%, transparent 60%, #00ffff 60%, #00ffff 62%, transparent 62%, transparent 70%, #ff8800 70%, #ff8800 72%, transparent 72%, transparent 80%, #ff0088 80%, #ff0088 82%, transparent 82%, transparent 90%, #88ff00 90%, #88ff00 92%, transparent 92%, transparent 100%),
      linear-gradient(180deg, transparent 0%, transparent 10%, #ff0000 10%, #ff0000 12%, transparent 12%, transparent 20%, #00ff00 20%, #00ff00 22%, transparent 22%, transparent 30%, #0000ff 30%, #0000ff 32%, transparent 32%, transparent 40%, #ffff00 40%, #ffff00 42%, transparent 42%, transparent 50%, #ff00ff 50%, #ff00ff 52%, transparent 52%, transparent 60%, #00ffff 60%, #00ffff 62%, transparent 62%, transparent 70%, #ff8800 70%, #ff8800 72%, transparent 72%, transparent 80%, #ff0088 80%, #ff0088 82%, transparent 82%, transparent 90%, #88ff00 90%, #88ff00 92%, transparent 92%, transparent 100%),
      linear-gradient(270deg, transparent 0%, transparent 10%, #ff0000 10%, #ff0000 12%, transparent 12%, transparent 20%, #00ff00 20%, #00ff00 22%, transparent 22%, transparent 30%, #0000ff 30%, #0000ff 32%, transparent 32%, transparent 40%, #ffff00 40%, #ffff00 42%, transparent 42%, transparent 50%, #ff00ff 50%, #ff00ff 52%, transparent 52%, transparent 60%, #00ffff 60%, #00ffff 62%, transparent 62%, transparent 70%, #ff8800 70%, #ff8800 72%, transparent 72%, transparent 80%, #ff0088 80%, #ff0088 82%, transparent 82%, transparent 90%, #88ff00 90%, #88ff00 92%, transparent 92%, transparent 100%);
    background-size: 100% 4px, 4px 100%, 100% 4px, 4px 100%;
    background-position: 0 0, 0 0, 0 100%, 100% 0;
    background-repeat: repeat-x, repeat-y, repeat-x, repeat-y;
    opacity: 0;
    pointer-events: none;
    animation: christmas-lights 2s ease-in-out infinite;
    filter: blur(1px);
    z-index: 0;
  }

  @keyframes christmas-lights {
    0%, 100% { opacity: 0.3; filter: blur(1px) brightness(0.8); }
    25% { opacity: 0.8; filter: blur(0.5px) brightness(1.2); }
    50% { opacity: 0.5; filter: blur(1px) brightness(1); }
    75% { opacity: 0.9; filter: blur(0.5px) brightness(1.3); }
  }

  .breakdown-title {
    font-size: 1.5rem;
    font-weight: bold;
    margin-bottom: 1.5rem;
    text-align: center;
    color: var(--christmas-gold);
    text-shadow: 0 0 10px rgba(255, 215, 0, 0.5), 0 0 20px rgba(255, 215, 0, 0.3);
    filter: drop-shadow(0 0 5px rgba(255, 215, 0, 0.3));
    position: relative;
  }

  [data-theme="winter"] .breakdown-title {
    color: var(--winter-silver);
    text-shadow: 0 0 10px rgba(192, 192, 192, 0.5), 0 0 20px rgba(192, 192, 192, 0.3);
    filter: drop-shadow(0 0 5px rgba(192, 192, 192, 0.3));
  }

  [data-theme="mixed"] .breakdown-title {
    color: var(--christmas-gold);
  }

  .breakdown-title::before {
    content: '❄️';
    margin-right: 0.5rem;
    animation: sparkle 2s ease-in-out infinite;
  }

  .answers-reveal {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .answer-reveal {
    background: rgba(173, 216, 230, 0.15);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 2px solid rgba(255, 255, 255, 0.4);
    border-radius: 0.75rem;
    padding: 1rem;
    transition: all 0.3s;
    position: relative;
    overflow: hidden;
  }

  /* Theme-aware answer reveal backgrounds */
  [data-theme="traditional"] .answer-reveal {
    background: rgba(15, 134, 68, 0.15);
  }

  [data-theme="winter"] .answer-reveal {
    background: rgba(173, 216, 230, 0.15);
  }

  [data-theme="mixed"] .answer-reveal {
    background: rgba(173, 216, 230, 0.15);
  }

  .answer-reveal::before {
    content: '';
    position: absolute;
    inset: -2px;
    border-radius: 0.75rem;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, rgba(173, 216, 230, 0.2) 50%, rgba(255, 255, 255, 0.3) 100%);
    background-size: 200% 200%;
    animation: frost-shimmer 3s ease-in-out infinite;
    z-index: -1;
    opacity: 0.5;
  }

  [data-theme="traditional"] .answer-reveal::before {
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, rgba(15, 134, 68, 0.2) 50%, rgba(255, 255, 255, 0.3) 100%);
  }

  [data-theme="winter"] .answer-reveal::before {
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, rgba(173, 216, 230, 0.2) 50%, rgba(255, 255, 255, 0.3) 100%);
  }

  [data-theme="mixed"] .answer-reveal::before {
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, rgba(196, 30, 58, 0.15) 25%, rgba(173, 216, 230, 0.2) 50%, rgba(15, 134, 68, 0.15) 75%, rgba(255, 255, 255, 0.3) 100%);
  }

  .answer-reveal::after {
    content: '';
    position: absolute;
    inset: -3px;
    border-radius: 0.75rem;
    background: 
      linear-gradient(0deg, transparent 0%, transparent 15%, #ff0000 15%, #ff0000 17%, transparent 17%, transparent 30%, #00ff00 30%, #00ff00 32%, transparent 32%, transparent 45%, #0000ff 45%, #0000ff 47%, transparent 47%, transparent 60%, #ffff00 60%, #ffff00 62%, transparent 62%, transparent 75%, #ff00ff 75%, #ff00ff 77%, transparent 77%, transparent 90%, #00ffff 90%, #00ffff 92%, transparent 92%, transparent 100%),
      linear-gradient(90deg, transparent 0%, transparent 15%, #ff0000 15%, #ff0000 17%, transparent 17%, transparent 30%, #00ff00 30%, #00ff00 32%, transparent 32%, transparent 45%, #0000ff 45%, #0000ff 47%, transparent 47%, transparent 60%, #ffff00 60%, #ffff00 62%, transparent 62%, transparent 75%, #ff00ff 75%, #ff00ff 77%, transparent 77%, transparent 90%, #00ffff 90%, #00ffff 92%, transparent 92%, transparent 100%),
      linear-gradient(180deg, transparent 0%, transparent 15%, #ff0000 15%, #ff0000 17%, transparent 17%, transparent 30%, #00ff00 30%, #00ff00 32%, transparent 32%, transparent 45%, #0000ff 45%, #0000ff 47%, transparent 47%, transparent 60%, #ffff00 60%, #ffff00 62%, transparent 62%, transparent 75%, #ff00ff 75%, #ff00ff 77%, transparent 77%, transparent 90%, #00ffff 90%, #00ffff 92%, transparent 92%, transparent 100%),
      linear-gradient(270deg, transparent 0%, transparent 15%, #ff0000 15%, #ff0000 17%, transparent 17%, transparent 30%, #00ff00 30%, #00ff00 32%, transparent 32%, transparent 45%, #0000ff 45%, #0000ff 47%, transparent 47%, transparent 60%, #ffff00 60%, #ffff00 62%, transparent 62%, transparent 75%, #ff00ff 75%, #ff00ff 77%, transparent 77%, transparent 90%, #00ffff 90%, #00ffff 92%, transparent 92%, transparent 100%);
    background-size: 100% 3px, 3px 100%, 100% 3px, 3px 100%;
    background-position: 0 0, 0 0, 0 100%, 100% 0;
    background-repeat: repeat-x, repeat-y, repeat-x, repeat-y;
    opacity: 0;
    pointer-events: none;
    animation: christmas-lights-card 1.8s ease-in-out infinite;
    filter: blur(0.5px);
    z-index: 1;
  }

  .answer-reveal.correct {
    background: rgba(173, 216, 230, 0.25);
    border-color: rgba(255, 255, 255, 0.6);
    box-shadow: 0 0 25px rgba(173, 216, 230, 0.5), 0 0 50px rgba(255, 255, 255, 0.3), inset 0 0 20px rgba(255, 255, 255, 0.1);
  }

  [data-theme="traditional"] .answer-reveal.correct {
    background: rgba(15, 134, 68, 0.25);
    border-color: rgba(255, 255, 255, 0.6);
    box-shadow: 0 0 25px rgba(15, 134, 68, 0.5), 0 0 50px rgba(255, 255, 255, 0.3), inset 0 0 20px rgba(255, 255, 255, 0.1);
  }

  [data-theme="winter"] .answer-reveal.correct {
    background: rgba(173, 216, 230, 0.25);
    border-color: rgba(255, 255, 255, 0.6);
    box-shadow: 0 0 25px rgba(173, 216, 230, 0.5), 0 0 50px rgba(255, 255, 255, 0.3), inset 0 0 20px rgba(255, 255, 255, 0.1);
  }

  [data-theme="mixed"] .answer-reveal.correct {
    background: rgba(15, 134, 68, 0.25);
    border-color: rgba(255, 255, 255, 0.6);
    box-shadow: 0 0 25px rgba(15, 134, 68, 0.5), 0 0 50px rgba(255, 255, 255, 0.3), inset 0 0 20px rgba(255, 255, 255, 0.1);
  }

  .answer-reveal.correct::after {
    opacity: 0.8;
    animation: christmas-lights-card 1.5s ease-in-out infinite;
  }

  .answer-reveal.selected {
    border-color: rgba(255, 215, 0, 0.7);
    background: rgba(255, 215, 0, 0.2);
    box-shadow: 0 0 20px rgba(255, 215, 0, 0.4), inset 0 0 15px rgba(255, 215, 0, 0.1);
  }

  [data-theme="winter"] .answer-reveal.selected {
    border-color: rgba(192, 192, 192, 0.7);
    background: rgba(192, 192, 192, 0.2);
    box-shadow: 0 0 20px rgba(192, 192, 192, 0.4), inset 0 0 15px rgba(192, 192, 192, 0.1);
  }

  .answer-reveal.selected::after {
    opacity: 0.6;
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
    background: rgba(173, 216, 230, 0.3);
    backdrop-filter: blur(5px);
    -webkit-backdrop-filter: blur(5px);
    border: 1px solid rgba(255, 255, 255, 0.4);
    border-radius: 0.5rem;
    font-weight: bold;
    flex-shrink: 0;
  }

  [data-theme="traditional"] .answer-letter-reveal {
    background: rgba(15, 134, 68, 0.3);
  }

  [data-theme="winter"] .answer-letter-reveal {
    background: rgba(173, 216, 230, 0.3);
  }

  [data-theme="mixed"] .answer-letter-reveal {
    background: rgba(173, 216, 230, 0.3);
  }

  .answer-reveal.correct .answer-letter-reveal {
    background: rgba(255, 215, 0, 0.4);
    border-color: rgba(255, 215, 0, 0.6);
    box-shadow: 0 0 10px rgba(255, 215, 0, 0.4);
  }

  [data-theme="winter"] .answer-reveal.correct .answer-letter-reveal {
    background: rgba(192, 192, 192, 0.4);
    border-color: rgba(192, 192, 192, 0.6);
    box-shadow: 0 0 10px rgba(192, 192, 192, 0.4);
  }

  .answer-text-reveal {
    flex: 1;
    font-weight: 600;
    font-size: 1.125rem;
    text-shadow: 0 0 5px rgba(255, 255, 255, 0.2);
  }

  .correct-badge {
    background: rgba(255, 215, 0, 0.3);
    backdrop-filter: blur(5px);
    -webkit-backdrop-filter: blur(5px);
    border: 1px solid rgba(255, 215, 0, 0.6);
    color: var(--christmas-gold);
    padding: 0.25rem 0.75rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: bold;
    text-shadow: 0 0 5px rgba(255, 215, 0, 0.5);
    box-shadow: 0 0 10px rgba(255, 215, 0, 0.3);
  }

  [data-theme="winter"] .correct-badge {
    background: rgba(192, 192, 192, 0.3);
    border: 1px solid rgba(192, 192, 192, 0.6);
    color: var(--winter-silver);
    text-shadow: 0 0 5px rgba(192, 192, 192, 0.5);
    box-shadow: 0 0 10px rgba(192, 192, 192, 0.3);
  }

  .percentage-bar-container {
    width: 100%;
    height: 2rem;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(5px);
    -webkit-backdrop-filter: blur(5px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 0.5rem;
    overflow: hidden;
    margin-bottom: 0.5rem;
    position: relative;
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.3);
  }

  .percentage-bar {
    height: 100%;
    background: linear-gradient(90deg, rgba(173, 216, 230, 0.6), rgba(135, 206, 250, 0.5));
    transition: width 0.5s ease-out;
    display: flex;
    align-items: center;
    padding: 0 0.75rem;
    color: white;
    font-weight: bold;
    font-size: 0.875rem;
    text-shadow: 0 0 5px rgba(0, 0, 0, 0.5);
    box-shadow: 0 0 10px rgba(173, 216, 230, 0.3);
    position: relative;
    overflow: hidden;
  }

  [data-theme="traditional"] .percentage-bar {
    background: linear-gradient(90deg, rgba(15, 134, 68, 0.6), rgba(10, 93, 46, 0.5));
    box-shadow: 0 0 10px rgba(15, 134, 68, 0.3);
  }

  [data-theme="winter"] .percentage-bar {
    background: linear-gradient(90deg, rgba(173, 216, 230, 0.6), rgba(135, 206, 250, 0.5));
    box-shadow: 0 0 10px rgba(173, 216, 230, 0.3);
  }

  [data-theme="mixed"] .percentage-bar {
    background: linear-gradient(90deg, rgba(15, 134, 68, 0.6), rgba(173, 216, 230, 0.5));
    box-shadow: 0 0 10px rgba(15, 134, 68, 0.3);
  }

  .percentage-bar::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
    animation: shimmer 2s ease-in-out infinite;
  }

  @keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }

  .percentage-bar.correct {
    background: linear-gradient(90deg, rgba(15, 134, 68, 0.8), rgba(10, 93, 46, 0.9));
    box-shadow: 0 0 15px rgba(15, 134, 68, 0.5), inset 0 0 10px rgba(255, 255, 255, 0.1);
  }

  [data-theme="traditional"] .percentage-bar.correct {
    background: linear-gradient(90deg, rgba(15, 134, 68, 0.8), rgba(10, 93, 46, 0.9));
    box-shadow: 0 0 15px rgba(15, 134, 68, 0.5), inset 0 0 10px rgba(255, 255, 255, 0.1);
  }

  [data-theme="winter"] .percentage-bar.correct {
    background: linear-gradient(90deg, rgba(173, 216, 230, 0.8), rgba(135, 206, 250, 0.9));
    box-shadow: 0 0 15px rgba(173, 216, 230, 0.5), inset 0 0 10px rgba(255, 255, 255, 0.1);
  }

  [data-theme="mixed"] .percentage-bar.correct {
    background: linear-gradient(90deg, rgba(15, 134, 68, 0.8), rgba(10, 93, 46, 0.9));
    box-shadow: 0 0 15px rgba(15, 134, 68, 0.5), inset 0 0 10px rgba(255, 255, 255, 0.1);
  }

  .percentage-text {
    white-space: nowrap;
  }

  .voters-list {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.8);
    margin-top: 0.5rem;
    padding: 0.5rem;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 0.5rem;
    backdrop-filter: blur(3px);
    -webkit-backdrop-filter: blur(3px);
  }

  .voters-label {
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
    text-shadow: 0 0 5px rgba(255, 255, 255, 0.2);
  }

  .voters-names {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: rgba(173, 216, 230, 0.9);
  }

  .timer-display {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 1.25rem;
    min-height: 44px;
    background: rgba(255, 215, 0, 0.2);
    border: 2px solid var(--christmas-gold);
    border-radius: 9999px;
    font-weight: bold;
    touch-action: manipulation;
  }

  [data-theme="winter"] .timer-display {
    background: rgba(192, 192, 192, 0.2);
    border: 2px solid var(--winter-silver);
  }

  .timer-label {
    font-size: 1rem;
  }

  .timer-value {
    font-size: 1.25rem;
    color: var(--christmas-gold);
    min-width: 2.5rem;
    text-align: center;
  }

  [data-theme="winter"] .timer-value {
    color: var(--winter-silver);
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
