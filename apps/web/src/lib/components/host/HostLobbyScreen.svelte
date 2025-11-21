<script lang="ts">
  import { players, socket } from '$lib/socket';
  import { GameType } from '@christmas/core';
  import { t, language } from '$lib/i18n';
  import GameTile from '$lib/components/room/GameTile.svelte';
  import GameSettingsModal from '$lib/components/room/GameSettingsModal.svelte';
  import HostGuessingDashboard from '$lib/components/host/HostGuessingDashboard.svelte';

  export let roomCode: string;
  export let origin: string = '';

  let selectedGame: GameType | null = null;
  let showSettingsModal = false;
  let selectedGameForSettings: GameType | null = null;
  let activeTab: 'games' | 'guessing' = 'games';

  // Make translations reactive by subscribing to language changes
  // Include $language in each reactive statement so Svelte knows to re-run when language changes
  $: readyToStartText = $language && t('host.readyToStart');
  $: selectGameToStartText = ($language && t('host.selectGameToStart')) || 'Select a game to start';
  $: gamesTabText = $language && t('room.tabs.games');
  $: guessingTabText = $language && t('room.tabs.guessing');
  $: needPlayersText = $language && t('room.needPlayers');
  $: playersText = $language && t('room.players');

  // Make games list reactive to language changes
  // Include $language so Svelte knows to re-run when language changes
  $: {
    // Only update games list if we have a language value
    if ($language) {
      const bingoType = GameType.BINGO || ('bingo' as GameType);
      const bingoName = t('room.games.bingo.name') || 'Christmas Speed Bingo';
      const bingoDesc = t('room.games.bingo.desc') || 'Dynamic bingo with pictures';
      
      const gamesList = [
        { type: GameType.TRIVIA_ROYALE, name: t('room.games.triviaRoyale.name'), desc: t('room.games.triviaRoyale.desc') },
        { type: GameType.EMOJI_CAROL, name: t('room.games.emojiCarol.name'), desc: t('room.games.emojiCarol.desc') },
        { type: GameType.NAUGHTY_OR_NICE, name: t('room.games.naughtyOrNice.name'), desc: t('room.games.naughtyOrNice.desc') },
        { type: GameType.PRICE_IS_RIGHT, name: t('room.games.priceIsRight.name'), desc: t('room.games.priceIsRight.desc') },
        { type: bingoType, name: bingoName, desc: bingoDesc },
      ];
      
      games = gamesList.filter(game => game.type);
    }
  }

  let games: Array<{ type: GameType; name: string; desc: string }> = [];

  function selectGame(gameType: GameType) {
    selectedGame = gameType;
  }

  function startGame() {
    if (selectedGame && $socket) {
      selectedGameForSettings = selectedGame;
      showSettingsModal = true;
    }
  }

  function handleStartWithSettings(settings: any) {
    if (selectedGameForSettings && $socket) {
      ($socket as any).emit('start_game', selectedGameForSettings, settings, (response: any) => {
        if (response && response.success) {
          showSettingsModal = false;
          selectedGameForSettings = null;
        } else {
          const errorMsg = response?.error || 'Failed to start game';
          alert(errorMsg);
          console.error('[HostLobbyScreen] Failed to start game:', response);
        }
      });
    } else if (!$socket) {
      alert('Not connected to server');
    }
  }

  function handleCloseModal() {
    showSettingsModal = false;
    selectedGameForSettings = null;
  }
</script>

