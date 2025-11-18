<script lang="ts">
  import { gameState, players } from '$lib/socket';
  import { GameState } from '@christmas/core';

  export let currentState: GameState;
  export let round: number = 0;
  export let maxRounds: number = 0;
  export let scoreboard: Array<{ name: string; score: number }> = [];
</script>

{#if $gameState?.availableEmojis}
  <div class="emoji-host-projection">
    <div class="emoji-question-section">
      <h2 class="game-title">🎶 Emoji Carol Battle</h2>
      {#if currentState === GameState.ROUND_END && $gameState?.roundResults?.[round - 1]}
        <!-- Round End: Show results -->
        <div class="emoji-display-large">
          <div class="round-number">
            <div class="round-label-bilingual">
              <span class="round-label-french">Ronde {round}{#if maxRounds > 0} / {maxRounds}{/if} - Résultats</span>
              <span class="round-label-english">Round {round}{#if maxRounds > 0} / {maxRounds}{/if} - Results</span>
            </div>
          </div>
          <h3 class="emoji-instruction-large">
            <div class="instruction-bilingual">
              <span class="instruction-french">Emojis les plus populaires :</span>
              <span class="instruction-english">Most Popular Emojis:</span>
            </div>
          </h3>

          <div class="emoji-results-grid-large">
            {#each (() => {
              const roundIndex = round - 1;
              const roundResult = $gameState.roundResults && $gameState.roundResults[roundIndex] ? $gameState.roundResults[roundIndex] : null;
              const emojiCounts = roundResult && roundResult.emojiCounts ? roundResult.emojiCounts : {};
              const entries = Object.entries(emojiCounts);
              const typedEntries = entries.map((entry) => {
                const emoji = entry[0];
                const count = Number(entry[1]);
                return [emoji, count];
              });
              return typedEntries.sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 6);
            })() as [emoji, count]}
              <div class="emoji-result-card-large">
                <span class="emoji-display-large-host">{emoji}</span>
                <span class="emoji-count-large">
                  <span class="count-bilingual">
                    <span class="count-french">{count} {count === 1 ? 'vote' : 'votes'}</span>
                    <span class="count-english">{count} {count === 1 ? 'vote' : 'votes'}</span>
                  </span>
                </span>
              </div>
            {/each}
          </div>
        </div>
      {:else}
        <!-- STARTING/PLAYING: Show emoji selection -->
        <div class="emoji-display-large">
          <div class="round-number">
            <div class="round-label-bilingual">
              <span class="round-label-french">Ronde {round}{#if maxRounds > 0} / {maxRounds}{/if}</span>
              <span class="round-label-english">Round {round}{#if maxRounds > 0} / {maxRounds}{/if}</span>
            </div>
          </div>
          <h3 class="emoji-instruction-large">
            <div class="instruction-bilingual">
              <span class="instruction-french">Choisissez un emoji que vous pensez que la plupart des gens choisiront !</span>
              <span class="instruction-english">Pick an emoji that you think most people will choose!</span>
            </div>
          </h3>

          <div class="emoji-grid-large-host">
            {#each $gameState.availableEmojis as emoji}
              <div class="emoji-card-large">
                <span class="emoji-display-large-host">{emoji}</span>
              </div>
            {/each}
          </div>

          {#if currentState === GameState.PLAYING}
            <div class="waiting-status-large">
              <p class="status-text-large">
                <span class="status-bilingual">
                  <span class="status-french">{Object.keys($gameState?.playerPicks || {}).length} / {$players.length} joueurs ont choisi</span>
                  <span class="status-english">{Object.keys($gameState?.playerPicks || {}).length} / {$players.length} players picked</span>
                </span>
              </p>
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <div class="emoji-leaderboard-section">
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
  .emoji-host-projection {
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
  .emoji-question-section {
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

  .emoji-display-large {
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
  .instruction-bilingual,
  .status-bilingual,
  .title-bilingual,
  .no-scores-bilingual,
  .count-bilingual {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .round-label-french,
  .instruction-french,
  .status-french,
  .title-french,
  .no-scores-french,
  .count-french {
    font-size: 1.5rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
  }

  .round-label-english,
  .instruction-english,
  .status-english,
  .title-english,
  .no-scores-english,
  .count-english {
    font-size: 2rem;
    font-weight: bold;
    color: #ffd700;
  }

  .emoji-instruction-large {
    font-size: 2rem;
    font-weight: bold;
    text-align: center;
    color: white;
    padding: 1.5rem;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 1rem;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
  }

  .instruction-french {
    font-size: 1.5rem;
    color: rgba(255, 255, 255, 0.9);
    margin-bottom: 0.25rem;
  }

  .instruction-english {
    font-size: 2rem;
    color: white;
  }

  .status-french {
    font-size: 1.5rem;
    color: rgba(255, 215, 0, 0.9);
  }

  .status-english {
    font-size: 2rem;
    color: #ffd700;
  }

  .title-french {
    font-size: 2rem;
    color: rgba(255, 215, 0, 0.9);
  }

  .title-english {
    font-size: 2.5rem;
    color: #ffd700;
  }

  .no-scores-french {
    font-size: 1.25rem;
    color: rgba(255, 255, 255, 0.4);
  }

  .no-scores-english {
    font-size: 1.5rem;
    color: rgba(255, 255, 255, 0.5);
  }

  .count-french,
  .count-english {
    font-size: 1.75rem;
    font-weight: 600;
    color: #ffd700;
  }

  .emoji-grid-large-host {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 1.5rem;
    width: 100%;
    padding: 2rem;
  }

  .emoji-card-large {
    display: flex;
    align-items: center;
    justify-content: center;
    aspect-ratio: 1;
    background: rgba(255, 255, 255, 0.05);
    border: 3px solid rgba(255, 255, 255, 0.2);
    border-radius: 1rem;
    padding: 1.5rem;
    transition: all 0.3s;
  }

  .emoji-card-large:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: #ffd700;
    transform: scale(1.05);
  }

  .emoji-display-large-host {
    font-size: 4rem;
    line-height: 1;
  }

  .emoji-results-grid-large {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2rem;
    width: 100%;
    padding: 2rem;
  }

  .emoji-result-card-large {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 2rem;
    background: rgba(255, 255, 255, 0.05);
    border: 3px solid rgba(255, 255, 255, 0.2);
    border-radius: 1rem;
    transition: all 0.3s;
  }

  .emoji-result-card-large:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: #ffd700;
  }

  .emoji-count-large {
    font-size: 1.75rem;
    font-weight: 600;
    color: #ffd700;
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
  .emoji-leaderboard-section {
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
    .emoji-host-projection {
      grid-template-columns: 1fr 350px;
      gap: 2rem;
      padding: 1.5rem;
    }

    .emoji-grid-large-host {
      grid-template-columns: repeat(5, 1fr);
    }
  }

  @media (max-width: 1024px) {
    .emoji-host-projection {
      grid-template-columns: 1fr;
      gap: 2rem;
    }

    .emoji-leaderboard-section {
      max-height: 400px;
    }

    .emoji-grid-large-host {
      grid-template-columns: repeat(4, 1fr);
    }

    .emoji-results-grid-large {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 768px) {
    .emoji-host-projection {
      padding: 1rem;
    }

    .game-title {
      font-size: 2rem;
    }

    .emoji-grid-large-host {
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
    }

    .emoji-results-grid-large {
      grid-template-columns: 1fr;
    }

    .emoji-display-large-host {
      font-size: 3rem;
    }
  }
</style>

