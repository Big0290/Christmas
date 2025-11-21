<script lang="ts">
  import { gameState } from '$lib/socket';
  import { GameType, GameState } from '@christmas/core';
  import { normalizeGameType } from '$lib/utils/game-state';
  import HostTriviaDisplay from './HostTriviaDisplay.svelte';
  import HostEmojiCarolDisplay from './HostEmojiCarolDisplay.svelte';
  import HostNaughtyOrNiceDisplay from './HostNaughtyOrNiceDisplay.svelte';
  import HostPriceIsRightDisplay from './HostPriceIsRightDisplay.svelte';
  import HostBingoDisplay from './HostBingoDisplay.svelte';

  export let currentGameType: GameType | null;
  export let currentState: GameState | null | undefined;
  export let round: number;
  export let maxRounds: number;
  export let scoreboard: any[] = [];

  // Normalize gameType to handle both enum and string values
  $: normalizedGameType = normalizeGameType(currentGameType) || normalizeGameType($gameState?.gameType);
  
  // Round synchronization: use gameState as source of truth, fallback to prop if gameState not available (ensures sync with players)
  $: syncedRound = $gameState?.round ?? round ?? 0;
  $: syncedMaxRounds = $gameState?.maxRounds ?? maxRounds ?? 0;

  // Helper to check if game type is BINGO (handles undefined GameType.BINGO)
  function isBingo(gt: GameType | string | null | undefined): boolean {
    return gt === GameType.BINGO || gt === 'bingo';
  }

  // Helper to check if game-specific data exists in gameState store
  $: hasGameData = {
    trivia: !!$gameState?.currentQuestion,
    emoji: !!$gameState?.availableEmojis,
    naughty: !!$gameState?.currentPrompt,
    price: !!$gameState?.currentItem,
    bingo: !!($gameState?.playerCard || $gameState?.currentCard || $gameState?.calledItems || $gameState?.playerCards)
  };
  
  // Check if we're in an active game state (including PAUSED for display purposes)
  $: isActiveGameState = currentState === GameState.PLAYING || 
                          currentState === GameState.STARTING || 
                          currentState === GameState.ROUND_END ||
                          currentState === GameState.PAUSED;
  
  // Debug logging for rendering
  $: if (import.meta.env.DEV) {
    const shouldShowPrice = (normalizedGameType === GameType.PRICE_IS_RIGHT || currentGameType === GameType.PRICE_IS_RIGHT) && (isActiveGameState || $gameState?.currentItem);
    const shouldShowNaughty = (normalizedGameType === GameType.NAUGHTY_OR_NICE || currentGameType === GameType.NAUGHTY_OR_NICE) && (isActiveGameState || $gameState?.currentPrompt);
    
    console.log('[HostGameDisplay] 🔵 Render check:', {
      currentGameType,
      normalizedGameType,
      currentState,
      isActiveGameState,
      hasGameState: !!$gameState,
      gameStateGameType: $gameState?.gameType,
      gameData: hasGameData,
      isBingoGame: isBingo(currentGameType) || isBingo(normalizedGameType) || isBingo($gameState?.gameType),
      shouldShowTrivia: (normalizedGameType === GameType.TRIVIA_ROYALE || currentGameType === GameType.TRIVIA_ROYALE) && (isActiveGameState || $gameState?.currentQuestion),
      shouldShowEmoji: (normalizedGameType === GameType.EMOJI_CAROL || currentGameType === GameType.EMOJI_CAROL) && (isActiveGameState || $gameState?.availableEmojis),
      shouldShowNaughty,
      shouldShowPrice,
      questionText: $gameState?.currentQuestion?.question || 'N/A'
    });
    
    // Warn if we're in active game state but missing game data
    if (isActiveGameState && normalizedGameType && !hasGameData.trivia && !hasGameData.emoji && !hasGameData.naughty && !hasGameData.price && !hasGameData.bingo) {
      console.warn('[HostGameDisplay] ⚠️ Active game state but no game-specific data found:', {
        gameType: normalizedGameType,
        state: currentState,
        gameState: $gameState
      });
    }
  }
</script>

{#if (normalizedGameType === GameType.TRIVIA_ROYALE || currentGameType === GameType.TRIVIA_ROYALE) && (isActiveGameState || $gameState?.currentQuestion)}
  <HostTriviaDisplay {currentState} round={syncedRound} maxRounds={syncedMaxRounds} {scoreboard} />
{:else if (normalizedGameType === GameType.EMOJI_CAROL || currentGameType === GameType.EMOJI_CAROL) && (isActiveGameState || $gameState?.availableEmojis)}
  <HostEmojiCarolDisplay {currentState} round={syncedRound} maxRounds={syncedMaxRounds} {scoreboard} />
{:else if (normalizedGameType === GameType.NAUGHTY_OR_NICE || currentGameType === GameType.NAUGHTY_OR_NICE) && (isActiveGameState || $gameState?.currentPrompt)}
  <HostNaughtyOrNiceDisplay {currentState} round={syncedRound} maxRounds={syncedMaxRounds} {scoreboard} />
{:else if (normalizedGameType === GameType.PRICE_IS_RIGHT || currentGameType === GameType.PRICE_IS_RIGHT) && (isActiveGameState || $gameState?.currentItem)}
  <HostPriceIsRightDisplay {currentState} round={syncedRound} maxRounds={syncedMaxRounds} {scoreboard} />
{:else if (isBingo(normalizedGameType) || isBingo(currentGameType) || isBingo($gameState?.gameType)) && (isActiveGameState || $gameState?.playerCard || $gameState?.currentCard || $gameState?.currentItem || $gameState?.calledItems || $gameState?.playerCards || $gameState?.gameType === 'bingo')}
  <HostBingoDisplay {currentState} round={syncedRound} maxRounds={syncedMaxRounds} {scoreboard} />
{:else if isActiveGameState}
  <!-- Show placeholder if we're in an active game state but gameType doesn't match or game data is missing -->
  <div class="game-placeholder">
    <h2 class="game-title">Game in Progress...</h2>
    <p class="instruction-text">Check your phones!</p>
    {#if import.meta.env.DEV}
      <p class="debug-info">Game Type: {String(currentGameType || normalizedGameType || $gameState?.gameType || 'null')}</p>
      <p class="debug-info">State: {String(currentState)}</p>
      <p class="debug-info">Has Game Data: {JSON.stringify(hasGameData)}</p>
      <p class="debug-info">GameState Available: {$gameState ? 'Yes' : 'No'}</p>
    {/if}
  </div>
{:else}
  <div class="game-placeholder">
    <h2 class="game-title">Waiting for game to start...</h2>
    <p class="instruction-text">Game will begin shortly</p>
  </div>
{/if}

<style>
  .game-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    text-align: center;
  }

  .game-title {
    font-size: 3rem;
    font-weight: bold;
    margin-bottom: 1rem;
    color: #fff;
  }

  .instruction-text {
    font-size: 1.5rem;
    color: rgba(255, 255, 255, 0.8);
  }

  .debug-info {
    font-size: 1rem;
    color: rgba(255, 255, 255, 0.6);
    margin-top: 1rem;
    font-family: monospace;
  }
</style>

