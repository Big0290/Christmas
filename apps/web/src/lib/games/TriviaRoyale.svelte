<script lang="ts">
  import { socket, gameState } from '$lib/socket';
  import { GameState } from '@christmas/core';
  import { playSound } from '$lib/audio';
  import { onMount } from 'svelte';
  import AchievementBadge from '$lib/components/AchievementBadge.svelte';

  $: question = $gameState?.currentQuestion;
  $: hasAnswered = $gameState?.hasAnswered;
  $: state = $gameState?.state;
  $: round = $gameState?.round;
  $: maxRounds = $gameState?.maxRounds;
  $: scoreboard = $gameState?.scoreboard || [];
  $: currentScore = $gameState?.scores?.[$socket?.id] || 0;

  let previousState = GameState.LOBBY;
  let previousScore = 0;
  let previousRound = 0;
  let correctAnswers = 0;
  let achievements: Array<{ title: string; description: string; icon: string }> = [];
  let achievementId = 0;

  onMount(() => {
    // Play sound when game starts
    if (state === GameState.STARTING) {
      playSound('gameStart');
    }
    previousScore = currentScore;
    previousRound = round || 0;
  });

  // Watch for state changes and play sounds
  $: {
    if (state !== previousState) {
      if (state === GameState.STARTING) {
        playSound('gameStart');
      } else if (state === GameState.ROUND_END) {
        playSound('roundEnd');
      } else if (state === GameState.GAME_END) {
        playSound('gameEnd');
      }
      previousState = state;
    }
  }

  function selectAnswer(index: number) {
    if (!hasAnswered && state === GameState.PLAYING) {
      $socket.emit('trivia_answer', index);
      playSound('click');
    }
  }

  // Track achievements and score changes
  $: {
    // Check for correct answer
    if (state === GameState.ROUND_END && question && hasAnswered) {
      const wasCorrect = question.correctIndex !== undefined && 
        $gameState?.answers?.[$socket?.id] === question.correctIndex;
      
      if (wasCorrect) {
        playSound('correct');
        correctAnswers++;
        
        // First correct answer achievement
        if (correctAnswers === 1) {
          achievements = [
            ...achievements,
            {
              title: 'First Correct!',
              description: 'You got your first answer right!',
              icon: '🎯',
            },
          ];
        }
        
        // Perfect round achievement (all correct so far)
        if (round === correctAnswers && round > 0) {
          achievements = [
            ...achievements,
            {
              title: 'Perfect Round!',
              description: `You got all ${round} questions correct!`,
              icon: '⭐',
            },
          ];
        }
      } else {
        playSound('wrong');
        correctAnswers = 0; // Reset streak
      }
    }

    // High score milestone
    if (currentScore > previousScore) {
      const scoreDiff = currentScore - previousScore;
      if (scoreDiff >= 100) {
        achievements = [
          ...achievements,
          {
            title: 'High Score!',
            description: `You gained ${scoreDiff} points!`,
            icon: '🚀',
          },
        ];
      }
      previousScore = currentScore;
    }

    // Round change notification
    if (round !== previousRound && round > previousRound) {
      previousRound = round;
    }
  }
</script>

<div class="trivia-container">
  <!-- Achievement Badges -->
  {#each achievements as achievement, index (index)}
    <AchievementBadge
      achievement={achievement}
      on:close={() => {
        achievements = achievements.filter((_, i) => i !== index);
      }}
    />
  {/each}

  {#if !state}
    <div class="loading-overlay">
      <div class="text-6xl mb-4 animate-spin">⏳</div>
      <p class="text-xl text-white/70">Loading game...</p>
    </div>
  {:else if state === GameState.STARTING}
    <div class="countdown-overlay">
      <div class="text-8xl mb-4">🎄</div>
      <h1 class="text-4xl font-bold">Get Ready!</h1>
      <p class="text-xl text-white/70 mt-2">Starting in 3...</p>
    </div>
  {:else if state === GameState.PLAYING && question}
    <div class="question-card">
      <div class="question-header">
        <span class="round-badge">Round {round}/{maxRounds}</span>
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
        <div class="waiting-message">
          ✅ Answer submitted! Waiting for others...
        </div>
      {/if}
    </div>
  {:else if state === GameState.ROUND_END && question}
    <div class="result-card">
      <div class="text-6xl mb-4">
        {hasAnswered && question.correctIndex !== undefined ? '🎉' : '❌'}
      </div>
      <h2 class="text-2xl font-bold mb-4">
        Correct Answer: {question.answers[question.correctIndex]}
      </h2>
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
  {:else if state === GameState.GAME_END}
    <div class="game-end">
      <div class="text-8xl mb-6">🏆</div>
      <h1 class="text-4xl font-bold mb-4">Game Over!</h1>
      <div class="final-scoreboard">
        {#each scoreboard.slice(0, 10) as player, i}
          <div class="final-score-row" class:winner={i === 0}>
            <span class="rank">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</span>
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
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .loading-overlay, .countdown-overlay {
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
    font-size: 1.5rem;
    font-weight: bold;
    line-height: 1.4;
    text-align: center;
    padding: 1rem;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 1rem;
  }

  .answers-grid {
    display: grid;
    gap: 1rem;
  }

  .answer-button {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1.25rem;
    background: rgba(15, 134, 68, 0.2);
    border: 3px solid #0f8644;
    border-radius: 1rem;
    font-size: 1.125rem;
    font-weight: 600;
    color: white;
    transition: all 0.2s;
    text-align: left;
  }

  .answer-button:active:not(:disabled) {
    transform: scale(0.95);
    background: rgba(15, 134, 68, 0.4);
  }

  .answer-button.answered {
    opacity: 0.5;
  }

  .answer-letter {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    background: #0f8644;
    border-radius: 0.5rem;
    flex-shrink: 0;
  }

  .answer-text {
    flex: 1;
  }

  .waiting-message {
    text-align: center;
    padding: 1rem;
    background: rgba(255, 215, 0, 0.2);
    border: 2px solid #ffd700;
    border-radius: 1rem;
    font-weight: bold;
  }

  .result-card, .game-end {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 2rem;
  }

  .scoreboard-mini, .final-scoreboard {
    width: 100%;
    max-width: 400px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 1rem;
    padding: 1rem;
  }

  .score-row, .final-score-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    margin-bottom: 0.5rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 0.5rem;
  }

  .final-score-row.winner {
    background: linear-gradient(90deg, rgba(255, 215, 0, 0.3), rgba(255, 215, 0, 0.1));
    border: 2px solid #ffd700;
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
</style>
