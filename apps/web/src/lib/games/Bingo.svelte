<script lang="ts">
  import { socket, gameState } from '$lib/socket';
  import { GameState, GameType } from '@christmas/core';
  import { onMount, onDestroy } from 'svelte';
  import { playSound } from '$lib/audio';
  import { t } from '$lib/i18n';
  import PlayerRulesModal from '$lib/components/PlayerRulesModal.svelte';
  import ChristmasLoading from '$lib/components/ChristmasLoading.svelte';
  import { get } from 'svelte/store';
  import { page } from '$app/stores';
  import { hasDismissedRules, dismissRules } from '$lib/utils/rules-modal-storage';
  import type { BingoItem, BingoCard } from '@christmas/core';

  $: playerCard = $gameState?.playerCard as BingoCard | null;
  $: markedCells = $gameState?.markedCells as boolean[][] | null;
  $: calledItems = $gameState?.calledItems as BingoItem[] || [];
  $: currentItem = $gameState?.currentItem as BingoItem | null;
  $: completedLines = $gameState?.completedLines as string[] || [];
  $: hasWon = $gameState?.hasWon || false;
  $: state = $gameState?.state;
  $: round = $gameState?.round;
  $: maxRounds = $gameState?.maxRounds;
  $: scoreboard = $gameState?.scoreboard || [];

  // Debug logging
  $: if (import.meta.env.DEV && $gameState?.gameType === 'bingo') {
    console.log('[Bingo Component] Game state:', {
      hasGameState: !!$gameState,
      gameType: $gameState?.gameType,
      state: $gameState?.state,
      hasPlayerCard: !!playerCard,
      hasMarkedCells: !!markedCells,
      calledItemsCount: calledItems?.length || 0,
      hasCurrentItem: !!currentItem,
      playerCardKeys: playerCard ? Object.keys(playerCard) : null,
      markedCellsType: typeof markedCells,
      gameStateKeys: $gameState ? Object.keys($gameState) : null
    });
  }

  let showRulesModal = false;
  let rulesShownForGameType: GameType | null = null;
  let previousState: GameState | null | undefined = undefined;

  // Watch gameState store directly to catch all state changes
  $: currentState = $gameState?.state;
  $: currentGameType = $gameState?.gameType;
  $: roomCode = $page.params.code;
  
  // Helper to check if game type is BINGO (handles undefined GameType.BINGO)
  function isBingoType(gt: GameType | string | null | undefined): boolean {
    return gt === GameType.BINGO || gt === 'bingo';
  }
  
  // Get GameType.BINGO with fallback
  $: bingoGameType = GameType.BINGO || 'bingo';
  
  // Show rules modal when game starts - only on game start, not on round transitions
  $: {
    const state = currentState;
    const gameType = currentGameType;

    if (import.meta.env.DEV) {
      console.log('[Bingo] Modal check:', {
        state,
        gameType,
        currentGameType,
        bingoGameType,
        isBingoType: isBingoType(gameType),
        rulesShownForGameType,
        showRulesModal,
        previousState,
        isStartingOrPlaying: state === GameState.STARTING || state === GameState.PLAYING
      });
    }

    if (state !== undefined && state !== null && gameType && roomCode) {
      const isStartingOrPlaying =
        state === GameState.STARTING || state === GameState.PLAYING;

      // Only show modal when transitioning from LOBBY to STARTING/PLAYING (game start)
      // NOT when transitioning from ROUND_END to STARTING/PLAYING (round transition)
      const isGameStart = 
        previousState === GameState.LOBBY || 
        previousState === undefined || 
        previousState === null;

      // Show modal only if:
      // 1. State is STARTING/PLAYING
      // 2. This is a game start (not a round transition)
      // 3. We haven't shown it for this gameType yet (in memory)
      // 4. Rules haven't been dismissed (in sessionStorage)
      // 5. Game type is BINGO
      if (isStartingOrPlaying && 
          isGameStart && 
          rulesShownForGameType !== gameType && 
          !hasDismissedRules(roomCode, gameType) &&
          !showRulesModal && 
          isBingoType(gameType)) {
        console.log('[Bingo] Showing rules modal for gameType:', gameType);
        showRulesModal = true;
        rulesShownForGameType = gameType;
      }

      if (state === GameState.LOBBY || state === GameState.GAME_END) {
        showRulesModal = false;
        rulesShownForGameType = null;
      }

      if (state !== previousState) {
        previousState = state;
      }
    }
  }

  function closeRulesModal() {
    if (roomCode && currentGameType) {
      dismissRules(roomCode, currentGameType);
    }
    showRulesModal = false;
  }

  function markCell(row: number, col: number) {
    if (state !== GameState.PLAYING || !markedCells || markedCells[row][col]) {
      return;
    }

    // Check if the item at this position has been called
    if (!playerCard || !playerCard.grid[row][col]) {
      // Center cell is free, allow marking
      if (row === 2 && col === 2) {
        // Already marked by default, do nothing
        return;
      }
      return;
    }

    const cellItem = playerCard.grid[row][col];
    const isCalled = calledItems.some((item) => item.id === cellItem.id);

    if (!isCalled && !(row === 2 && col === 2)) {
      // Item not called yet and not center cell
      return;
    }

    $socket.emit('bingo_mark', row, col);
    playSound('click');
  }

  function isItemCalled(item: BingoItem | null): boolean {
    if (!item) return false;
    return calledItems.some((called) => called.id === item.id);
  }

  // Listen for item called events
  onMount(() => {
    const unsubscribe = socket.subscribe((s) => {
      if (!s) return;

      s.on('bingo_item_called', (item: BingoItem, callNumber: number) => {
        playSound('click');
      });

      s.on('bingo_line_completed', (playerId: string, lineType: string, points: number) => {
        if (playerId === s.id) {
          playSound('correct');
        }
      });
    });

    return () => {
      unsubscribe();
    };
  });

  onDestroy(() => {
    // Cleanup is handled by socket subscription
  });
