<script lang="ts">
  import { gameState, players } from '$lib/socket';
  import { GameState } from '@christmas/core';

  export let currentState: GameState;
  export let round: number = 0;
  export let maxRounds: number = 0;
  export let scoreboard: Array<{ name: string; score: number }> = [];
</script>

{#if $gameState?.currentPrompt}
  {@const promptTranslations = $gameState.currentPrompt.translations}
  {@const frenchPrompt =
    typeof promptTranslations?.fr?.prompt === 'string'
      ? promptTranslations.fr.prompt
      : ''}
  {@const englishPrompt =
    typeof promptTranslations?.en?.prompt === 'string'
      ? promptTranslations.en.prompt
      : $gameState.currentPrompt.prompt || ''}
  <div class="naughty-host-projection">
    <div class="naughty-question-section">
      <h2 class="game-title">😇 Naughty or Nice</h2>
      <div class="prompt-display-large">
        <div class="round-number">
          <div class="round-label-bilingual">
            <span class="round-label-french">Ronde {round}{#if maxRounds > 0} / {maxRounds}{/if}{#if currentState === GameState.ROUND_END} - Résultats{/if}</span>
            <span class="round-label-english">Round {round}{#if maxRounds > 0} / {maxRounds}{/if}{#if currentState === GameState.ROUND_END} - Results{/if}</span>
          </div>
        </div>
        <!-- Bilingual Prompt Display -->
        {#if frenchPrompt}
          <h3 class="prompt-text-large prompt-text-french">{frenchPrompt}</h3>
        {/if}
        <h3 class="prompt-text-large prompt-text-english">{englishPrompt}</h3>

        <div class="vote-options-large">
          {#if $gameState?.votes}
            {@const votes = $gameState.votes || {}}
            {@const naughtyCount = Object.values(votes).filter((v) => v === 'naughty').length}
            {@const niceCount = Object.values(votes).filter((v) => v === 'nice').length}
            {@const totalVotes = naughtyCount + niceCount}
            {@const naughtyPercentage =
              totalVotes > 0 ? Math.round((naughtyCount / totalVotes) * 100) : 0}
            {@const nicePercentage =
              totalVotes > 0 ? Math.round((niceCount / totalVotes) * 100) : 0}

            <div
              class="vote-option-card-large"
              class:majority={currentState === GameState.ROUND_END && naughtyCount > niceCount}
            >
              <div class="vote-header-large">
                <span class="vote-emoji-large">😈</span>
                <span class="vote-label-large">
                  <span class="vote-label-bilingual">
                    <span class="vote-label-french">Méchant</span>
                    <span class="vote-label-english">Naughty</span>
                  </span>
                </span>
                {#if currentState === GameState.ROUND_END && naughtyCount > niceCount}
                  <span class="winner-badge-large">
                    <span class="winner-bilingual">
                      <span class="winner-french">Gagnant</span>
                      <span class="winner-english">Winner</span>
                    </span>
                  </span>
                {/if}
              </div>
              {#if currentState === GameState.PLAYING || currentState === GameState.ROUND_END}
                <div class="vote-stats-large">
                  <div class="percentage-bar-container-large">
                    <div
                      class="percentage-bar-large"
                      class:naughty-fill={currentState === GameState.ROUND_END}
                      style="width: {naughtyPercentage}%"
                    ></div>
                  </div>
                  <div class="stats-text-large">
                    <span>{naughtyPercentage}%</span>
                    <span class="votes-bilingual">
                      <span class="votes-french">({naughtyCount} {naughtyCount === 1 ? 'vote' : 'votes'})</span>
                      <span class="votes-english">({naughtyCount} {naughtyCount === 1 ? 'vote' : 'votes'})</span>
                    </span>
                  </div>
                </div>
              {/if}
            </div>

            <div
              class="vote-option-card-large"
              class:majority={currentState === GameState.ROUND_END && niceCount > naughtyCount}
            >
              <div class="vote-header-large">
                <span class="vote-emoji-large">👼</span>
                <span class="vote-label-large">
                  <span class="vote-label-bilingual">
                    <span class="vote-label-french">Gentil</span>
                    <span class="vote-label-english">Nice</span>
                  </span>
                </span>
                {#if currentState === GameState.ROUND_END && niceCount > naughtyCount}
                  <span class="winner-badge-large">
                    <span class="winner-bilingual">
                      <span class="winner-french">Gagnant</span>
                      <span class="winner-english">Winner</span>
                    </span>
                  </span>
                {/if}
              </div>
              {#if currentState === GameState.PLAYING || currentState === GameState.ROUND_END}
                <div class="vote-stats-large">
                  <div class="percentage-bar-container-large">
                    <div
                      class="percentage-bar-large"
                      class:nice-fill={currentState === GameState.ROUND_END}
                      style="width: {nicePercentage}%"
                    ></div>
                  </div>
                  <div class="stats-text-large">
                    <span>{nicePercentage}%</span>
                    <span class="votes-bilingual">
                      <span class="votes-french">({niceCount} {niceCount === 1 ? 'vote' : 'votes'})</span>
                      <span class="votes-english">({niceCount} {niceCount === 1 ? 'vote' : 'votes'})</span>
                    </span>
                  </div>
                </div>
              {/if}
            </div>
          {:else}
            <div class="vote-option-card-large">
              <span class="vote-emoji-large">😈</span>
              <span class="vote-label-large">
                <span class="vote-label-bilingual">
                  <span class="vote-label-french">Méchant</span>
                  <span class="vote-label-english">Naughty</span>
                </span>
              </span>
            </div>
            <div class="vote-option-card-large">
              <span class="vote-emoji-large">😇</span>
              <span class="vote-label-large">
                <span class="vote-label-bilingual">
                  <span class="vote-label-french">Gentil</span>
                  <span class="vote-label-english">Nice</span>
                </span>
              </span>
            </div>
          {/if}
        </div>

        {#if currentState === GameState.PLAYING}
          <div class="waiting-status-large">
            <p class="status-text-large">
              <span class="status-bilingual">
                <span class="status-french">{Object.keys($gameState?.votes || {}).length} / {$players.length} joueurs ont voté</span>
                <span class="status-english">{Object.keys($gameState?.votes || {}).length} / {$players.length} players voted</span>
              </span>
            </p>
          </div>
        {/if}
      </div>
    </div>

    <div class="naughty-leaderboard-section">
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
  </div>
{/if}

<style>
  /* Main projection container - side-by-side layout */
  .naughty-host-projection {
    display: grid;
    grid-template-columns: 1fr 400px;
    gap: 3rem;
    width: 100%;
    max-width: 1600px;
    margin: 0 auto;
    padding: 2rem;
    min-height: 60vh;
  }

  /* Question Section - Left Side */
  .naughty-question-section {
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

  .prompt-display-large {
    display: flex;
    flex-direction: column;
    gap: 2rem;
    width: 100%;
  }

  .round-number {
    font-size: 2rem;
    font-weight: bold;
    color: #ffd700;
    text-align: center;
    padding: 1rem 2rem;
    background: rgba(255, 215, 0, 0.1);
    border: 3px solid #ffd700;
    border-radius: 1rem;
  }

  .round-label-bilingual,
  .vote-label-bilingual,
  .winner-bilingual,
  .votes-bilingual,
  .status-bilingual,
  .title-bilingual,
  .no-scores-bilingual {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .round-label-french,
  .vote-label-french,
  .winner-french,
  .votes-french,
  .status-french,
  .title-french,
  .no-scores-french {
    font-size: 1.5rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
  }

  .round-label-english,
  .vote-label-english,
  .winner-english,
  .votes-english,
  .status-english,
  .title-english,
  .no-scores-english {
    font-size: 2rem;
    font-weight: bold;
    color: white;
  }

  .vote-label-french,
  .vote-label-english {
    font-size: 2.5rem;
    color: white;
  }

  .winner-french,
  .winner-english {
    font-size: 1.5rem;
    color: white;
  }

  .prompt-text-large {
    font-size: 2.5rem;
    font-weight: bold;
    text-align: center;
    color: white;
    padding: 2rem;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 1rem;
    line-height: 1.4;
    word-wrap: break-word;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
  }

  .prompt-text-french {
    font-size: 2rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
    padding: 1.5rem 2rem;
    background: rgba(255, 255, 255, 0.05);
    margin-bottom: 1rem;
    border-bottom: 2px solid rgba(255, 255, 255, 0.2);
  }

  .prompt-text-english {
    font-size: 2.5rem;
    font-weight: bold;
    color: white;
  }

  .vote-options-large {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 2rem;
    width: 100%;
  }

  .vote-option-card-large {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 2rem;
    background: rgba(255, 255, 255, 0.05);
    border: 3px solid rgba(255, 255, 255, 0.2);
    border-radius: 1rem;
    transition: all 0.3s;
  }

  .vote-option-card-large.majority {
    background: rgba(15, 134, 68, 0.2);
    border-color: #0f8644;
    box-shadow: 0 0 30px rgba(15, 134, 68, 0.5);
  }

  .vote-header-large {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
  }

  .vote-emoji-large {
    font-size: 4rem;
    line-height: 1;
  }

  .vote-label-large {
    font-size: 2.5rem;
    font-weight: bold;
    color: white;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
  }

  .winner-badge-large {
    background: #0f8644;
    color: white;
    padding: 0.5rem 1.5rem;
    border-radius: 9999px;
    font-size: 1.5rem;
    font-weight: bold;
    margin-left: auto;
  }

  .vote-stats-large {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
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

  .percentage-bar-large.naughty-fill {
    background: linear-gradient(90deg, #c41e3a, #8b1538);
  }

  .percentage-bar-large.nice-fill {
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
  .naughty-leaderboard-section {
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
    .naughty-host-projection {
      grid-template-columns: 1fr 350px;
      gap: 2rem;
      padding: 1.5rem;
    }

    .prompt-text-large {
      font-size: 2rem;
    }
  }

  @media (max-width: 1024px) {
    .naughty-host-projection {
      grid-template-columns: 1fr;
      gap: 2rem;
    }

    .naughty-leaderboard-section {
      max-height: 400px;
    }

    .vote-options-large {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 768px) {
    .naughty-host-projection {
      padding: 1rem;
    }

    .game-title {
      font-size: 2rem;
    }

    .prompt-text-large {
      font-size: 1.75rem;
      padding: 1.5rem;
    }

    .vote-emoji-large {
      font-size: 3rem;
    }

    .vote-label-large {
      font-size: 2rem;
    }
  }
</style>

