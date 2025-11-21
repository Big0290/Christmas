<script lang="ts">
  import { gameState, players } from '$lib/socket';
  import { GameState } from '@christmas/core';

  export let currentState: GameState;
  export let round: number = 0;
  export let maxRounds: number = 0;
  export let scoreboard: Array<{ name: string; score: number }> = [];

  // Round synchronization: use gameState as source of truth, fallback to prop if gameState not available (ensures sync with players)
  $: syncedRound = $gameState?.round ?? round ?? 0;
  $: syncedMaxRounds = $gameState?.maxRounds ?? maxRounds ?? 0;
</script>

{#if $gameState?.currentQuestion || currentState === GameState.ROUND_END || currentState === GameState.PLAYING || currentState === GameState.STARTING}
  {@const questionTranslations = $gameState?.currentQuestion?.translations}
  {@const frenchQuestion = $gameState?.currentQuestion
    ? (typeof questionTranslations?.fr?.question === 'string'
        ? questionTranslations.fr.question
        : '')
    : ''}
  {@const englishQuestion = $gameState?.currentQuestion
    ? (typeof questionTranslations?.en?.question === 'string'
        ? questionTranslations.en.question
        : $gameState?.currentQuestion?.question || '')
    : ''}
  {@const frenchAnswers = $gameState?.currentQuestion
    ? (Array.isArray(questionTranslations?.fr?.answers)
        ? questionTranslations.fr.answers
        : [])
    : []}
  {@const englishAnswers = $gameState?.currentQuestion
    ? (Array.isArray(questionTranslations?.en?.answers)
        ? questionTranslations.en.answers
        : Array.isArray($gameState.currentQuestion.answers)
          ? $gameState.currentQuestion.answers
          : [])
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
          <div class="question-label-bilingual">
            <span class="question-label-french">Question {syncedRound}{#if syncedMaxRounds > 0} / {syncedMaxRounds}{/if}{#if currentState === GameState.ROUND_END} - Résultats{/if}</span>
            <span class="question-label-english">Question {syncedRound}{#if syncedMaxRounds > 0} / {syncedMaxRounds}{/if}{#if currentState === GameState.ROUND_END} - Results{/if}</span>
          </div>
        </div>

        <!-- Bilingual Question Display -->
        {#if $gameState?.currentQuestion}
          {#if frenchQuestion}
            <div class="question-text-french">{frenchQuestion}</div>
          {/if}
          <div class="question-text-english">{englishQuestion}</div>
        {:else if currentState === GameState.PLAYING || currentState === GameState.STARTING}
          <!-- Loading state when question is not yet available -->
          <div class="question-text-english loading-state">
            <ChristmasLoading message="Loading question..." size="medium" />
          </div>
        {/if}

        <!-- Answer Options - Bilingual -->
        <div class="answers-grid-large">
          {#if $gameState?.currentQuestion}
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
                  <span class="correct-badge-large">
                    <span class="correct-bilingual">
                      <span class="correct-french">✓ Correct</span>
                      <span class="correct-english">✓ Correct</span>
                    </span>
                  </span>
                {/if}
              </div>
              {#if currentState === GameState.ROUND_END}
                {#if $gameState?.showReveal}
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
                    <span class="votes-bilingual">
                      <span class="votes-french">({count} {count === 1 ? 'vote' : 'votes'})</span>
                      <span class="votes-english">({count} {count === 1 ? 'vote' : 'votes'})</span>
                    </span>
                  </div>
                </div>
                {:else}
                  <div class="answer-stats-large">
                    <div class="percentage-bar-container-large">
                      <div
                        class="percentage-bar-large"
                        class:correct={isCorrect}
                        style="width: 0%"
                      ></div>
                    </div>
                    <div class="stats-text-large">
                      <span>0%</span>
                      <span class="votes-bilingual">
                        <span class="votes-french">(0 votes)</span>
                        <span class="votes-english">(0 votes)</span>
                      </span>
                    </div>
                  </div>
                {/if}
              {:else if currentState === GameState.PLAYING}
                <div class="answer-progress-large">
                  <div class="progress-text-large">
                    <span class="progress-bilingual">
                      <span class="progress-french">{count} {count === 1 ? 'joueur a' : 'joueurs ont'} répondu</span>
                      <span class="progress-english">{count} {count === 1 ? 'player' : 'players'} answered</span>
                    </span>
                  </div>
                </div>
              {:else}
                <div class="answer-progress-large">
                  <div class="progress-text-large">
                    <span class="waiting-bilingual">
                      <span class="waiting-french">En attente des joueurs...</span>
                      <span class="waiting-english">Waiting for players...</span>
                    </span>
                  </div>
                </div>
              {/if}
            </div>
            {/each}
          {:else if currentState === GameState.PLAYING || currentState === GameState.STARTING}
            <!-- Loading placeholder for answers -->
            <div class="answers-loading-placeholder">
              <p>Waiting for question to load...</p>
            </div>
          {/if}
        </div>

        {#if currentState === GameState.PLAYING && $gameState?.currentQuestion}
          <div class="waiting-status-large">
            <p class="status-text-large">
              <span class="status-bilingual">
                <span class="status-french">{Object.keys($gameState?.answers || {}).length} / {$players.length} joueurs ont répondu</span>
                <span class="status-english">{Object.keys($gameState?.answers || {}).length} / {$players.length} players answered</span>
              </span>
            </p>
          </div>
        {/if}
      </div>
    </div>

    <!-- Right side: Full Leaderboard (hidden during PLAYING) -->
    {#if currentState !== GameState.PLAYING}
      <div class="trivia-leaderboard-section">
        <h3 class="leaderboard-title-large">
          <span class="title-bilingual">
            <span class="title-french">🏆 Classement</span>
            <span class="title-english">🏆 Leaderboard</span>
          </span>
        </h3>
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
            <p class="no-scores-large">
              <span class="no-scores-bilingual">
                <span class="no-scores-french">Aucun score pour le moment</span>
                <span class="no-scores-english">No scores yet</span>
              </span>
            </p>
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
    grid-template-columns: 1fr clamp(300px, 25vw, 400px);
    gap: clamp(1rem, 1.5vw, 1.5rem);
    width: 100%;
    max-width: min(98vw, calc(100vw - clamp(2rem, 4vw, 4rem)));
    margin: 0 auto;
    padding: clamp(0.75rem, 1vw, 1rem);
    min-height: fit-content;
    position: relative;
  }

  /* Frosty border effect */
  .trivia-host-projection::before {
    content: '';
    position: absolute;
    inset: -2px;
    border-radius: 1rem;
    padding: 2px;
    background: linear-gradient(135deg, 
      rgba(224, 242, 254, 0.3) 0%, 
      rgba(173, 216, 230, 0.2) 25%,
      rgba(255, 255, 255, 0.1) 50%,
      rgba(173, 216, 230, 0.2) 75%,
      rgba(224, 242, 254, 0.3) 100%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    opacity: 0.6;
    pointer-events: none;
    animation: frost-shimmer 3s ease-in-out infinite;
  }

  @keyframes frost-shimmer {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.7; }
  }

  /* Christmas lights effect */
  .trivia-host-projection::after {
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
  }

  @keyframes christmas-lights {
    0%, 100% { opacity: 0.3; filter: blur(1px) brightness(0.8); }
    25% { opacity: 0.8; filter: blur(0.5px) brightness(1.2); }
    50% { opacity: 0.5; filter: blur(1px) brightness(1); }
    75% { opacity: 0.9; filter: blur(0.5px) brightness(1.3); }
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
    font-size: 2rem;
    font-weight: bold;
    color: #ffd700;
    text-align: center;
    margin-bottom: 1rem;
    text-shadow: 
      0 0 15px rgba(255, 215, 0, 0.8),
      0 0 30px rgba(255, 215, 0, 0.5),
      2px 2px 8px rgba(0, 0, 0, 0.5);
    filter: drop-shadow(0 0 8px rgba(255, 215, 0, 0.4));
    position: relative;
  }

  .game-title::before {
    content: '❄️';
    position: absolute;
    left: -2rem;
    top: 50%;
    transform: translateY(-50%);
    font-size: 1.5rem;
    opacity: 0.6;
    animation: sparkle 2s ease-in-out infinite;
  }

  .game-title::after {
    content: '❄️';
    position: absolute;
    right: -2rem;
    top: 50%;
    transform: translateY(-50%);
    font-size: 1.5rem;
    opacity: 0.6;
    animation: sparkle 2s ease-in-out infinite 1s;
  }

  @keyframes sparkle {
    0%, 100% { opacity: 0.4; transform: translateY(-50%) scale(1); }
    50% { opacity: 0.8; transform: translateY(-50%) scale(1.2); }
  }

  .question-display-large {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: 100%;
  }

  .question-number {
    font-size: 1.75rem;
    font-weight: bold;
    color: #ffd700;
    text-align: center;
    padding: 0.75rem 1.5rem;
    background: linear-gradient(135deg, rgba(255, 215, 0, 0.15), rgba(224, 242, 254, 0.1));
    border: 2px solid rgba(255, 215, 0, 0.6);
    border-radius: 0.75rem;
    box-shadow: 
      0 0 15px rgba(255, 215, 0, 0.3),
      inset 0 0 20px rgba(224, 242, 254, 0.1);
    backdrop-filter: blur(5px);
  }

  .question-label-bilingual,
  .correct-bilingual,
  .votes-bilingual,
  .progress-bilingual,
  .waiting-bilingual,
  .status-bilingual,
  .title-bilingual,
  .no-scores-bilingual {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .question-label-french,
  .correct-french,
  .votes-french,
  .progress-french,
  .waiting-french,
  .status-french,
  .title-french,
  .no-scores-french {
    font-size: 1.5rem;
    font-weight: 600;
    color: rgba(255, 215, 0, 0.9);
  }

  .question-label-english,
  .correct-english,
  .votes-english,
  .progress-english,
  .waiting-english,
  .status-english,
  .title-english,
  .no-scores-english {
    font-size: 2rem;
    font-weight: bold;
    color: #ffd700;
  }

  .correct-french,
  .correct-english {
    font-size: 1.25rem;
    color: white;
  }

  .question-text-english {
    font-size: 2rem;
    font-weight: bold;
    line-height: 1.4;
    text-align: center;
    padding: 1.5rem;
    background: linear-gradient(135deg, rgba(224, 242, 254, 0.15), rgba(173, 216, 230, 0.1));
    border: 2px solid rgba(224, 242, 254, 0.4);
    border-radius: 0.75rem;
    color: white;
    word-wrap: break-word;
    text-shadow: 
      0 0 10px rgba(224, 242, 254, 0.5),
      2px 2px 4px rgba(0, 0, 0, 0.5);
    box-shadow: 
      0 0 20px rgba(224, 242, 254, 0.2),
      inset 0 0 30px rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(8px);
    position: relative;
    overflow: hidden;
  }

  .question-text-english.loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    min-height: 150px;
  }

  .loading-spinner {
    font-size: 3rem;
    animation: spin 2s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .loading-state p {
    font-size: 1.5rem;
    color: rgba(255, 255, 255, 0.8);
    margin: 0;
  }

  /* Christmas lights around question card */
  .question-text-english::before {
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
    z-index: 0;
  }

  .question-text-french {
    font-size: 1.75rem;
    font-weight: 600;
    line-height: 1.4;
    text-align: center;
    padding: 1rem 1.5rem;
    background: linear-gradient(135deg, rgba(173, 216, 230, 0.1), rgba(224, 242, 254, 0.08));
    border: 2px solid rgba(173, 216, 230, 0.3);
    border-radius: 0.75rem;
    color: rgba(255, 255, 255, 0.9);
    word-wrap: break-word;
    margin-bottom: 0.75rem;
    box-shadow: 
      0 0 15px rgba(173, 216, 230, 0.15),
      inset 0 0 20px rgba(255, 255, 255, 0.03);
    backdrop-filter: blur(5px);
  }

  /* Answers Grid */
  .answers-grid-large {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
    width: 100%;
  }

  .answers-loading-placeholder {
    grid-column: 1 / -1;
    text-align: center;
    padding: 2rem;
    color: rgba(255, 255, 255, 0.7);
    font-size: 1.5rem;
  }

  .answer-option-large {
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(224, 242, 254, 0.05));
    border: 2px solid rgba(224, 242, 254, 0.3);
    border-radius: 0.75rem;
    padding: 1rem;
    transition: all 0.3s;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    box-shadow: 
      0 0 15px rgba(224, 242, 254, 0.1),
      inset 0 0 20px rgba(255, 255, 255, 0.03);
    backdrop-filter: blur(5px);
    position: relative;
    overflow: hidden;
  }

  .answer-option-large::before {
    content: '✨';
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    font-size: 0.875rem;
    opacity: 0.3;
    animation: twinkle 3s ease-in-out infinite;
    z-index: 2;
  }

  /* Christmas lights around answer cards */
  .answer-option-large::after {
    content: '';
    position: absolute;
    inset: -3px;
    border-radius: 0.75rem;
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

  @keyframes twinkle {
    0%, 100% { opacity: 0.2; }
    50% { opacity: 0.5; }
  }

  .answer-option-large.correct {
    background: linear-gradient(135deg, rgba(15, 134, 68, 0.25), rgba(224, 242, 254, 0.15));
    border-color: #0f8644;
    box-shadow: 
      0 0 30px rgba(15, 134, 68, 0.5),
      0 0 20px rgba(224, 242, 254, 0.3),
      inset 0 0 30px rgba(15, 134, 68, 0.2);
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
    min-width: 3rem;
    width: 3rem;
    height: 3rem;
    background: linear-gradient(135deg, rgba(224, 242, 254, 0.3), rgba(173, 216, 230, 0.2));
    border: 2px solid rgba(224, 242, 254, 0.5);
    border-radius: 0.75rem;
    font-size: 1.5rem;
    font-weight: bold;
    color: white;
    flex-shrink: 0;
    box-shadow: 
      0 0 10px rgba(224, 242, 254, 0.3),
      inset 0 0 15px rgba(255, 255, 255, 0.1);
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
    font-size: 1.5rem;
    font-weight: 600;
    color: white;
    line-height: 1.3;
    text-shadow: 0 0 8px rgba(224, 242, 254, 0.3);
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
    padding: 1.5rem;
    background: linear-gradient(135deg, rgba(255, 215, 0, 0.15), rgba(224, 242, 254, 0.1));
    border: 2px solid rgba(255, 215, 0, 0.6);
    border-radius: 0.75rem;
    margin-top: 0.75rem;
    box-shadow: 
      0 0 20px rgba(255, 215, 0, 0.3),
      inset 0 0 25px rgba(224, 242, 254, 0.1);
    backdrop-filter: blur(5px);
  }

  .status-text-large {
    font-size: 1.75rem;
    font-weight: bold;
    color: #ffd700;
    text-shadow: 
      0 0 15px rgba(255, 215, 0, 0.8),
      0 0 30px rgba(255, 215, 0, 0.5),
      2px 2px 4px rgba(0, 0, 0, 0.5);
  }

  /* Leaderboard Section - Right Side */
  .trivia-leaderboard-section {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-height: 70vh;
    background: linear-gradient(135deg, rgba(0, 0, 0, 0.4), rgba(30, 50, 80, 0.3));
    border: 2px solid rgba(255, 215, 0, 0.5);
    border-radius: 0.75rem;
    padding: 1.5rem;
    overflow-y: auto;
    box-shadow: 
      0 0 30px rgba(255, 215, 0, 0.2),
      inset 0 0 40px rgba(224, 242, 254, 0.05);
    backdrop-filter: blur(10px);
    position: relative;
    overflow: hidden;
  }

  /* Christmas lights around leaderboard */
  .trivia-leaderboard-section::before {
    content: '❄️';
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    font-size: 1rem;
    opacity: 0.3;
    animation: float 4s ease-in-out infinite;
    z-index: 2;
  }

  .trivia-leaderboard-section::after {
    content: '';
    position: absolute;
    inset: -3px;
    border-radius: 0.75rem;
    background: 
      linear-gradient(0deg, transparent 0%, transparent 12%, #ff0000 12%, #ff0000 14%, transparent 14%, transparent 24%, #00ff00 24%, #00ff00 26%, transparent 26%, transparent 36%, #0000ff 36%, #0000ff 38%, transparent 38%, transparent 48%, #ffff00 48%, #ffff00 50%, transparent 50%, transparent 60%, #ff00ff 60%, #ff00ff 62%, transparent 62%, transparent 72%, #00ffff 72%, #00ffff 74%, transparent 74%, transparent 84%, #ff8800 84%, #ff8800 86%, transparent 86%, transparent 96%, #88ff00 96%, #88ff00 98%, transparent 98%, transparent 100%),
      linear-gradient(90deg, transparent 0%, transparent 12%, #ff0000 12%, #ff0000 14%, transparent 14%, transparent 24%, #00ff00 24%, #00ff00 26%, transparent 26%, transparent 36%, #0000ff 36%, #0000ff 38%, transparent 38%, transparent 48%, #ffff00 48%, #ffff00 50%, transparent 50%, transparent 60%, #ff00ff 60%, #ff00ff 62%, transparent 62%, transparent 72%, #00ffff 72%, #00ffff 74%, transparent 74%, transparent 84%, #ff8800 84%, #ff8800 86%, transparent 86%, transparent 96%, #88ff00 96%, #88ff00 98%, transparent 98%, transparent 100%),
      linear-gradient(180deg, transparent 0%, transparent 12%, #ff0000 12%, #ff0000 14%, transparent 14%, transparent 24%, #00ff00 24%, #00ff00 26%, transparent 26%, transparent 36%, #0000ff 36%, #0000ff 38%, transparent 38%, transparent 48%, #ffff00 48%, #ffff00 50%, transparent 50%, transparent 60%, #ff00ff 60%, #ff00ff 62%, transparent 62%, transparent 72%, #00ffff 72%, #00ffff 74%, transparent 74%, transparent 84%, #ff8800 84%, #ff8800 86%, transparent 86%, transparent 96%, #88ff00 96%, #88ff00 98%, transparent 98%, transparent 100%),
      linear-gradient(270deg, transparent 0%, transparent 12%, #ff0000 12%, #ff0000 14%, transparent 14%, transparent 24%, #00ff00 24%, #00ff00 26%, transparent 26%, transparent 36%, #0000ff 36%, #0000ff 38%, transparent 38%, transparent 48%, #ffff00 48%, #ffff00 50%, transparent 50%, transparent 60%, #ff00ff 60%, #ff00ff 62%, transparent 62%, transparent 72%, #00ffff 72%, #00ffff 74%, transparent 74%, transparent 84%, #ff8800 84%, #ff8800 86%, transparent 86%, transparent 96%, #88ff00 96%, #88ff00 98%, transparent 98%, transparent 100%);
    background-size: 100% 3px, 3px 100%, 100% 3px, 3px 100%;
    background-position: 0 0, 0 0, 0 100%, 100% 0;
    background-repeat: repeat-x, repeat-y, repeat-x, repeat-y;
    opacity: 0;
    pointer-events: none;
    animation: christmas-lights-card 2s ease-in-out infinite;
    filter: blur(0.5px);
    z-index: 1;
  }

  .trivia-leaderboard-section .leaderboard-decorative-star {
    content: '⭐';
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    font-size: 1rem;
    opacity: 0.3;
    animation: float 4s ease-in-out infinite 2s;
    z-index: 2;
  }

  @keyframes float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-5px); }
  }

  .leaderboard-title-large {
    font-size: 2rem;
    font-weight: bold;
    color: #ffd700;
    text-align: center;
    margin-bottom: 1rem;
    text-shadow: 
      0 0 15px rgba(255, 215, 0, 0.8),
      0 0 30px rgba(255, 215, 0, 0.5),
      2px 2px 4px rgba(0, 0, 0, 0.5);
  }

  .leaderboard-list-large {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .leaderboard-entry-large {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 1rem;
    align-items: center;
    padding: 1rem 1.25rem;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(224, 242, 254, 0.05));
    border: 1px solid rgba(224, 242, 254, 0.2);
    border-radius: 0.5rem;
    transition: all 0.2s;
    backdrop-filter: blur(3px);
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