</script>

<PlayerRulesModal gameType={isBingoType(currentGameType) ? (currentGameType || bingoGameType) : bingoGameType} show={showRulesModal} onClose={closeRulesModal} />

<div class="bingo-container">
  {#if !state}
    <div class="loading-overlay">
      <ChristmasLoading message={t('games.bingo.loading')} size="large" />
    </div>
  {:else if state === GameState.STARTING}
    <div class="countdown-overlay">
      <div class="text-8xl mb-4">🎰</div>
      <h1 class="text-4xl font-bold">{t('games.bingo.getReady')}</h1>
      <p class="text-xl text-white/70 mt-2">{t('games.naughtyOrNice.startingSoon')}</p>
    </div>
  {:else if state === GameState.PLAYING}
    {#if playerCard && markedCells}
      <div class="bingo-card-container">
        <div class="round-badge">{t('games.bingo.round', { round, maxRounds })}</div>

        <!-- Called Items Display -->
        <div class="called-items-section">
          <h3 class="called-items-title">{t('games.bingo.calledItems')}</h3>
          <div class="called-items-list">
            {#each calledItems.slice(-8) as item}
              <div class="called-item" class:current={currentItem?.id === item.id}>
                <span class="called-item-call-string">{item.callString || `${item.column}-${item.number}`}</span>
                <span class="called-item-emoji">{item.emoji}</span>
              </div>
            {/each}
          </div>
        </div>

        <!-- Current Item Display -->
        {#if currentItem}
          <div class="current-item-display">
            <p class="current-item-label">{t('games.bingo.currentlyCalling')}</p>
            <div class="current-item-call-string">{currentItem.callString || `${currentItem.column}-${currentItem.number}`}</div>
            <div class="current-item-emoji">{currentItem.emoji}</div>
            <p class="current-item-name">{currentItem.name}</p>
          </div>
        {/if}

        <!-- Bingo Card Grid -->
        <div class="bingo-card-wrapper">
          <!-- Column Headers -->
          <div class="bingo-column-headers">
            {#each ['B', 'I', 'N', 'G', 'O'] as letter}
              <div class="column-header">{letter}</div>
            {/each}
          </div>
          
          <div class="bingo-grid">
            {#each playerCard.grid as row, rowIndex}
              {#each row as cell, colIndex}
              {@const isMarked = markedCells[rowIndex][colIndex]}
              {@const isCenter = rowIndex === 2 && colIndex === 2}
              {@const canMark = isItemCalled(cell) || isCenter}
              {@const isDisabled = state !== GameState.PLAYING || !canMark || isMarked}
              
              <button
                on:click={() => markCell(rowIndex, colIndex)}
                disabled={isDisabled}
                class="bingo-cell"
                class:marked={isMarked}
                class:center={isCenter}
                class:disabled={isDisabled && !isMarked}
              >
                {#if isCenter}
                  <span class="free-text">{t('games.bingo.free')}</span>
                {:else if cell}
                  <span class="cell-number">{cell.number}</span>
                  <span class="cell-emoji">{cell.emoji}</span>
                {/if}
                {#if isMarked}
                  <span class="checkmark">✓</span>
                {/if}
              </button>
              {/each}
            {/each}
          </div>
        </div>

        {#if hasWon}
          <div class="win-message">
            <div class="text-4xl mb-2">🎉</div>
            <h2 class="text-2xl font-bold">{t('games.bingo.lineComplete')}</h2>
            <p class="text-white/70 mt-2">{t('games.bingo.waitingForOthers')}</p>
          </div>
        {/if}
      </div>
    {:else}
      <div class="loading-overlay">
        <ChristmasLoading message={t('games.bingo.loading')} size="large" />
      </div>
    {/if}
  {:else if state === GameState.ROUND_END}
    <div class="result-card">
      <div class="text-6xl mb-4">🎰</div>
      <h2 class="text-2xl font-bold mb-4">{t('games.bingo.roundResults')}</h2>

      {#if hasWon}
        <div class="win-announcement">
          <div class="text-5xl mb-2">🎉</div>
          <p class="text-xl">{t('games.bingo.youWon')}</p>
        </div>
      {/if}

      {#if completedLines.length > 0}
        <div class="completed-lines">
          <p class="text-lg font-bold mb-2">{t('games.bingo.completedLines')}</p>
          {#each completedLines as lineType}
            <div class="line-type-badge">
              {t(`games.bingo.lineTypes.${lineType}`, { defaultValue: lineType })}
            </div>
          {/each}
        </div>
      {/if}

      <!-- Leaderboard -->
      <div class="scoreboard-mini">
        <h3 class="text-lg font-bold mb-2">📊 {t('games.bingo.leaderboard')}</h3>
        {#each scoreboard.slice(0, 10) as player, i}
          <div class="score-row">
            <span class="rank">#{i + 1}</span>
            <span class="name">{player.name}</span>
            <span class="score">{player.score}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .bingo-container {
    min-height: 100%;
    height: auto;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-y;
  }

  .loading-overlay,
  .countdown-overlay {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
  }

  .bingo-card-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: 100%;
    padding: 1rem;
    padding-bottom: 2rem;
  }

  .round-badge {
    background: linear-gradient(
      135deg,
      rgba(196, 30, 58, 0.25) 0%,
      rgba(255, 215, 0, 0.2) 50%,
      rgba(15, 134, 68, 0.25) 100%
    );
    border: 2px solid var(--christmas-gold);
    padding: 0.5rem 1rem;
    border-radius: 9999px;
    font-weight: bold;
    font-size: clamp(0.875rem, 3vw, 1rem);
    text-align: center;
    width: fit-content;
    margin: 0 auto;
    backdrop-filter: blur(10px);
    position: relative;
    color: var(--christmas-gold);
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
    box-shadow: 
      0 2px 8px rgba(0, 0, 0, 0.3),
      0 0 15px rgba(255, 215, 0, 0.3);
  }

  .called-items-section {
    background: linear-gradient(
      135deg,
      rgba(255, 255, 255, 0.12) 0%,
      rgba(176, 224, 230, 0.08) 50%,
      rgba(255, 255, 255, 0.12) 100%
    );
    border: 2px solid rgba(255, 215, 0, 0.4);
    border-radius: 0.75rem;
    padding: 0.75rem;
    box-shadow: 
      0 2px 10px rgba(0, 0, 0, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.2);
    backdrop-filter: blur(10px);
  }

  .called-items-title {
    font-size: 0.875rem;
    font-weight: bold;
    margin-bottom: 0.5rem;
    text-align: center;
    color: rgba(255, 255, 255, 0.9);
  }

  .called-items-list {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    justify-content: center;
  }

  .called-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    font-size: 1.5rem;
    padding: 0.25rem;
    opacity: 0.6;
    transition: all 0.3s;
    gap: 0.25rem;
  }

  .called-item-call-string {
    font-size: 0.75rem;
    font-weight: bold;
    color: #ffd700;
    line-height: 1;
  }

  .called-item.current {
    opacity: 1;
    transform: scale(1.2);
    animation: pulse 1s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      transform: scale(1.2);
    }
    50% {
      transform: scale(1.3);
    }
  }

  .current-item-display {
    text-align: center;
    padding: 1rem;
    background: linear-gradient(
      135deg,
      rgba(255, 215, 0, 0.25) 0%,
      rgba(196, 30, 58, 0.15) 50%,
      rgba(15, 134, 68, 0.15) 50%,
      rgba(255, 215, 0, 0.25) 100%
    );
    border: 3px solid var(--christmas-gold);
    border-radius: 0.75rem;
    box-shadow: 
      0 4px 20px rgba(255, 215, 0, 0.4),
      0 0 30px rgba(255, 215, 0, 0.3),
      inset 0 2px 4px rgba(255, 255, 255, 0.2);
    position: relative;
    overflow: hidden;
  }

  .current-item-display::before {
    content: '✨';
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    font-size: 1.5rem;
    opacity: 0.3;
    animation: twinkle 2s ease-in-out infinite;
  }

  .current-item-display::after {
    content: '✨';
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    font-size: 1.5rem;
    opacity: 0.3;
    animation: twinkle 2s ease-in-out infinite 1s;
  }

  @keyframes twinkle {
    0%, 100% {
      opacity: 0.2;
      transform: scale(0.8);
    }
    50% {
      opacity: 0.5;
      transform: scale(1.2);
    }
  }

  .current-item-label {
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.8);
    margin-bottom: 0.5rem;
  }

  .current-item-call-string {
    font-size: 2rem;
    font-weight: bold;
    color: #ffd700;
    margin: 0.5rem 0;
    animation: bounce 0.5s ease;
  }

  .current-item-emoji {
    font-size: 3rem;
    margin: 0.5rem 0;
    animation: bounce 0.5s ease;
  }

  @keyframes bounce {
    0% {
      transform: scale(0);
    }
    50% {
      transform: scale(1.2);
    }
    100% {
      transform: scale(1);
    }
  }

  .current-item-name {
    font-size: 1rem;
    font-weight: bold;
    color: #ffd700;
  }

  .bingo-card-wrapper {
    width: 100%;
    display: flex;
    flex-direction: column;
  }

  .bingo-column-headers {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0.375rem;
    width: 100%;
    margin-bottom: 0.5rem;
    padding: 0 0.5rem;
    box-sizing: border-box;
  }

  .column-header {
    text-align: center;
    font-size: clamp(1rem, 4vw, 1.5rem);
    font-weight: bold;
    color: var(--christmas-gold);
    background: linear-gradient(
      135deg,
      rgba(196, 30, 58, 0.25) 0%,
      rgba(255, 215, 0, 0.2) 50%,
      rgba(15, 134, 68, 0.25) 100%
    );
    border: 2px solid var(--christmas-gold);
    border-radius: 0.5rem;
    padding: 0.5rem 0.25rem;
    box-shadow: 
      0 2px 8px rgba(0, 0, 0, 0.3),
      0 0 15px rgba(255, 215, 0, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.2);
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
    position: relative;
    overflow: hidden;
  }

  .column-header::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.3),
      transparent
    );
    animation: shimmer 3s ease-in-out infinite;
  }

  @keyframes shimmer {
    0% {
      left: -100%;
    }
    100% {
      left: 100%;
    }
  }

  .bingo-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0.375rem;
    width: 100%;
    max-width: 100%;
    margin: 0 auto;
    padding: 0.5rem;
    background: linear-gradient(
      135deg,
      rgba(196, 30, 58, 0.1) 0%,
      rgba(15, 134, 68, 0.1) 50%,
      rgba(196, 30, 58, 0.1) 100%
    );
    border-radius: 1rem;
    border: 3px solid var(--christmas-gold);
    box-shadow: 
      0 4px 20px rgba(0, 0, 0, 0.4),
      0 0 30px rgba(255, 215, 0, 0.3),
      inset 0 2px 4px rgba(255, 255, 255, 0.1);
    position: relative;
    box-sizing: border-box;
  }

  .bingo-grid::before {
    content: '';
    position: absolute;
    top: -3px;
    left: -3px;
    right: -3px;
    bottom: -3px;
    background: repeating-linear-gradient(
      45deg,
      var(--christmas-red) 0px,
      var(--christmas-red) 4px,
      var(--christmas-gold) 4px,
      var(--christmas-gold) 8px,
      var(--christmas-green) 8px,
      var(--christmas-green) 12px,
      var(--christmas-gold) 12px,
      var(--christmas-gold) 16px
    );
    border-radius: 1rem;
    z-index: -1;
    opacity: 0.6;
    animation: borderRotate 4s linear infinite;
  }

  @keyframes borderRotate {
    0% {
      background-position: 0 0;
    }
    100% {
      background-position: 16px 16px;
    }
  }

  .bingo-cell {
    aspect-ratio: 1;
    min-height: clamp(55px, 15vw, 75px);
    background: linear-gradient(
      135deg,
      rgba(255, 255, 255, 0.15) 0%,
      rgba(176, 224, 230, 0.1) 50%,
      rgba(255, 255, 255, 0.15) 100%
    );
    backdrop-filter: blur(8px);
    border: 2px solid rgba(255, 255, 255, 0.4);
    border-radius: 0.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    touch-action: manipulation;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    font-size: clamp(1rem, 3.5vw, 1.5rem);
    padding: 0.25rem;
    gap: 0.125rem;
    box-shadow: 
      0 2px 8px rgba(0, 0, 0, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.2);
  }

  .bingo-cell::after {
    content: '';
    position: absolute;
    inset: -2px;
    border-radius: 0.5rem;
    padding: 2px;
    background: linear-gradient(
      135deg,
      var(--christmas-red),
      var(--christmas-gold),
      var(--christmas-green),
      var(--christmas-gold),
      var(--christmas-red)
    );
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    opacity: 0;
    transition: opacity 0.3s;
    z-index: -1;
  }

  .cell-number {
    font-size: clamp(0.625rem, 2vw, 0.75rem);
    font-weight: bold;
    color: rgba(255, 255, 255, 0.9);
    line-height: 1;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  }

  .bingo-cell:active:not(:disabled),
  .bingo-cell:hover:not(:disabled) {
    transform: scale(0.96);
    background: linear-gradient(
      135deg,
      rgba(255, 255, 255, 0.25) 0%,
      rgba(176, 224, 230, 0.2) 50%,
      rgba(255, 255, 255, 0.25) 100%
    );
    border-color: var(--christmas-gold);
    box-shadow: 
      0 4px 12px rgba(0, 0, 0, 0.3),
      0 0 20px rgba(255, 215, 0, 0.4),
      inset 0 1px 0 rgba(255, 255, 255, 0.3);
  }

  .bingo-cell:active:not(:disabled)::after,
  .bingo-cell:hover:not(:disabled)::after {
    opacity: 0.3;
  }

  .bingo-cell.marked {
    background: linear-gradient(
      135deg,
      rgba(255, 215, 0, 0.4) 0%,
      rgba(15, 134, 68, 0.3) 50%,
      rgba(255, 215, 0, 0.4) 100%
    );
    border-color: var(--christmas-gold);
    box-shadow: 
      0 4px 15px rgba(255, 215, 0, 0.5),
      0 0 25px rgba(15, 134, 68, 0.4),
      inset 0 2px 4px rgba(255, 255, 255, 0.3);
    animation: markedPulse 2s ease-in-out infinite;
  }

  @keyframes markedPulse {
    0%, 100% {
      box-shadow: 
        0 4px 15px rgba(255, 215, 0, 0.5),
        0 0 25px rgba(15, 134, 68, 0.4),
        inset 0 2px 4px rgba(255, 255, 255, 0.3);
    }
    50% {
      box-shadow: 
        0 4px 20px rgba(255, 215, 0, 0.7),
        0 0 35px rgba(15, 134, 68, 0.6),
        inset 0 2px 4px rgba(255, 255, 255, 0.4);
    }
  }

  .bingo-cell.center {
    background: linear-gradient(
      135deg,
      rgba(255, 215, 0, 0.3) 0%,
      rgba(196, 30, 58, 0.2) 50%,
      rgba(15, 134, 68, 0.2) 50%,
      rgba(255, 215, 0, 0.3) 100%
    );
    border: 3px solid var(--christmas-gold);
    box-shadow: 
      0 4px 20px rgba(255, 215, 0, 0.6),
      0 0 30px rgba(255, 215, 0, 0.4),
      inset 0 2px 4px rgba(255, 255, 255, 0.3);
    position: relative;
  }

  .bingo-cell.center::before {
    content: '✨';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 1.5em;
    opacity: 0.3;
    animation: sparkle 2s ease-in-out infinite;
  }

  @keyframes sparkle {
    0%, 100% {
      opacity: 0.2;
      transform: translate(-50%, -50%) scale(0.8);
    }
    50% {
      opacity: 0.5;
      transform: translate(-50%, -50%) scale(1.1);
    }
  }

  .bingo-cell.disabled:not(.marked):not(.center) {
    opacity: 0.4;
    cursor: not-allowed;
    background: rgba(0, 0, 0, 0.2);
  }

  .cell-emoji {
    font-size: clamp(1.25rem, 4vw, 1.75rem);
    line-height: 1;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
    transition: transform 0.2s;
  }

  .bingo-cell:active:not(:disabled) .cell-emoji {
    transform: scale(1.1);
  }

  .free-text {
    font-size: clamp(0.625rem, 2.5vw, 0.875rem);
    font-weight: bold;
    color: var(--christmas-gold);
    text-transform: uppercase;
    text-shadow: 
      0 2px 4px rgba(0, 0, 0, 0.5),
      0 0 10px rgba(255, 215, 0, 0.5);
    letter-spacing: 0.1em;
    position: relative;
    z-index: 1;
  }

  .checkmark {
    position: absolute;
    top: 0.125rem;
    right: 0.125rem;
    font-size: clamp(0.875rem, 3vw, 1.125rem);
    color: var(--christmas-green);
    font-weight: bold;
    text-shadow: 
      0 0 10px rgba(15, 134, 68, 0.8),
      0 2px 4px rgba(0, 0, 0, 0.5);
    background: rgba(15, 134, 68, 0.3);
    border-radius: 50%;
    width: 1.5em;
    height: 1.5em;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(15, 134, 68, 0.5);
    animation: checkmarkPop 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
  }

  @keyframes checkmarkPop {
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

  .win-message {
    text-align: center;
    padding: 1.5rem;
    background: rgba(255, 215, 0, 0.2);
    border: 2px solid #ffd700;
    border-radius: 0.75rem;
    animation: celebration 0.5s ease;
  }

  @keyframes celebration {
    0% {
      transform: scale(0.8);
      opacity: 0;
    }
    50% {
      transform: scale(1.1);
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }

  .result-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 1.5rem;
    width: 100%;
    overflow-y: auto;
  }

  .win-announcement {
    padding: 1rem;
    background: rgba(255, 215, 0, 0.2);
    border: 2px solid #ffd700;
    border-radius: 0.75rem;
    margin: 1rem 0;
  }

  .completed-lines {
    margin: 1rem 0;
  }

  .line-type-badge {
    display: inline-block;
    padding: 0.5rem 1rem;
    margin: 0.25rem;
    background: rgba(255, 215, 0, 0.2);
    border: 1px solid #ffd700;
    border-radius: 9999px;
    font-size: 0.875rem;
  }

  .scoreboard-mini {
    width: 100%;
    max-width: 500px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 1rem;
    padding: 1rem;
    margin-top: 1rem;
  }

  .score-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    margin-bottom: 0.5rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 0.5rem;
  }

  .rank {
    font-weight: bold;
    width: 3rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .name {
    flex: 1;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin: 0 0.5rem;
  }

  .score {
    font-weight: bold;
    color: #ffd700;
    min-width: 4rem;
    text-align: right;
  }

  /* Mobile-first responsive design */
  @media (max-width: 640px) {
    .bingo-card-container {
      padding: 0.75rem;
      gap: 0.75rem;
    }

    .round-badge {
      font-size: 0.875rem;
      padding: 0.375rem 0.75rem;
    }

    .called-items-section {
      padding: 0.5rem;
      border-radius: 0.5rem;
    }

    .called-items-title {
      font-size: 0.75rem;
      margin-bottom: 0.375rem;
    }

    .called-items-list {
      gap: 0.375rem;
    }

    .called-item {
      font-size: 1.25rem;
      padding: 0.125rem;
    }

    .called-item-call-string {
      font-size: 0.625rem;
    }

    .current-item-display {
      padding: 0.75rem;
      border-radius: 0.5rem;
    }

    .current-item-label {
      font-size: 0.75rem;
      margin-bottom: 0.375rem;
    }

    .current-item-call-string {
      font-size: 1.5rem;
      margin: 0.375rem 0;
    }

    .current-item-emoji {
      font-size: 2.5rem;
      margin: 0.375rem 0;
    }

    .current-item-name {
      font-size: 0.875rem;
    }

    .bingo-column-headers {
      gap: 0.25rem;
      margin-bottom: 0.375rem;
      padding: 0 0.375rem;
    }

    .column-header {
      padding: 0.375rem 0.125rem;
      font-size: 1rem;
    }

    .bingo-grid {
      gap: 0.25rem;
      padding: 0.375rem;
      border-width: 2px;
    }

    .bingo-cell {
      padding: 0.125rem;
      gap: 0.0625rem;
    }

    .checkmark {
      top: 0.0625rem;
      right: 0.0625rem;
      width: 1.25em;
      height: 1.25em;
    }
  }

  /* Tablet and larger screens */
  @media (min-width: 641px) {
    .bingo-card-container {
      max-width: 600px;
      margin: 0 auto;
    }

    .bingo-grid {
      max-width: 500px;
      margin: 0 auto;
    }
  }

  /* Large screens */
  @media (min-width: 1024px) {
    .bingo-card-container {
      max-width: 700px;
    }

    .bingo-grid {
      max-width: 600px;
      padding: 0.75rem;
      gap: 0.5rem;
    }

    .bingo-cell {
      min-height: 80px;
    }
  }
</style>