<div class="lobby-screen">
  <div class="lobby-header">
    <h1 class="mega-title">🎄 {readyToStartText} 🎄</h1>
    <p class="waiting-text">{selectGameToStartText}</p>
  </div>

  <!-- Tab Navigation -->
  <div class="tab-navigation">
    <button
      type="button"
      class="tab-button {activeTab === 'games' ? 'active' : ''}"
      on:click={() => (activeTab = 'games')}
    >
      🎮 {gamesTabText}
    </button>
    <button
      type="button"
      class="tab-button {activeTab === 'guessing' ? 'active' : ''}"
      on:click={() => (activeTab = 'guessing')}
    >
      🎯 {guessingTabText}
    </button>
  </div>

  {#if activeTab === 'guessing'}
    <!-- Guessing Dashboard -->
    <div class="guessing-dashboard-container">
      <HostGuessingDashboard {roomCode} {origin} />
    </div>
  {:else}
    <!-- Game Selection -->
    <div class="game-selection-container">
      <div class="games-grid">
        {#each games as game}
          {#if game.type}
            <GameTile
              gameType={game.type}
              name={game.name}
              description={game.desc}
              playerCount={$players.length}
              isHost={true}
              selected={selectedGame === game.type}
              onSelect={() => selectGame(game.type)}
              onStart={startGame}
            />
          {/if}
        {/each}
      </div>

      {#if selectedGame}
        <div class="game-selection-footer">
          {#if $players.length < 2}
            <p class="warning-text">
              ⚠️ {needPlayersText}
            </p>
          {/if}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Players List -->
  <div class="players-section">
    <h2 class="players-title">👥 {playersText} ({$players.length})</h2>
    <div class="player-grid">
      {#each $players as player}
        <div class="player-badge">
          <span class="player-avatar">{player.avatar}</span>
          <span class="player-name">{player.name}</span>
        </div>
      {/each}
    </div>
  </div>
</div>

<!-- Game Settings Modal -->
{#if selectedGameForSettings}
  <GameSettingsModal
    gameType={selectedGameForSettings}
    open={showSettingsModal}
    onClose={handleCloseModal}
    onStart={handleStartWithSettings}
  />
{/if}

<style>
  .lobby-screen {
    width: 100%;
    min-height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding: clamp(1rem, 2vh, 2rem);
    box-sizing: border-box;
    gap: clamp(1rem, 2vh, 1.5rem);
  }

  .lobby-header {
    text-align: center;
    width: 100%;
  }

  .mega-title {
    font-size: clamp(2rem, 4vw, 3rem);
    font-weight: bold;
    margin-bottom: clamp(0.5rem, 1vh, 1rem);
    color: #e0f2fe;
    text-shadow: 
      0 0 15px rgba(224, 242, 254, 0.8),
      0 0 30px rgba(173, 216, 230, 0.6),
      4px 4px 8px rgba(0, 0, 0, 0.5);
    filter: drop-shadow(0 0 10px rgba(224, 242, 254, 0.4));
  }

  .waiting-text {
    font-size: clamp(0.9rem, 1.5vw, 1.2rem);
    color: rgba(224, 242, 254, 0.8);
    text-shadow: 
      0 0 8px rgba(224, 242, 254, 0.4),
      1px 1px 3px rgba(0, 0, 0, 0.5);
  }

  .tab-navigation {
    display: flex;
    gap: clamp(0.5rem, 1vw, 1rem);
    width: 100%;
    max-width: min(90vw, 800px);
    background: rgba(255, 255, 255, 0.1);
    padding: clamp(0.25rem, 0.5vh, 0.5rem);
    border-radius: 12px;
    backdrop-filter: blur(10px);
  }

  .tab-button {
    flex: 1;
    padding: clamp(0.5rem, 1vh, 0.75rem) clamp(1rem, 2vw, 1.5rem);
    font-size: clamp(0.9rem, 1.5vw, 1.1rem);
    font-weight: bold;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    transition: all 0.3s ease;
  }

  .tab-button:hover {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.9);
  }

  .tab-button.active {
    background: linear-gradient(135deg, #c41e3a 0%, #8b1538 100%);
    color: white;
    box-shadow: 0 2px 10px rgba(196, 30, 58, 0.4);
  }

  .game-selection-container,
  .guessing-dashboard-container {
    width: 100%;
    max-width: min(90vw, 1200px);
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
  }

  .games-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(clamp(280px, 30vw, 400px), 1fr));
    gap: clamp(1rem, 2vw, 1.5rem);
    padding: clamp(0.5rem, 1vh, 1rem);
  }

  .game-selection-footer {
    padding: clamp(0.5rem, 1vh, 1rem);
    text-align: center;
  }

  .warning-text {
    font-size: clamp(0.9rem, 1.3vw, 1.1rem);
    color: #fbbf24;
    text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.5);
  }

  .players-section {
    width: 100%;
    max-width: min(90vw, 1200px);
  }

  .players-title {
    font-size: clamp(1.2rem, 2vw, 1.5rem);
    font-weight: bold;
    color: #ffd700;
    text-align: center;
    margin-bottom: clamp(0.75rem, 1.5vh, 1rem);
    text-shadow: 0 0 10px rgba(255, 215, 0, 0.8), 2px 2px 4px rgba(0, 0, 0, 0.5);
  }

  .player-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(clamp(100px, 12vw, 150px), 1fr));
    gap: clamp(0.5rem, 1vw, 0.75rem);
    padding: clamp(0.5rem, 1vh, 1rem);
  }

  .player-badge {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: clamp(0.25rem, 0.5vh, 0.5rem);
    padding: clamp(0.5rem, 1vh, 0.75rem);
    background: rgba(255, 255, 255, 0.1);
    border: 2px solid rgba(255, 215, 0, 0.3);
    border-radius: 0.75rem;
    backdrop-filter: blur(10px);
    transition: all 0.3s ease;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }

  .player-badge:hover {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 215, 0, 0.5);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .player-avatar {
    font-size: clamp(2rem, 3vw, 2.5rem);
    filter: drop-shadow(0 0 8px rgba(255, 215, 0, 0.3));
  }

  .player-name {
    font-size: clamp(0.75rem, 1.1vw, 0.9rem);
    font-weight: 600;
    color: #ffffff;
    text-align: center;
    text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.5);
  }
</style>

