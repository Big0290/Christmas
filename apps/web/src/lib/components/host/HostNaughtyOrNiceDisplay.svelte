<script lang="ts">
  import { gameState, players } from '$lib/socket';
  import { GameState } from '@christmas/core';

  export let currentState: GameState;
  export let round: number = 0;
  export let maxRounds: number = 0;
  export let scoreboard: Array<{ name: string; score: number }> = [];
</script>

{#if $gameState?.currentPrompt || currentState === GameState.ROUND_END || currentState === GameState.PLAYING || currentState === GameState.STARTING}
  {@const promptTranslations = $gameState?.currentPrompt?.translations}
  {@const frenchPrompt =
    $gameState?.currentPrompt && typeof promptTranslations?.fr?.prompt === 'string'
      ? promptTranslations.fr.prompt
      : ''}
  {@const englishPrompt =
    $gameState?.currentPrompt
      ? (typeof promptTranslations?.en?.prompt === 'string'
          ? promptTranslations.en.prompt
          : $gameState.currentPrompt.prompt || '')
      : ''}
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
        {#if currentState === GameState.STARTING && !$gameState?.currentPrompt}
          <div class="loading-placeholder">
            <p class="loading-text">Loading prompt...</p>
          </div>
        {:else}
          {#if frenchPrompt}
            <h3 class="prompt-text-large prompt-text-french">{frenchPrompt}</h3>
          {/if}
          <h3 class="prompt-text-large prompt-text-english">{englishPrompt}</h3>
        {/if}

        <div class="vote-options-large">
          {#if currentState === GameState.ROUND_END || currentState === GameState.PLAYING || $gameState?.votes}
            {@const votes = $gameState?.votes || {}}
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
  .naughty-host-projection::before {
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
  .naughty-host-projection::after {
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
  .naughty-question-section {
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

  .prompt-display-large {
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
    font-size: 2rem;
    font-weight: bold;
    text-align: center;
    color: white;
    padding: 1.5rem;
    background: linear-gradient(135deg, rgba(224, 242, 254, 0.15), rgba(173, 216, 230, 0.1));
    border: 2px solid rgba(224, 242, 254, 0.4);
    border-radius: 0.75rem;
    line-height: 1.4;
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

  /* Christmas lights around prompt card */
  .prompt-text-large::before {
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

  @keyframes christmas-lights-card {
    0%, 100% { opacity: 0.4; filter: blur(0.5px) brightness(0.9); }
    25% { opacity: 0.9; filter: blur(0.3px) brightness(1.4); }
    50% { opacity: 0.6; filter: blur(0.5px) brightness(1.1); }
    75% { opacity: 1; filter: blur(0.3px) brightness(1.5); }
  }

  .prompt-text-french {
    font-size: 1.75rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
    padding: 1rem 1.5rem;
    background: linear-gradient(135deg, rgba(173, 216, 230, 0.1), rgba(224, 242, 254, 0.08));
    border: 2px solid rgba(173, 216, 230, 0.3);
    border-radius: 0.75rem;
    margin-bottom: 0.75rem;
    box-shadow: 
      0 0 15px rgba(173, 216, 230, 0.15),
      inset 0 0 20px rgba(255, 255, 255, 0.03);
    backdrop-filter: blur(5px);
  }

  .prompt-text-english {
    font-size: 2rem;
    font-weight: bold;
    color: white;
  }

  .vote-options-large {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
    width: 100%;
  }

  .vote-option-card-large {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.5rem;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(224, 242, 254, 0.05));
    border: 2px solid rgba(224, 242, 254, 0.3);
    border-radius: 0.75rem;
    transition: all 0.3s;
    box-shadow: 
      0 0 15px rgba(224, 242, 254, 0.1),
      inset 0 0 20px rgba(255, 255, 255, 0.03);
    backdrop-filter: blur(5px);
    position: relative;
    overflow: hidden;
  }

  .vote-option-card-large::before {
    content: '✨';
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    font-size: 0.875rem;
    opacity: 0.3;
    animation: twinkle 3s ease-in-out infinite;
    z-index: 2;
  }

  /* Christmas lights around vote cards */
  .vote-option-card-large::after {
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

  @keyframes twinkle {
    0%, 100% { opacity: 0.2; }
    50% { opacity: 0.5; }
  }

  .vote-option-card-large.majority {
    background: linear-gradient(135deg, rgba(15, 134, 68, 0.25), rgba(224, 242, 254, 0.15));
    border-color: #0f8644;
    box-shadow: 
      0 0 30px rgba(15, 134, 68, 0.5),
      0 0 20px rgba(224, 242, 254, 0.3),
      inset 0 0 30px rgba(15, 134, 68, 0.2);
  }

  .vote-header-large {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
  }

  .vote-emoji-large {
    font-size: 3rem;
    line-height: 1;
    filter: drop-shadow(0 0 8px rgba(224, 242, 254, 0.4));
  }

  .vote-label-large {
    font-size: 2rem;
    font-weight: bold;
    color: white;
    text-shadow: 
      0 0 10px rgba(224, 242, 254, 0.4),
      2px 2px 4px rgba(0, 0, 0, 0.5);
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
  .naughty-leaderboard-section {
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

  .naughty-leaderboard-section::before {
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
  .naughty-leaderboard-section::after {
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

  .loading-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 200px;
    padding: 2rem;
  }

  .loading-text {
    font-size: 1.5rem;
    color: rgba(255, 255, 255, 0.7);
    text-align: center;
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

