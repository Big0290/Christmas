<script lang="ts">
  import { gameState, players } from '$lib/socket';
  import { GameState } from '@christmas/core';

  export let currentState: GameState | null | undefined;
  export let round: number;
  export let maxRounds: number;
  export let scoreboard: any[] = [];
</script>

<div class="price-host-projection">
  <!-- Left side: Item and Guesses -->
  <div class="price-question-section">
    <h2 class="game-title">💰 Price Is Right</h2>
    {#if $gameState?.currentItem}
      <div class="item-display-large">
        <div class="round-number">
          Round {round}{#if maxRounds > 0}
            / {maxRounds}{/if}
          {#if currentState === GameState.ROUND_END}
            - Results
          {/if}
        </div>

        {#if currentState === GameState.STARTING}
          <!-- STARTING: Show item without price -->
          <div class="item-content-large">
            {#if $gameState.currentItem.imageUrl}
              <img
                src={$gameState.currentItem.imageUrl}
                alt={$gameState.currentItem.name}
                class="item-image-large"
              />
            {/if}
            <h3 class="item-name-large">{$gameState.currentItem.name}</h3>
            {#if $gameState.currentItem.description}
              <p class="item-description-large">{$gameState.currentItem.description}</p>
            {/if}
          </div>
        {:else if currentState === GameState.PLAYING}
          <!-- PLAYING: Show item with guesses -->
          <div class="item-content-large">
            {#if $gameState.currentItem.imageUrl}
              <img
                src={$gameState.currentItem.imageUrl}
                alt={$gameState.currentItem.name}
                class="item-image-large"
              />
            {/if}
            <h3 class="item-name-large">{$gameState.currentItem.name}</h3>
            {#if $gameState.currentItem.description}
              <p class="item-description-large">{$gameState.currentItem.description}</p>
            {/if}
          </div>

          {#if $gameState?.guesses && Object.keys($gameState.guesses).length > 0}
            <div class="guesses-section-large">
              <h4 class="guesses-title-large">All Guesses:</h4>
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
              {Object.keys($gameState?.guesses || {}).length} / {$players.length} players guessed
            </p>
          </div>
        {:else if currentState === GameState.ROUND_END}
          <!-- ROUND_END: Show item with price reveal and detailed guesses -->
          <div class="item-content-large">
            {#if $gameState.currentItem.imageUrl}
              <img
                src={$gameState.currentItem.imageUrl}
                alt={$gameState.currentItem.name}
                class="item-image-large"
              />
            {/if}
            <h3 class="item-name-large">{$gameState.currentItem.name}</h3>
            {#if $gameState.currentItem.description}
              <p class="item-description-large">{$gameState.currentItem.description}</p>
            {/if}
          </div>

          {#if $gameState.currentItem.price}
            <div class="actual-price-display-large">
              <h4 class="actual-price-label">Actual Price:</h4>
              <div class="actual-price-value">${$gameState.currentItem.price.toFixed(2)}</div>
            </div>
          {/if}

          {#if $gameState?.guesses && Object.keys($gameState.guesses).length > 0}
            <div class="guesses-section-large">
              <h4 class="guesses-title-large">All Guesses:</h4>
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
                            <span class="difference-text"
                              >${(actualPrice - guessEntry.guess).toFixed(2)} under</span
                            >
                          {:else}
                            <span class="difference-text"
                              >${(guessEntry.guess - actualPrice).toFixed(2)} over</span
                            >
                          {/if}
                        </div>
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {:else}
            <p class="no-guesses-large">No guesses yet</p>
          {/if}
        {/if}
      </div>
    {/if}
  </div>

  <!-- Right side: Full Leaderboard -->
  <div class="price-leaderboard-section">
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
</div>

<style>
  /* Main projection container - side-by-side layout */
  .price-host-projection {
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
  .price-question-section {
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

  .item-display-large {
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

  .item-content-large {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    padding: 2rem;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 1rem;
  }

  .item-image-large {
    width: 100%;
    max-width: 500px;
    max-height: 400px;
    object-fit: contain;
    border-radius: 1rem;
  }

  .item-name-large {
    font-size: 2.5rem;
    font-weight: bold;
    text-align: center;
    color: white;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
  }

  .item-description-large {
    font-size: 1.5rem;
    text-align: center;
    color: rgba(255, 255, 255, 0.9);
    line-height: 1.5;
  }

  .actual-price-display-large {
    text-align: center;
    padding: 2rem;
    background: rgba(15, 134, 68, 0.2);
    border: 3px solid #0f8644;
    border-radius: 1rem;
    margin: 1rem 0;
  }

  .actual-price-label {
    font-size: 1.75rem;
    font-weight: 600;
    color: white;
    display: block;
    margin-bottom: 1rem;
  }

  .actual-price-value {
    font-size: 4rem;
    font-weight: bold;
    color: #0f8644;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
  }

  .guesses-section-large {
    width: 100%;
    margin-top: 2rem;
  }

  .guesses-title-large {
    font-size: 2rem;
    font-weight: bold;
    color: #ffd700;
    text-align: center;
    margin-bottom: 1.5rem;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
  }

  .guesses-list-large {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-height: 400px;
    overflow-y: auto;
  }

  .guess-entry-large {
    padding: 1.5rem;
    background: rgba(255, 255, 255, 0.05);
    border: 2px solid rgba(255, 255, 255, 0.2);
    border-radius: 0.75rem;
    transition: all 0.3s;
  }

  .guess-entry-large.closest {
    background: rgba(15, 134, 68, 0.2);
    border-color: #0f8644;
    box-shadow: 0 0 20px rgba(15, 134, 68, 0.4);
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
  .price-leaderboard-section {
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

