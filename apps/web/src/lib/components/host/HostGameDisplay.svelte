<script lang="ts">
  import { gameState } from '$lib/socket';
  import { GameType, GameState } from '@christmas/core';
  import HostTriviaDisplay from './HostTriviaDisplay.svelte';
  import HostEmojiCarolDisplay from './HostEmojiCarolDisplay.svelte';
  import HostNaughtyOrNiceDisplay from './HostNaughtyOrNiceDisplay.svelte';
  import HostPriceIsRightDisplay from './HostPriceIsRightDisplay.svelte';

  export let currentGameType: GameType | null;
  export let currentState: GameState | null | undefined;
  export let round: number;
  export let maxRounds: number;
  export let scoreboard: any[] = [];

  // Debug logging for rendering
  $: if (import.meta.env.DEV) {
    console.log('[HostGameDisplay] Render check:', {
      currentGameType,
      currentState,
      hasGameState: !!$gameState,
      hasQuestion: !!$gameState?.currentQuestion,
      hasItem: !!$gameState?.currentItem,
      hasPrompt: !!$gameState?.currentPrompt,
      hasEmojis: !!$gameState?.availableEmojis,
      shouldShowTrivia: currentGameType === GameType.TRIVIA_ROYALE && $gameState?.currentQuestion,
      questionText: $gameState?.currentQuestion?.question || 'N/A'
    });
  }
</script>

{#if currentGameType === GameType.TRIVIA_ROYALE && $gameState?.currentQuestion}
  <HostTriviaDisplay {currentState} {round} {maxRounds} {scoreboard} />
{:else if currentGameType === GameType.EMOJI_CAROL && $gameState?.availableEmojis}
  <HostEmojiCarolDisplay {currentState} {round} {maxRounds} {scoreboard} />
{:else if currentGameType === GameType.NAUGHTY_OR_NICE && $gameState?.currentPrompt}
  <HostNaughtyOrNiceDisplay {currentState} {round} {maxRounds} {scoreboard} />
{:else if currentGameType === GameType.PRICE_IS_RIGHT && $gameState?.currentItem}
  <HostPriceIsRightDisplay {currentState} {round} {maxRounds} {scoreboard} />
{:else}
  <div class="game-placeholder">
    <h2 class="game-title">Game in Progress...</h2>
    <p class="instruction-text">Check your phones!</p>
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
</style>

