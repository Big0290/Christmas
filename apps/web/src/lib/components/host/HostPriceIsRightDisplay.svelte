<script lang="ts">
  import { gameState, players } from '$lib/socket';
  import { GameState } from '@christmas/core';

  export let currentState: GameState | null | undefined;
  export let round: number;
  export let maxRounds: number;
  export let scoreboard: any[] = [];

  // Round synchronization: use gameState as source of truth, fallback to prop if gameState not available (ensures sync with players)
  $: syncedRound = $gameState?.round ?? round ?? 0;
  $: syncedMaxRounds = $gameState?.maxRounds ?? maxRounds ?? 0;
</script>

<div class="price-host-projection">
  <!-- Left side: Item and Guesses -->
  <div class="price-question-section">
    <h2 class="game-title">💰 Price Is Right</h2>
    {#if $gameState?.currentItem || currentState === GameState.ROUND_END || currentState === GameState.PLAYING || currentState === GameState.STARTING}
      {@const itemTranslations = $gameState?.currentItem?.translations}
      {@const frenchName =
        $gameState?.currentItem && typeof itemTranslations?.fr?.name === 'string'
          ? itemTranslations.fr.name
          : ''}
      {@const englishName =
        $gameState?.currentItem
          ? (typeof itemTranslations?.en?.name === 'string'
              ? itemTranslations.en.name
              : $gameState.currentItem.name || '')
          : ''}
      {@const frenchDescription =
        $gameState?.currentItem && typeof itemTranslations?.fr?.description === 'string'
          ? itemTranslations.fr.description
          : ''}
      {@const englishDescription =
        $gameState?.currentItem
          ? (typeof itemTranslations?.en?.description === 'string'
              ? itemTranslations.en.description
              : $gameState.currentItem.description || '')
          : ''}
      <div class="item-display-large">
        <div class="round-number">
          <div class="round-label-bilingual">
            <span class="round-label-french">Ronde {syncedRound}{#if syncedMaxRounds > 0} / {syncedMaxRounds}{/if}{#if currentState === GameState.ROUND_END} - Résultats{/if}</span>
            <span class="round-label-english">Round {syncedRound}{#if syncedMaxRounds > 0} / {syncedMaxRounds}{/if}{#if currentState === GameState.ROUND_END} - Results{/if}</span>
          </div>
        </div>

        {#if currentState === GameState.STARTING && !$gameState?.currentItem}
          <!-- STARTING: Show loading/placeholder -->
          <div class="item-content-large">
            <div class="loading-placeholder">
              <p class="loading-text">Loading item...</p>
            </div>
          </div>
        {:else if currentState === GameState.STARTING}
          <!-- STARTING: Show item without price -->
          <div class="item-content-large">
            {#if $gameState?.currentItem?.imageUrl}
              <img
                src={$gameState.currentItem.imageUrl}
                alt={englishName}
                class="item-image-large"
              />
            {/if}
            <!-- Bilingual Item Name -->
            {#if frenchName}
              <h3 class="item-name-large item-name-french">{frenchName}</h3>
            {/if}
            <h3 class="item-name-large item-name-english">{englishName}</h3>
            <!-- Bilingual Item Description -->
            {#if frenchDescription || englishDescription}
              <div class="item-description-bilingual">
                {#if frenchDescription}
                  <p class="item-description-large item-description-french">{frenchDescription}</p>
                {/if}
                {#if englishDescription}
                  <p class="item-description-large item-description-english">{englishDescription}</p>
                {/if}
              </div>
            {/if}
          </div>
        {:else if currentState === GameState.PLAYING}
          <!-- PLAYING: Show item with guesses -->
          <div class="item-content-large">
            {#if $gameState.currentItem.imageUrl}
              <img
                src={$gameState.currentItem.imageUrl}
                alt={englishName}
                class="item-image-large"
              />
            {/if}
            <!-- Bilingual Item Name -->
            {#if frenchName}
              <h3 class="item-name-large item-name-french">{frenchName}</h3>
            {/if}
            <h3 class="item-name-large item-name-english">{englishName}</h3>
            <!-- Bilingual Item Description -->
            {#if frenchDescription || englishDescription}
              <div class="item-description-bilingual">
                {#if frenchDescription}
                  <p class="item-description-large item-description-french">{frenchDescription}</p>
                {/if}
                {#if englishDescription}
                  <p class="item-description-large item-description-english">{englishDescription}</p>
                {/if}
              </div>
            {/if}
          </div>

          {#if $gameState?.guesses && Object.keys($gameState.guesses).length > 0}
            <div class="guesses-section-large">
              <h4 class="guesses-title-large">
                <span class="guesses-title-bilingual">
                  <span class="guesses-title-french">Tous les suppositions :</span>
                  <span class="guesses-title-english">All Guesses:</span>
                </span>
              </h4>
              <div class="guesses-list-large">
                {#each (() => {
                  const guessesArray = Object.entries($gameState.guesses).map(([playerId, guess]) => {
                    const player = $players.find((p) => p.id === playerId);
                    const guessValue = Number(guess);
                    return { playerId, playerName: player?.name || 'Player', guess: guessValue };
                  });
                  return guessesArray.sort((a, b) => a.guess - b.guess);
                })() as guessEntry (guessEntry.playerId)}
                  <div class="guess-entry-large">
                    <div class="guess-info-large">
                      <span class="guess-player-large">{guessEntry.playerName}</span>
                      <span class="guess-amount-large">${guessEntry.guess.toFixed(2)}</span>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <div class="waiting-status-large">
            <p class="status-text-large">
              <span class="status-bilingual">
                <span class="status-french">{Object.keys($gameState?.guesses || {}).length} / {$players.length} joueurs ont deviné</span>
                <span class="status-english">{Object.keys($gameState?.guesses || {}).length} / {$players.length} players guessed</span>
              </span>
            </p>
          </div>
        {:else if currentState === GameState.ROUND_END}
          <!-- ROUND_END: Show item with price reveal and detailed guesses -->
          <div class="item-content-large">
            {#if $gameState.currentItem.imageUrl}
              <img
                src={$gameState.currentItem.imageUrl}
                alt={englishName}
                class="item-image-large"
              />
            {/if}
            <!-- Bilingual Item Name -->
            {#if frenchName}
              <h3 class="item-name-large item-name-french">{frenchName}</h3>
            {/if}
            <h3 class="item-name-large item-name-english">{englishName}</h3>
            <!-- Bilingual Item Description -->
            {#if frenchDescription || englishDescription}
              <div class="item-description-bilingual">
                {#if frenchDescription}
                  <p class="item-description-large item-description-french">{frenchDescription}</p>
                {/if}
                {#if englishDescription}
                  <p class="item-description-large item-description-english">{englishDescription}</p>
                {/if}
              </div>
            {/if}
          </div>

          {#if $gameState.currentItem.price}
            <div class="actual-price-display-large">
              <h4 class="actual-price-label">
                <span class="price-label-bilingual">
                  <span class="price-label-french">Prix réel :</span>
                  <span class="price-label-english">Actual Price:</span>
                </span>
              </h4>
              <div class="actual-price-value">${$gameState.currentItem.price.toFixed(2)}</div>
            </div>
          {/if}

          {#if currentState === GameState.ROUND_END || ($gameState?.guesses && Object.keys($gameState.guesses).length > 0)}
            <div class="guesses-section-large">
              <h4 class="guesses-title-large">
                <span class="guesses-title-bilingual">
                  <span class="guesses-title-french">Tous les suppositions :</span>
                  <span class="guesses-title-english">All Guesses:</span>
                </span>
              </h4>
              {#if $gameState?.guesses && Object.keys($gameState.guesses).length > 0}
              <div class="guesses-list-large">
                {#each (() => {
                  const guessesArray = Object.entries($gameState.guesses).map(([playerId, guess]) => {
                    const player = $players.find((p) => p.id === playerId);
                    const guessValue = Number(guess);
                    return { playerId, playerName: player?.name || 'Player', guess: guessValue };
                  });
                  return guessesArray.sort((a, b) => a.guess - b.guess);
                })() as guessEntry (guessEntry.playerId)}
                  {@const actualPrice = $gameState.currentItem?.price}
                  {@const allGuesses = Object.values($gameState.guesses).map((g) => Number(g))}
                  {@const minDifference = actualPrice
                    ? Math.min(...allGuesses.map((g) => Math.abs(actualPrice - g)))
                    : null}
                  {@const isClosest =
                    actualPrice &&
                    minDifference !== null &&
                    Math.abs(actualPrice - guessEntry.guess) === minDifference}
                  <div class="guess-entry-large" class:closest={isClosest}>
                    <div class="guess-info-large">
                      <span class="guess-player-large">{guessEntry.playerName}</span>
                      <span class="guess-amount-large">${guessEntry.guess.toFixed(2)}</span>
                    </div>
                    {#if actualPrice}
                      {@const maxGuess = Math.max(...allGuesses, actualPrice)}
                      {@const minGuess = Math.min(...allGuesses, actualPrice)}
                      {@const range = maxGuess - minGuess || 1}
                      {@const normalizedGuess =
                        range > 0 ? ((guessEntry.guess - minGuess) / range) * 100 : 50}
                      {@const normalizedActual =
                        range > 0 ? ((actualPrice - minGuess) / range) * 100 : 50}
                      <div class="guess-comparison-large">
                        <div class="price-bar-container-large">
                          <div
                            class="price-bar-large"
                            style="left: {normalizedGuess}%; background: {isClosest
                              ? '#0f8644'
                              : '#ffd700'};"
                          ></div>
                          <div
                            class="price-bar-actual-large"
                            style="left: {normalizedActual}%; background: #0f8644;"
                          ></div>
                        </div>
                        <div class="guess-difference-large">
                          {#if guessEntry.guess <= actualPrice}
                            <span class="difference-text">
                              <span class="difference-bilingual">
                                <span class="difference-french">${(actualPrice - guessEntry.guess).toFixed(2)} sous</span>
                                <span class="difference-english">${(actualPrice - guessEntry.guess).toFixed(2)} under</span>
                              </span>
                            </span>
                          {:else}
                            <span class="difference-text">
                              <span class="difference-bilingual">
                                <span class="difference-french">${(guessEntry.guess - actualPrice).toFixed(2)} sur</span>
                                <span class="difference-english">${(guessEntry.guess - actualPrice).toFixed(2)} over</span>
                              </span>
                            </span>
                          {/if}
                        </div>
                      </div>
                    {/if}
                  </div>
                {/each}
            </div>
          {:else}
                <div class="guesses-list-large">
            <p class="no-guesses-large">
              <span class="no-guesses-bilingual">
                      <span class="no-guesses-french">Aucun joueur n'a deviné</span>
                      <span class="no-guesses-english">No players guessed</span>
              </span>
            </p>
                </div>
              {/if}
            </div>
          {/if}
        {/if}
      </div>
    {/if}
  </div>

  <!-- Right side: Full Leaderboard -->
  <div class="price-leaderboard-section">
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

<style>
  /* Main projection container - side-by-side layout */
  .price-host-projection {
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
  .price-host-projection::before {
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
  .price-host-projection::after {
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
  .price-question-section {
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

  .item-display-large {
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
  .price-label-bilingual,
  .guesses-title-bilingual,
  .status-bilingual,
  .no-guesses-bilingual,
  .title-bilingual,
  .no-scores-bilingual,
  .difference-bilingual {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .round-label-french,
  .price-label-french,
  .guesses-title-french,
  .status-french,
  .no-guesses-french,
  .title-french,
  .no-scores-french,
  .difference-french {
    font-size: 1.5rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
  }

  .round-label-english,
  .price-label-english,
  .guesses-title-english,
  .status-english,
  .no-guesses-english,
  .title-english,
  .no-scores-english,
  .difference-english {
    font-size: 2rem;
    font-weight: bold;
    color: #ffd700;
  }

  .difference-french,
  .difference-english {
    font-size: 1.25rem;
    color: #ffd700;
  }

  .price-label-french,
  .price-label-english {
    font-size: 1.75rem;
    color: white;
  }

  .guesses-title-french,
  .guesses-title-english {
    font-size: 2rem;
    color: #ffd700;
  }

  .item-content-large {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 1.5rem;
    background: linear-gradient(135deg, rgba(224, 242, 254, 0.15), rgba(173, 216, 230, 0.1));
    border: 2px solid rgba(224, 242, 254, 0.4);
    border-radius: 0.75rem;
    box-shadow: 
      0 0 20px rgba(224, 242, 254, 0.2),
      inset 0 0 30px rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(8px);
    position: relative;
    overflow: hidden;
  }

  /* Christmas lights around item card */
  .item-content-large::before {
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

  .item-image-large {
    width: 100%;
    max-width: 500px;
    max-height: 300px;
    object-fit: contain;
    border-radius: 0.75rem;
    box-shadow: 0 0 20px rgba(224, 242, 254, 0.2);
  }

  .item-name-large {
    font-size: 2rem;
    font-weight: bold;
    text-align: center;
    color: white;
    text-shadow: 
      0 0 10px rgba(224, 242, 254, 0.5),
      2px 2px 4px rgba(0, 0, 0, 0.5);
  }

  .item-name-french {
    font-size: 1.75rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
    margin-bottom: 0.5rem;
  }

  .item-name-english {
    font-size: 2rem;
    font-weight: bold;
    color: white;
  }

  .item-description-bilingual {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: 100%;
  }

  .item-description-large {
    font-size: 1.5rem;
    text-align: center;
    line-height: 1.5;
  }

  .item-description-french {
    color: rgba(255, 255, 255, 0.85);
    font-size: 1.25rem;
  }

  .item-description-english {
    color: rgba(255, 255, 255, 0.9);
    font-size: 1.5rem;
  }

  .actual-price-display-large {
    text-align: center;
    padding: 1.5rem;
    background: linear-gradient(135deg, rgba(15, 134, 68, 0.25), rgba(224, 242, 254, 0.15));
    border: 2px solid rgba(15, 134, 68, 0.6);
    border-radius: 0.75rem;
    margin: 0.75rem 0;
    box-shadow: 
      0 0 25px rgba(15, 134, 68, 0.4),
      0 0 15px rgba(224, 242, 254, 0.2),
      inset 0 0 30px rgba(15, 134, 68, 0.15);
    backdrop-filter: blur(8px);
  }

  .actual-price-label {
    font-size: 1.5rem;
    font-weight: 600;
    color: white;
    display: block;
    margin-bottom: 0.75rem;
    text-shadow: 0 0 8px rgba(224, 242, 254, 0.4);
  }

  .actual-price-value {
    font-size: 3rem;
    font-weight: bold;
    color: #0f8644;
    text-shadow: 
      0 0 15px rgba(15, 134, 68, 0.8),
      0 0 30px rgba(224, 242, 254, 0.5),
      2px 2px 4px rgba(0, 0, 0, 0.5);
    filter: drop-shadow(0 0 10px rgba(15, 134, 68, 0.4));
  }

  .guesses-section-large {
    width: 100%;
    margin-top: 1rem;
  }

  .guesses-title-large {
    font-size: 1.75rem;
    font-weight: bold;
    color: #ffd700;
    text-align: center;
    margin-bottom: 1rem;
    text-shadow: 
      0 0 15px rgba(255, 215, 0, 0.8),
      0 0 30px rgba(255, 215, 0, 0.5),
      2px 2px 4px rgba(0, 0, 0, 0.5);
  }

  .guesses-list-large {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-height: 400px;
    overflow-y: auto;
  }

  .guess-entry-large {
    padding: 1rem;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(224, 242, 254, 0.05));
    border: 2px solid rgba(224, 242, 254, 0.3);
    border-radius: 0.5rem;
    transition: all 0.3s;
    box-shadow: 
      0 0 15px rgba(224, 242, 254, 0.1),
      inset 0 0 20px rgba(255, 255, 255, 0.03);
    backdrop-filter: blur(5px);
    position: relative;
    overflow: hidden;
  }

  .guess-entry-large::before {
    content: '✨';
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    font-size: 0.875rem;
    opacity: 0.3;
    animation: twinkle 3s ease-in-out infinite;
    z-index: 2;
  }

  /* Christmas lights around guess cards */
  .guess-entry-large::after {
    content: '';
    position: absolute;
    inset: -3px;
    border-radius: 0.5rem;
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

  .guess-entry-large.closest {
    background: linear-gradient(135deg, rgba(15, 134, 68, 0.25), rgba(224, 242, 254, 0.15));
    border-color: #0f8644;
    box-shadow: 
      0 0 20px rgba(15, 134, 68, 0.4),
      0 0 15px rgba(224, 242, 254, 0.3),
      inset 0 0 25px rgba(15, 134, 68, 0.2);
  }

  .guess-info-large {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .guess-player-large {
    font-size: 1.75rem;
    font-weight: 600;
    color: white;
  }

  .guess-amount-large {
    font-size: 2rem;
    font-weight: bold;
    color: #ffd700;
  }

  .guess-comparison-large {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .price-bar-container-large {
    position: relative;
    width: 100%;
    height: 2rem;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 0.5rem;
    overflow: visible;
  }

  .price-bar-large,
  .price-bar-actual-large {
    position: absolute;
    top: 0;
    width: 4px;
    height: 100%;
    border-radius: 2px;
    transform: translateX(-50%);
  }

  .price-bar-actual-large {
    width: 6px;
    z-index: 2;
    box-shadow: 0 0 10px rgba(15, 134, 68, 0.8);
  }

  .guess-difference-large {
    text-align: center;
    font-size: 1.25rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.8);
  }

  .difference-text {
    color: #ffd700;
  }

  .no-guesses-large {
    text-align: center;
    padding: 2rem;
    font-size: 1.5rem;
    color: rgba(255, 255, 255, 0.5);
    font-style: italic;
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
  .price-leaderboard-section {
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

  .price-leaderboard-section::before {
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
  .price-leaderboard-section::after {
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
    .price-host-projection {
      grid-template-columns: 1fr 350px;
      gap: 2rem;
      padding: 1.5rem;
    }

    .item-name-large {
      font-size: 2rem;
    }
  }

  @media (max-width: 1024px) {
    .price-host-projection {
      grid-template-columns: 1fr;
      gap: 2rem;
    }

    .price-leaderboard-section {
      max-height: 400px;
    }

    .item-image-large {
      max-width: 400px;
      max-height: 300px;
    }
  }

  @media (max-width: 768px) {
    .price-host-projection {
      padding: 1rem;
    }

    .game-title {
      font-size: 2rem;
    }

    .item-name-large {
      font-size: 1.75rem;
    }

    .actual-price-value {
      font-size: 3rem;
    }

    .guess-player-large {
      font-size: 1.5rem;
    }

    .guess-amount-large {
      font-size: 1.75rem;
    }
  }
</style>

