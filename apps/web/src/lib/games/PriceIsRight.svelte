<script lang="ts">
  import { socket, gameState } from '$lib/socket';
  import { GameState } from '@christmas/core';

  $: item = $gameState?.currentItem;
  $: hasGuessed = $gameState?.hasGuessed;
  $: state = $gameState?.state;
  $: round = $gameState?.round;
  $: maxRounds = $gameState?.maxRounds;

  let guess = '';

  function submitGuess() {
    const guessNumber = parseFloat(guess);
    if (!isNaN(guessNumber) && guessNumber > 0 && !hasGuessed) {
      $socket.emit('price_guess', guessNumber);
      guess = '';
    }
  }

  function addDigit(digit: string) {
    if (guess.length < 8) {
      guess += digit;
    }
  }

  function addDecimal() {
    if (!guess.includes('.')) {
      guess += guess ? '.' : '0.';
    }
  }

  function backspace() {
    guess = guess.slice(0, -1);
  }

  function clear() {
    guess = '';
  }
</script>

<div class="price-container">
  {#if !state}
    <div class="loading-overlay">
      <div class="text-6xl mb-4 animate-spin">⏳</div>
      <p class="text-xl text-white/70">Loading game...</p>
    </div>
  {:else if state === GameState.STARTING}
    <div class="countdown-overlay">
      <div class="text-8xl mb-4">💰</div>
      <h1 class="text-4xl font-bold">Get Ready!</h1>
      <p class="text-xl text-white/70 mt-2">Starting soon...</p>
    </div>
  {:else if state === GameState.PLAYING && item}
    <div class="item-card">
      <div class="round-badge">Round {round}/{maxRounds}</div>

      <div class="item-image-container">
        <img src={item.imageUrl} alt={item.name} class="item-image" />
      </div>

      <h2 class="item-name">{item.name}</h2>
      <p class="item-description">{item.description}</p>

      <div class="guess-display">
        <span class="dollar">$</span>
        <span class="amount">{guess || '0.00'}</span>
      </div>

      <div class="numpad">
        <button on:click={() => addDigit('1')} class="num-btn">1</button>
        <button on:click={() => addDigit('2')} class="num-btn">2</button>
        <button on:click={() => addDigit('3')} class="num-btn">3</button>
        
        <button on:click={() => addDigit('4')} class="num-btn">4</button>
        <button on:click={() => addDigit('5')} class="num-btn">5</button>
        <button on:click={() => addDigit('6')} class="num-btn">6</button>
        
        <button on:click={() => addDigit('7')} class="num-btn">7</button>
        <button on:click={() => addDigit('8')} class="num-btn">8</button>
        <button on:click={() => addDigit('9')} class="num-btn">9</button>
        
        <button on:click={addDecimal} class="num-btn">.</button>
        <button on:click={() => addDigit('0')} class="num-btn">0</button>
        <button on:click={backspace} class="num-btn">⌫</button>
      </div>

      <div class="action-buttons">
        <button on:click={clear} class="btn-clear">Clear</button>
        <button 
          on:click={submitGuess} 
          disabled={!guess || hasGuessed}
          class="btn-submit"
        >
          {hasGuessed ? '✓ Submitted' : 'Submit Guess'}
        </button>
      </div>
    </div>
  {:else if state === GameState.ROUND_END && item}
    <div class="result-card">
      <div class="text-6xl mb-4">💰</div>
      <h2 class="text-2xl font-bold mb-2">Actual Price:</h2>
      <div class="actual-price">${item.price.toFixed(2)}</div>
      
      <div class="guesses-list">
        <h3 class="text-lg font-bold mb-2">All Guesses</h3>
        {#each Object.entries($gameState?.guesses || {}) as [playerId, playerGuess]}
          <div class="guess-row">
            <span>${playerGuess.toFixed(2)}</span>
          </div>
        {/each}
      </div>
    </div>
  {:else if state === GameState.GAME_END}
    <div class="game-end">
      <div class="text-8xl mb-6">🏆</div>
      <h1 class="text-4xl font-bold mb-4">Game Over!</h1>
      <p class="text-xl text-white/70">Check the host screen for final results!</p>
    </div>
  {/if}
</div>

<style>
  .price-container {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .item-card {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .round-badge {
    background: rgba(196, 30, 58, 0.3);
    border: 2px solid #c41e3a;
    padding: 0.5rem 1rem;
    border-radius: 9999px;
    font-weight: bold;
    text-align: center;
    width: fit-content;
    margin: 0 auto;
  }

  .item-image-container {
    width: 100%;
    height: 200px;
    overflow: hidden;
    border-radius: 1rem;
    background: rgba(255, 255, 255, 0.1);
  }

  .item-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .item-name {
    font-size: 1.5rem;
    font-weight: bold;
    text-align: center;
  }

  .item-description {
    text-align: center;
    color: rgba(255, 255, 255, 0.7);
  }

  .guess-display {
    display: flex;
    justify-content: center;
    align-items: baseline;
    gap: 0.5rem;
    padding: 1.5rem;
    background: rgba(255, 215, 0, 0.2);
    border: 3px solid #ffd700;
    border-radius: 1rem;
    margin: 1rem 0;
  }

  .dollar {
    font-size: 2rem;
    font-weight: bold;
    color: #ffd700;
  }

  .amount {
    font-size: 3rem;
    font-weight: bold;
    color: white;
  }

  .numpad {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.75rem;
    margin: 1rem 0;
  }

  .num-btn {
    aspect-ratio: 1;
    font-size: 1.5rem;
    font-weight: bold;
    background: rgba(15, 134, 68, 0.3);
    border: 2px solid #0f8644;
    border-radius: 1rem;
    color: white;
    transition: all 0.1s;
  }

  .num-btn:active {
    transform: scale(0.95);
    background: rgba(15, 134, 68, 0.5);
  }

  .action-buttons {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 0.75rem;
  }

  .btn-clear {
    padding: 1rem;
    background: rgba(196, 30, 58, 0.3);
    border: 2px solid #c41e3a;
    border-radius: 1rem;
    color: white;
    font-weight: bold;
  }

  .btn-submit {
    padding: 1rem;
    background: rgba(15, 134, 68, 0.3);
    border: 2px solid #0f8644;
    border-radius: 1rem;
    color: white;
    font-weight: bold;
    font-size: 1.125rem;
  }

  .btn-submit:disabled {
    opacity: 0.5;
  }

  .loading-overlay, .countdown-overlay {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
  }

  .result-card, .game-end {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 2rem;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .animate-spin {
    animation: spin 1s linear infinite;
  }

  .actual-price {
    font-size: 3rem;
    font-weight: bold;
    color: #ffd700;
    margin-bottom: 2rem;
  }

  .guesses-list {
    width: 100%;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 1rem;
    padding: 1rem;
  }

  .guess-row {
    padding: 0.75rem;
    margin-bottom: 0.5rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 0.5rem;
    font-weight: bold;
  }
</style>
