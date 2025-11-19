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

  // Helper to check if game type is BINGO (handles undefined GameType.BINGO)
  function isBingo(gt: GameType | string | null | undefined): boolean {
    return gt === GameType.BINGO || gt === 'bingo';
  }

  // Debug logging for rendering
  $: if (import.meta.env.DEV) {
    console.log('[HostGameDisplay] Render check:', {
      currentGameType,
      normalizedGameType,
      currentState,
      hasGameState: !!$gameState,
      gameStateGameType: $gameState?.gameType,
      hasQuestion: !!$gameState?.currentQuestion,
      hasItem: !!$gameState?.currentItem,
      hasPrompt: !!$gameState?.currentPrompt,
      hasEmojis: !!$gameState?.availableEmojis,
      hasBingoCard: !!$gameState?.playerCard || !!$gameState?.currentCard,
      hasBingoCurrentItem: !!$gameState?.currentItem,
      hasBingoCalledItems: !!$gameState?.calledItems,
      isBingoGame: isBingo(currentGameType) || isBingo(normalizedGameType) || isBingo($gameState?.gameType),
      shouldShowTrivia: currentGameType === GameType.TRIVIA_ROYALE && ($gameState?.currentQuestion || currentState === GameState.ROUND_END || currentState === GameState.PLAYING || currentState === GameState.STARTING),
      shouldShowEmoji: currentGameType === GameType.EMOJI_CAROL && ($gameState?.availableEmojis || currentState === GameState.ROUND_END || currentState === GameState.PLAYING || currentState === GameState.STARTING),
      shouldShowNaughty: currentGameType === GameType.NAUGHTY_OR_NICE && ($gameState?.currentPrompt || currentState === GameState.ROUND_END || currentState === GameState.PLAYING || currentState === GameState.STARTING),
      shouldShowPrice: currentGameType === GameType.PRICE_IS_RIGHT && ($gameState?.currentItem || currentState === GameState.ROUND_END || currentState === GameState.PLAYING || currentState === GameState.STARTING),
      questionText: $gameState?.currentQuestion?.question || 'N/A'
    });
  }
</script>

{#if (normalizedGameType === GameType.TRIVIA_ROYALE || currentGameType === GameType.TRIVIA_ROYALE) && (currentState === GameState.ROUND_END || currentState === GameState.PLAYING || currentState === GameState.STARTING || $gameState?.currentQuestion)}
  <HostTriviaDisplay {currentState} {round} {maxRounds} {scoreboard} />
{:else if (normalizedGameType === GameType.EMOJI_CAROL || currentGameType === GameType.EMOJI_CAROL) && (currentState === GameState.ROUND_END || currentState === GameState.PLAYING || currentState === GameState.STARTING || $gameState?.availableEmojis)}
  <HostEmojiCarolDisplay {currentState} {round} {maxRounds} {scoreboard} />
{:else if (normalizedGameType === GameType.NAUGHTY_OR_NICE || currentGameType === GameType.NAUGHTY_OR_NICE) && (currentState === GameState.ROUND_END || currentState === GameState.PLAYING || currentState === GameState.STARTING || $gameState?.currentPrompt)}
  <HostNaughtyOrNiceDisplay {currentState} {round} {maxRounds} {scoreboard} />
{:else if (normalizedGameType === GameType.PRICE_IS_RIGHT || currentGameType === GameType.PRICE_IS_RIGHT) && (currentState === GameState.ROUND_END || currentState === GameState.PLAYING || currentState === GameState.STARTING || $gameState?.currentItem)}
  <HostPriceIsRightDisplay {currentState} {round} {maxRounds} {scoreboard} />
{:else if (isBingo(normalizedGameType) || isBingo(currentGameType) || isBingo($gameState?.gameType)) && (currentState === GameState.ROUND_END || currentState === GameState.PLAYING || currentState === GameState.STARTING || $gameState?.playerCard || $gameState?.currentCard || $gameState?.currentItem || $gameState?.calledItems || $gameState?.playerCards || $gameState?.gameType === 'bingo')}
  <HostBingoDisplay {currentState} {round} {maxRounds} {scoreboard} />
{:else if currentState === GameState.PLAYING || currentState === GameState.STARTING || currentState === GameState.ROUND_END}
  <!-- Show placeholder if we're in an active game state but gameType doesn't match -->
  <div class="game-placeholder">
    <h2 class="game-title">Game in Progress...</h2>
    <p class="instruction-text">Check your phones!</p>
    <p class="debug-info">Game Type: {String(currentGameType || normalizedGameType || 'null')}, State: {String(currentState)}</p>
    <p class="debug-info">GameState Type: {String($gameState?.gameType || 'null')}</p>
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

