<script lang="ts">
  import { gameState, players } from '$lib/socket';
  import { GameState } from '@christmas/core';

  export let currentState: GameState;
  export let round: number = 0;
  export let maxRounds: number = 0;
  export let scoreboard: Array<{ name: string; score: number }> = [];
</script>

{#if $gameState?.currentQuestion}
  {@const questionTranslations = $gameState.currentQuestion.translations}
  {@const frenchQuestion =
    typeof questionTranslations?.fr?.question === 'string'
      ? questionTranslations.fr.question
      : ''}
  {@const englishQuestion =
    typeof questionTranslations?.en?.question === 'string'
      ? questionTranslations.en.question
      : $gameState.currentQuestion.question || ''}
  {@const frenchAnswers = Array.isArray(questionTranslations?.fr?.answers)
    ? questionTranslations.fr.answers
    : []}
  {@const englishAnswers = Array.isArray(questionTranslations?.en?.answers)
    ? questionTranslations.en.answers
    : Array.isArray($gameState.currentQuestion.answers)
      ? $gameState.currentQuestion.answers
      : []}
  <div
    class="trivia-host-projection"
    class:no-leaderboard={currentState === GameState.PLAYING}
  >
    <!-- Question and Answers -->
    <div class="trivia-question-section">
      <h2 class="game-title">🎄 Christmas Trivia Royale</h2>
      <div class="question-display-large">
        <div class="question-number">
          Question {round}{#if maxRounds > 0}
            / {maxRounds}{/if}
          {#if currentState === GameState.ROUND_END} - Results{/if}
        </div>

        <!-- Bilingual Question Display -->
        {#if frenchQuestion}
          <div class="question-text-french">{frenchQuestion}</div>
        {/if}
        <div class="question-text-english">{englishQuestion}</div>

        <!-- Answer Options - Bilingual -->
        <div class="answers-grid-large">
          {#each $gameState.currentQuestion.answers as answer, index}
            {@const count = $gameState?.answerCounts?.[index] || 0}
            {@const percentage = $gameState?.answerPercentages?.[index] || 0}
            {@const isCorrect =
              currentState === GameState.ROUND_END &&
              index === $gameState.currentQuestion.correctIndex}
            <div
              class="answer-option-large"
              class:correct={isCorrect}
              class:revealed={currentState === GameState.ROUND_END &&
                $gameState?.showReveal}
            >
              <div class="answer-header-large">
                <span class="answer-letter-large">{String.fromCharCode(65 + index)}</span>
                <div class="answer-text-bilingual">
                  {#if frenchAnswers[index]}
                    <div class="answer-text-french">{frenchAnswers[index]}</div>
                  {/if}
                  <div class="answer-text-english">
                    {englishAnswers[index] || answer}
                  </div>
                </div>
                {#if isCorrect && currentState === GameState.ROUND_END}
                  <span class="correct-badge-large">✓ Correct</span>
                {/if}
              </div>
              {#if currentState === GameState.ROUND_END && $gameState?.showReveal}
                <div class="answer-stats-large">
                  <div class="percentage-bar-container-large">
                    <div
                      class="percentage-bar-large"
                      class:correct={isCorrect}
                      style="width: {percentage}%"
                    ></div>
                  </div>
                  <div class="stats-text-large">
                    <span>{percentage}%</span>
                    <span>({count} {count === 1 ? 'vote' : 'votes'})</span>
                  </div>
                </div>
              {:else if currentState === GameState.PLAYING}
                <div class="answer-progress-large">
                  <div class="progress-text-large">
                    {count}
                    {count === 1 ? 'player' : 'players'} answered
                  </div>
                </div>
              {:else}
                <div class="answer-progress-large">
                  <div class="progress-text-large">Waiting for players...</div>
                </div>
              {/if}
            </div>
          {/each}
        </div>

        {#if currentState === GameState.PLAYING}
          <div class="waiting-status-large">
            <p class="status-text-large">
              {Object.keys($gameState?.answers || {}).length} / {$players.length} players answered
            </p>
          </div>
        {/if}
      </div>
    </div>

    <!-- Right side: Full Leaderboard (hidden during PLAYING) -->
    {#if currentState !== GameState.PLAYING}
      <div class="trivia-leaderboard-section">
        <h3 class="leaderboard-title-large">🏆 Leaderboard</h3>
        <div class="leaderboard-list-large">
          {#each scoreboard as player, i}
            <div class="leaderboard-entry-large" class:top-three={i < 3}>
              <span class="leaderboard-rank-large">
                {#if i === 0}
                  🥇
                {:else if i === 1}
                  🥈
                {:else if i === 2}
                  🥉
                {:else}
                  #{i + 1}
                {/if}
              </span>
              <span class="leaderboard-name-large">{player.name}</span>
              <span class="leaderboard-score-large">{player.score}</span>
            </div>
          {:else}
            <p class="no-scores-large">No scores yet</p>
          {/each}
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  /* Main projection container - side-by-side layout for question and leaderboard */
  .trivia-host-projection {
    display: grid;
    grid-template-columns: 1fr 400px;
    gap: 3rem;
    width: 100%;
    max-width: 1600px;
    margin: 0 auto;
    padding: 2rem;
    min-height: 60vh;
  }

  .trivia-host-projection.no-leaderboard {
    grid-template-columns: 1fr;
  }

  /* Question Section - Left Side */
  .trivia-question-section {
    display: flex;
    flex-direction: column;
    width: 100%;
  }

  .game-title {
    font-size: 3rem;
    font-weight: bold;
    color: #ffd700;
    text-align: center;
    margin-bottom: 2rem;
    text-shadow: 2px 2px 8px rgba(0, 0, 0, 0.5);
  }

  .question-display-large {
    display: flex;
    flex-direction: column;
    gap: 2rem;
    width: 100%;
  }

  .question-number {
    font-size: 2rem;
    font-weight: bold;
    color: #ffd700;
    text-align: center;
    padding: 1rem 2rem;
    background: rgba(255, 215, 0, 0.1);
    border: 3px solid #ffd700;
    border-radius: 1rem;
  }

  .question-text-english {
    font-size: 2.5rem;
    font-weight: bold;
    line-height: 1.4;
    text-align: center;
    padding: 2rem;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 1rem;
    color: white;
    word-wrap: break-word;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
  }

  .question-text-french {
    font-size: 2rem;
    font-weight: 600;
    line-height: 1.4;
    text-align: center;
    padding: 1.5rem 2rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 1rem;
    color: rgba(255, 255, 255, 0.9);
    word-wrap: break-word;
    margin-bottom: 1rem;
    border-bottom: 2px solid rgba(255, 255, 255, 0.2);
  }

  /* Answers Grid */
  .answers-grid-large {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 2rem;
    width: 100%;
  }

  .answer-option-large {
    background: rgba(255, 255, 255, 0.05);
    border: 3px solid rgba(255, 255, 255, 0.2);
    border-radius: 1rem;
    padding: 1.5rem;
    transition: all 0.3s;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .answer-option-large.correct {
    background: rgba(15, 134, 68, 0.2);
    border-color: #0f8644;
    box-shadow: 0 0 30px rgba(15, 134, 68, 0.5);
  }

  .answer-option-large.revealed {
    border-width: 4px;
  }

  .answer-header-large {
    display: flex;
    align-items: flex-start;
    gap: 1.5rem;
    width: 100%;
  }

  .answer-letter-large {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 4rem;
    width: 4rem;
    height: 4rem;
    background: rgba(255, 255, 255, 0.2);
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-radius: 1rem;
    font-size: 2rem;
    font-weight: bold;
    color: white;
    flex-shrink: 0;
  }

  .answer-option-large.correct .answer-letter-large {
    background: #0f8644;
    border-color: #0f8644;
  }

  .answer-text-bilingual {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .answer-text-english {
    font-size: 1.75rem;
    font-weight: 600;
    color: white;
    line-height: 1.3;
  }

  .answer-text-french {
    font-size: 1.5rem;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.85);
    line-height: 1.3;
  }

  .correct-badge-large {
    background: #0f8644;
    color: white;
    padding: 0.5rem 1.5rem;
    border-radius: 9999px;
    font-size: 1.25rem;
    font-weight: bold;
    white-space: nowrap;
    margin-left: auto;
  }

  /* Answer Stats */
  .answer-stats-large {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: 0.5rem;
  }

  .percentage-bar-container-large {
    width: 100%;
    height: 3rem;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 0.75rem;
    overflow: hidden;
    position: relative;
  }

  .percentage-bar-large {
    height: 100%;
    background: linear-gradient(90deg, rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.2));
    transition: width 0.8s ease-out;
    display: flex;
    align-items: center;
    padding: 0 1.5rem;
    color: white;
    font-weight: bold;
    font-size: 1.5rem;
  }

  .percentage-bar-large.correct {
    background: linear-gradient(90deg, #0f8644, #0a5d2e);
  }

  .stats-text-large {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 1.5rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
  }

  /* Answer Progress */
  .answer-progress-large {
    padding: 1rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 0.75rem;
    text-align: center;
  }

  .progress-text-large {
    font-size: 1.5rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.8);
  }

  /* Waiting Status */
  .waiting-status-large {
    text-align: center;
    padding: 2rem;
    background: rgba(255, 215, 0, 0.1);
    border: 3px solid #ffd700;
    border-radius: 1rem;
    margin-top: 1rem;
  }

  .status-text-large {
    font-size: 2rem;
    font-weight: bold;
    color: #ffd700;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
  }

  /* Leaderboard Section - Right Side */
  .trivia-leaderboard-section {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-height: 80vh;
    background: rgba(0, 0, 0, 0.3);
    border: 3px solid #ffd700;
    border-radius: 1rem;
    padding: 2rem;
    overflow-y: auto;
  }

  .leaderboard-title-large {
    font-size: 2.5rem;
    font-weight: bold;
    color: #ffd700;
    text-align: center;
    margin-bottom: 2rem;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
  }

  .leaderboard-list-large {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .leaderboard-entry-large {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 1.5rem;
    align-items: center;
    padding: 1.25rem 1.5rem;
    background: rgba(255, 255, 255, 0.05);
    border: 2px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.75rem;
    transition: all 0.2s;
  }

  .leaderboard-entry-large.top-three {
    background: linear-gradient(90deg, rgba(255, 215, 0, 0.2), rgba(255, 215, 0, 0.05));
    border-color: rgba(255, 215, 0, 0.5);
  }

  .leaderboard-entry-large:hover {
    background: rgba(255, 255, 255, 0.1);
    transform: translateX(4px);
  }

  .leaderboard-rank-large {
    font-size: 2rem;
    font-weight: bold;
    min-width: 4rem;
    text-align: center;
  }

  .leaderboard-name-large {
    font-size: 1.75rem;
    font-weight: 600;
    color: white;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .leaderboard-score-large {
    font-size: 2rem;
    font-weight: bold;
    color: #ffd700;
    min-width: 5rem;
    text-align: right;
  }

  .no-scores-large {
    text-align: center;
    color: rgba(255, 255, 255, 0.5);
    padding: 2rem;
    font-size: 1.5rem;
    font-style: italic;
  }

  /* Responsive Design */
  @media (max-width: 1400px) {
    .trivia-host-projection {
      grid-template-columns: 1fr 350px;
      gap: 2rem;
      padding: 1.5rem;
    }

    .game-title {
      font-size: 2.5rem;
    }

    .question-text-english {
      font-size: 2rem;
    }

    .question-text-french {
      font-size: 1.75rem;
    }

    .answers-grid-large {
      gap: 1.5rem;
    }
  }

  @media (max-width: 1024px) {
    .trivia-host-projection {
      grid-template-columns: 1fr;
      gap: 2rem;
    }

    .trivia-leaderboard-section {
      max-height: 400px;
    }

    .answers-grid-large {
      grid-template-columns: 1fr;
    }

    .answer-letter-large {
      min-width: 3.5rem;
      width: 3.5rem;
      height: 3.5rem;
      font-size: 1.75rem;
    }

    .answer-text-english {
      font-size: 1.5rem;
    }

    .answer-text-french {
      font-size: 1.25rem;
    }
  }

  @media (max-width: 768px) {
    .trivia-host-projection {
      padding: 1rem;
    }

    .game-title {
      font-size: 2rem;
      margin-bottom: 1.5rem;
    }

    .question-number {
      font-size: 1.5rem;
      padding: 0.75rem 1.5rem;
    }

    .question-text-english {
      font-size: 1.75rem;
      padding: 1.5rem;
    }

    .question-text-french {
      font-size: 1.5rem;
      padding: 1rem 1.5rem;
    }

    .answer-option-large {
      padding: 1.25rem;
    }

    .answer-letter-large {
      min-width: 3rem;
      width: 3rem;
      height: 3rem;
      font-size: 1.5rem;
    }

    .answer-text-english {
      font-size: 1.25rem;
    }

    .answer-text-french {
      font-size: 1.125rem;
    }

    .leaderboard-title-large {
      font-size: 2rem;
    }

    .leaderboard-rank-large {
      font-size: 1.5rem;
    }

    .leaderboard-name-large {
      font-size: 1.5rem;
    }

    .leaderboard-score-large {
      font-size: 1.75rem;
    }

    .stats-text-large {
      font-size: 1.25rem;
    }

    .percentage-bar-large {
      font-size: 1.25rem;
    }
  }
</style>

