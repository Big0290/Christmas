<script lang="ts">
  import { gameState, players, socket } from '$lib/socket';
  import { GameState } from '@christmas/core';
  import { onMount, onDestroy } from 'svelte';
  import type { BingoItem } from '@christmas/core';

  export let currentState: GameState;
  export let round: number = 0;
  export let maxRounds: number = 0;
  export let scoreboard: Array<{ name: string; score: number }> = [];

  // Round synchronization: use gameState as source of truth, fallback to prop if gameState not available (ensures sync with players)
  $: syncedRound = $gameState?.round ?? round ?? 0;
  $: syncedMaxRounds = $gameState?.maxRounds ?? maxRounds ?? 0;

  $: calledItems = ($gameState?.calledItems as BingoItem[]) || [];
  $: currentItem = ($gameState?.currentItem as BingoItem) || null;
  $: winners = ($gameState?.winners as string[]) || [];
  $: itemsCalled = $gameState?.itemsCalled || 0;

  let animatingItem: BingoItem | null = null;
  let animationKey = 0;

  function handleItemCalled(item: BingoItem, callNumber: number) {
    animatingItem = item;
    animationKey++;
  }

  onMount(() => {
    const unsubscribe = socket.subscribe((s) => {
      if (!s) return;
      s.on('bingo_item_called', handleItemCalled);
    });

    return () => {
      unsubscribe();
    };
  });

  onDestroy(() => {
    // Cleanup handled by subscription
  });

  function getPlayerName(playerId: string): string {
    const player = $players.find((p) => p.id === playerId);
    return player?.name || 'Unknown Player';
  }
</script>

