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
    gap: 1.5rem;
    width: 100%;
    max-width: 1600px;
    margin: 0 auto;
    padding: 1rem;
    min-height: fit-content;
    position: relative;
  }

  /* Frosty border effect */
  .emoji-host-projection::before {
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
  .emoji-host-projection::after {
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

  /* Question Section - Left Side */
  .emoji-question-section {
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

  .emoji-display-large {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: 100%;
  }

  .round-number {
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
    font-size: 1.75rem;
    font-weight: bold;
    text-align: center;
    color: white;
    padding: 1rem;
    background: linear-gradient(135deg, rgba(224, 242, 254, 0.15), rgba(173, 216, 230, 0.1));
    border: 2px solid rgba(224, 242, 254, 0.4);
    border-radius: 0.75rem;
    text-shadow: 
      0 0 10px rgba(224, 242, 254, 0.5),
      2px 2px 4px rgba(0, 0, 0, 0.5);
    box-shadow: 
      0 0 20px rgba(224, 242, 254, 0.2),
      inset 0 0 30px rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(8px);
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
    gap: 1rem;
    width: 100%;
    padding: 1rem;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(224, 242, 254, 0.05));
    border: 2px solid rgba(224, 242, 254, 0.3);
    border-radius: 0.75rem;
    box-shadow: 
      0 0 20px rgba(224, 242, 254, 0.15),
      inset 0 0 30px rgba(255, 255, 255, 0.03);
    backdrop-filter: blur(8px);
  }

  .emoji-card-large {
    display: flex;
    align-items: center;
    justify-content: center;
    aspect-ratio: 1;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.12), rgba(224, 242, 254, 0.08));
    border: 2px solid rgba(224, 242, 254, 0.4);
    border-radius: 0.75rem;
    padding: 1rem;
    transition: all 0.3s;
    box-shadow: 
      0 0 15px rgba(224, 242, 254, 0.2),
      inset 0 0 20px rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(5px);
    position: relative;
    overflow: hidden;
  }

  .emoji-card-large::before {
    content: '✨';
    position: absolute;
    top: 0.25rem;
    right: 0.25rem;
    font-size: 0.75rem;
    opacity: 0.3;
    animation: twinkle 3s ease-in-out infinite;
    z-index: 2;
  }

  /* Christmas lights around emoji cards */
  .emoji-card-large::after {
    content: '';
    position: absolute;
    inset: -3px;
    border-radius: 0.75rem;
    background: 
      linear-gradient(0deg, transparent 0%, transparent 25%, #ff0000 25%, #ff0000 27%, transparent 27%, transparent 50%, #00ff00 50%, #00ff00 52%, transparent 52%, transparent 75%, #0000ff 75%, #0000ff 77%, transparent 77%, transparent 100%),
      linear-gradient(90deg, transparent 0%, transparent 25%, #ff0000 25%, #ff0000 27%, transparent 27%, transparent 50%, #00ff00 50%, #00ff00 52%, transparent 52%, transparent 75%, #0000ff 75%, #0000ff 77%, transparent 77%, transparent 100%),
      linear-gradient(180deg, transparent 0%, transparent 25%, #ff0000 25%, #ff0000 27%, transparent 27%, transparent 50%, #00ff00 50%, #00ff00 52%, transparent 52%, transparent 75%, #0000ff 75%, #0000ff 77%, transparent 77%, transparent 100%),
      linear-gradient(270deg, transparent 0%, transparent 25%, #ff0000 25%, #ff0000 27%, transparent 27%, transparent 50%, #00ff00 50%, #00ff00 52%, transparent 52%, transparent 75%, #0000ff 75%, #0000ff 77%, transparent 77%, transparent 100%);
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

  .emoji-card-large:hover {
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.18), rgba(224, 242, 254, 0.12));
    border-color: #ffd700;
    transform: scale(1.05);
    box-shadow: 
      0 0 25px rgba(255, 215, 0, 0.4),
      0 0 15px rgba(224, 242, 254, 0.3);
  }

  .emoji-display-large-host {
    font-size: 3rem;
    line-height: 1;
    filter: drop-shadow(0 0 8px rgba(224, 242, 254, 0.4));
  }

  .emoji-results-grid-large {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    width: 100%;
    padding: 1rem;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(224, 242, 254, 0.05));
    border: 2px solid rgba(224, 242, 254, 0.3);
    border-radius: 0.75rem;
    margin-top: 0.75rem;
    box-shadow: 
      0 0 20px rgba(224, 242, 254, 0.15),
      inset 0 0 30px rgba(255, 255, 255, 0.03);
    backdrop-filter: blur(8px);
  }

  .emoji-result-card-large {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 1.5rem;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.12), rgba(224, 242, 254, 0.08));
    border: 2px solid rgba(224, 242, 254, 0.4);
    border-radius: 0.75rem;
    transition: all 0.3s;
    box-shadow: 
      0 0 15px rgba(224, 242, 254, 0.2),
      inset 0 0 20px rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(5px);
    position: relative;
    overflow: hidden;
  }

  /* Christmas lights around result cards */
  .emoji-result-card-large::before {
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
    z-index: 0;
  }

  .emoji-result-card-large:hover {
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.18), rgba(224, 242, 254, 0.12));
    border-color: #ffd700;
    box-shadow: 
      0 0 25px rgba(255, 215, 0, 0.4),
      0 0 15px rgba(224, 242, 254, 0.3);
  }

  .emoji-count-large {
    font-size: 1.75rem;
    font-weight: 600;
    color: #ffd700;
  }

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
  .emoji-leaderboard-section {
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

  .emoji-leaderboard-section::before {
    content: '❄️';
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    font-size: 1rem;
    opacity: 0.3;
    animation: float 4s ease-in-out infinite;
    z-index: 2;
  }

  /* Christmas lights around leaderboard */
  .emoji-leaderboard-section::after {
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