{#if $gameState || currentState === GameState.ROUND_END || currentState === GameState.PLAYING || currentState === GameState.STARTING}
  <div class="bingo-host-projection">
    <div class="bingo-main-section">
      <h2 class="game-title">🎰 Christmas Speed Bingo</h2>

      {#if currentState === GameState.ROUND_END}
        <!-- Round End: Show winners -->
        <div class="round-end-display">
          <div class="round-number">
            <div class="round-label-bilingual">
              <span class="round-label-french">Ronde {syncedRound}{#if syncedMaxRounds > 0} / {syncedMaxRounds}{/if} - Résultats</span>
              <span class="round-label-english">Round {syncedRound}{#if syncedMaxRounds > 0} / {syncedMaxRounds}{/if} - Results</span>
            </div>
          </div>

          {#if winners.length > 0}
            <div class="winners-section">
              <h3 class="winners-title">
                <div class="title-bilingual">
                  <span class="title-french">🏆 Gagnants</span>
                  <span class="title-english">🏆 Winners</span>
                </div>
              </h3>
              <div class="winners-list">
                {#each winners as winnerId}
                  {@const playerName = getPlayerName(winnerId)}
                  <div class="winner-card">
                    <span class="winner-name">{playerName}</span>
                    <span class="winner-icon">🎉</span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <div class="items-called-display">
            <div class="items-called-bilingual">
              <span class="items-called-french">{itemsCalled} articles appelés</span>
              <span class="items-called-english">{itemsCalled} items called</span>
            </div>
          </div>
        </div>
      {:else}
        <!-- STARTING/PLAYING: Show current item and called items -->
        <div class="playing-display">
          <div class="round-number">
            <div class="round-label-bilingual">
              <span class="round-label-french">Ronde {round}{#if maxRounds > 0} / {maxRounds}{/if}</span>
              <span class="round-label-english">Round {round}{#if maxRounds > 0} / {maxRounds}{/if}</span>
            </div>
          </div>

          {#if currentState === GameState.PLAYING}
            <div class="live-indicator">
              <span class="live-dot"></span>
              <span class="live-text-bilingual">
                <span class="live-text-french">EN DIRECT</span>
                <span class="live-text-english">LIVE</span>
              </span>
            </div>
          {/if}

          <!-- Current Item Display (Large, Animated) -->
          {#if currentItem}
            <div class="current-item-display-large" key={animationKey}>
              <div class="current-item-label-bilingual">
                <span class="current-item-label-french">Actuellement appelé:</span>
                <span class="current-item-label-english">Currently Calling:</span>
              </div>
              <div class="current-item-call-string-large">{currentItem.callString || `${currentItem.column}-${currentItem.number}`}</div>
              <div class="current-item-emoji-large">{currentItem.emoji}</div>
              <div class="current-item-name-large">{currentItem.name}</div>
              <div class="call-number">#{itemsCalled}</div>
            </div>
          {:else}
            <div class="waiting-display">
              <div class="waiting-bilingual">
                <span class="waiting-french">En attente du premier appel...</span>
                <span class="waiting-english">Waiting for first call...</span>
              </div>
            </div>
          {/if}

          <!-- Called Items List -->
          {#if calledItems.length > 0}
            <div class="called-items-section-large">
              <h3 class="called-items-title-bilingual">
                <span class="called-items-title-french">Articles appelés:</span>
                <span class="called-items-title-english">Called Items:</span>
              </h3>
              <div class="called-items-grid-large">
                {#each calledItems.slice(-20) as item}
                  <div class="called-item-large" class:current={currentItem?.id === item.id}>
                    <span class="called-item-call-string">{item.callString || `${item.column}-${item.number}`}</span>
                    <span class="called-item-emoji-large">{item.emoji}</span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <div class="bingo-leaderboard-section">
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
  .bingo-host-projection {
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

  .bingo-host-projection::before {
    content: '';
    position: absolute;
    inset: -2px;
    border-radius: 1rem;
    padding: 2px;
    background: linear-gradient(
      135deg,
      rgba(224, 242, 254, 0.3) 0%,
      rgba(173, 216, 230, 0.2) 25%,
      rgba(255, 255, 255, 0.1) 50%,
      rgba(173, 216, 230, 0.2) 75%,
      rgba(224, 242, 254, 0.3) 100%
    );
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    opacity: 0.6;
    pointer-events: none;
    animation: frost-shimmer 3s ease-in-out infinite;
  }

  @keyframes frost-shimmer {
    0%,
    100% {
      opacity: 0.4;
    }
    50% {
      opacity: 0.7;
    }
  }

  .bingo-main-section {
    display: flex;
    flex-direction: column;
    width: 100%;
  }

  .game-title {
    font-size: 2.5rem;
    font-weight: bold;
    color: #ffd700;
    text-align: center;
    margin-bottom: 1.5rem;
    text-shadow:
      0 0 15px rgba(255, 215, 0, 0.8),
      0 0 30px rgba(255, 215, 0, 0.5),
      2px 2px 8px rgba(0, 0, 0, 0.5);
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
    margin-bottom: 1.5rem;
  }

  .round-label-bilingual,
  .title-bilingual,
  .current-item-label-bilingual,
  .called-items-title-bilingual,
  .items-called-bilingual,
  .live-text-bilingual,
  .waiting-bilingual,
  .no-scores-bilingual {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .round-label-french,
  .title-french,
  .current-item-label-french,
  .called-items-title-french,
  .items-called-french,
  .live-text-french,
  .waiting-french,
  .no-scores-french {
    font-size: 1.5rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
  }

  .round-label-english,
  .title-english,
  .current-item-label-english,
  .called-items-title-english,
  .items-called-english,
  .live-text-english,
  .waiting-english,
  .no-scores-english {
    font-size: 2rem;
    font-weight: bold;
    color: #ffd700;
  }

  .live-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: rgba(255, 0, 0, 0.2);
    border: 2px solid #ff0000;
    border-radius: 9999px;
    margin-bottom: 1.5rem;
  }

  .live-dot {
    width: 12px;
    height: 12px;
    background: #ff0000;
    border-radius: 50%;
    animation: pulse-live 1s ease-in-out infinite;
  }

  @keyframes pulse-live {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.5;
      transform: scale(1.2);
    }
  }

  .live-text-french,
  .live-text-english {
    font-size: 1.25rem;
    font-weight: bold;
    color: #ff0000;
  }

  .current-item-display-large {
    text-align: center;
    padding: 3rem 2rem;
    background: linear-gradient(135deg, rgba(255, 215, 0, 0.2), rgba(224, 242, 254, 0.15));
    border: 4px solid #ffd700;
    border-radius: 1rem;
    margin-bottom: 2rem;
    animation: item-entrance 0.5s ease;
    box-shadow:
      0 0 30px rgba(255, 215, 0, 0.4),
      inset 0 0 40px rgba(255, 215, 0, 0.1);
  }

  @keyframes item-entrance {
    0% {
      transform: scale(0.8);
      opacity: 0;
    }
    50% {
      transform: scale(1.05);
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }

  .current-item-label-bilingual {
    margin-bottom: 1rem;
  }

  .current-item-label-french,
  .current-item-label-english {
    font-size: 1.5rem;
    color: rgba(255, 255, 255, 0.9);
  }

  .current-item-call-string-large {
    font-size: 5rem;
    font-weight: bold;
    color: #ffd700;
    margin: 1rem 0;
    text-shadow:
      0 0 20px rgba(255, 215, 0, 0.8),
      0 0 40px rgba(255, 215, 0, 0.5),
      2px 2px 8px rgba(0, 0, 0, 0.5);
    animation: emoji-bounce 0.6s ease;
    letter-spacing: 0.1em;
  }

  .current-item-emoji-large {
    font-size: 8rem;
    line-height: 1;
    margin: 1rem 0;
    filter: drop-shadow(0 0 20px rgba(255, 215, 0, 0.6));
    animation: emoji-bounce 0.6s ease;
  }

  @keyframes emoji-bounce {
    0% {
      transform: scale(0) rotate(-180deg);
    }
    50% {
      transform: scale(1.2) rotate(0deg);
    }
    100% {
      transform: scale(1) rotate(0deg);
    }
  }

  .current-item-name-large {
    font-size: 2.5rem;
    font-weight: bold;
    color: #ffd700;
    margin-top: 1rem;
    text-shadow: 0 0 15px rgba(255, 215, 0, 0.8);
  }

  .call-number {
    font-size: 1.5rem;
    color: rgba(255, 255, 255, 0.7);
    margin-top: 1rem;
  }

  .waiting-display {
    text-align: center;
    padding: 3rem;
    background: rgba(255, 255, 255, 0.1);
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-radius: 1rem;
    margin-bottom: 2rem;
  }

  .waiting-french,
  .waiting-english {
    font-size: 1.5rem;
    color: rgba(255, 255, 255, 0.8);
  }

  .called-items-section-large {
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(224, 242, 254, 0.05));
    border: 2px solid rgba(224, 242, 254, 0.3);
    border-radius: 0.75rem;
    padding: 1.5rem;
  }

  .called-items-title-bilingual {
    margin-bottom: 1rem;
  }

  .called-items-title-french,
  .called-items-title-english {
    font-size: 1.5rem;
    font-weight: bold;
    color: #ffd700;
  }

  .called-items-grid-large {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 0.75rem;
  }

  .called-item-large {
    aspect-ratio: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.1);
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-radius: 0.5rem;
    font-size: 2.5rem;
    transition: all 0.3s;
    opacity: 0.7;
    gap: 0.25rem;
    padding: 0.5rem;
  }

  .called-item-call-string {
    font-size: 1rem;
    font-weight: bold;
    color: #ffd700;
    line-height: 1;
  }

  .called-item-emoji-large {
    font-size: 3rem;
  }

  .called-item-large.current {
    opacity: 1;
    background: rgba(255, 215, 0, 0.3);
    border-color: #ffd700;
    transform: scale(1.1);
    animation: item-highlight 1s ease-in-out infinite;
  }

  @keyframes item-highlight {
    0%,
    100% {
      box-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
    }
    50% {
      box-shadow: 0 0 20px rgba(255, 215, 0, 0.8);
    }
  }

  .round-end-display {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .winners-section {
    background: linear-gradient(135deg, rgba(255, 215, 0, 0.2), rgba(224, 242, 254, 0.1));
    border: 2px solid rgba(255, 215, 0, 0.6);
    border-radius: 1rem;
    padding: 2rem;
  }

  .winners-title {
    margin-bottom: 1.5rem;
  }

  .winners-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .winner-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem;
    background: rgba(255, 215, 0, 0.2);
    border: 2px solid #ffd700;
    border-radius: 0.75rem;
  }

  .winner-name {
    font-size: 1.75rem;
    font-weight: bold;
    color: #ffd700;
  }

  .winner-icon {
    font-size: 2rem;
    animation: celebration 0.5s ease;
  }

  @keyframes celebration {
    0%,
    100% {
      transform: rotate(0deg) scale(1);
    }
    25% {
      transform: rotate(-10deg) scale(1.1);
    }
    75% {
      transform: rotate(10deg) scale(1.1);
    }
  }

  .items-called-display {
    text-align: center;
    padding: 1rem;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 0.75rem;
  }

  .bingo-leaderboard-section {
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
  }

  .leaderboard-title-large {
    font-size: 2rem;
    font-weight: bold;
    color: #ffd700;
    text-align: center;
    margin-bottom: 1rem;
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
  }

  .leaderboard-entry-large.top-three {
    background: linear-gradient(90deg, rgba(255, 215, 0, 0.2), rgba(255, 215, 0, 0.05));
    border-color: rgba(255, 215, 0, 0.5);
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
  }

  @media (max-width: 1400px) {
    .bingo-host-projection {
      grid-template-columns: 1fr 350px;
      gap: 2rem;
    }
  }

  @media (max-width: 1024px) {
    .bingo-host-projection {
      grid-template-columns: 1fr;
      gap: 2rem;
    }

    .bingo-leaderboard-section {
      max-height: 400px;
    }
  }

  @media (max-width: 768px) {
    .current-item-emoji-large {
      font-size: 5rem;
    }

    .current-item-name-large {
      font-size: 1.75rem;
    }
  }
</style>

