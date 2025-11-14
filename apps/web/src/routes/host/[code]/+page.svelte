<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import { onMount, onDestroy } from 'svelte';
  import { socket, connectSocket, gameState, players } from '$lib/socket';
  import { GameState, GameType, PlayerStatus } from '@christmas/core';
  import { playSound } from '$lib/audio';
  import GiftGrabberHostCanvas from '$lib/games/GiftGrabberHostCanvas.svelte';
  import GlobalLeaderboard from '$lib/components/GlobalLeaderboard.svelte';
  import SessionLeaderboard from '$lib/components/SessionLeaderboard.svelte';

  const roomCode = $page.params.code;
  let controlPanelOpen = false;
  let showConfirmDialog = false;
  let confirmAction: (() => void) | null = null;
  let confirmMessage = '';
  let isPaused = false;
  let origin = '';
  let leaderboardTab: 'session' | 'global' = 'session';

  const games = [
    { type: GameType.TRIVIA_ROYALE, name: '🎄 Christmas Trivia Royale', desc: 'Fast-paced quiz' },
    { type: GameType.GIFT_GRABBER, name: '🎁 Gift Grabber', desc: 'Collect presents' },
    { type: GameType.WORKSHOP_TYCOON, name: '🏭 Workshop Tycoon', desc: 'Build your empire' },
    { type: GameType.EMOJI_CAROL, name: '🎶 Emoji Carol Battle', desc: 'Strategic voting' },
    { type: GameType.NAUGHTY_OR_NICE, name: '😇 Naughty or Nice', desc: 'Social voting' },
    { type: GameType.PRICE_IS_RIGHT, name: '💰 Price Is Right', desc: 'Guess the price' },
  ];

  onMount(() => {
    connectSocket();
    
    if (browser) {
      origin = window.location.origin;
    }

    // Listen for game state changes
    $socket.on('game_ended', (data: any) => {
      playSound('gameEnd');
      // Game state will be updated via gameState store
    });

    // Listen for pause/resume events
    $socket.on('game_state_update', (data: any) => {
      if (data.state === 'paused' || data.state === GameState.PAUSED) {
        isPaused = true;
      } else if (data.state === 'playing' || data.state === GameState.PLAYING) {
        isPaused = false;
      }
    });

    // Listen for room updates
    $socket.on('room_update', (data: any) => {
      // Players list is updated via socket store
    });
  });

  onDestroy(() => {
    $socket.off('game_ended');
    $socket.off('game_state_update');
    $socket.off('room_update');
  });

  $: currentState = $gameState?.state;
  $: currentGameType = $gameState?.gameType;
  $: scoreboard = $gameState?.scoreboard || [];
  $: round = $gameState?.round || 0;
  $: maxRounds = $gameState?.maxRounds || 0;
  $: isGameActive = currentState === GameState.PLAYING || currentState === GameState.ROUND_END || currentState === GameState.STARTING;
  $: canPause = currentState === GameState.PLAYING && !isPaused;
  $: canResume = currentState === GameState.PAUSED || isPaused;
  $: playerPositions = $gameState?.playerPositions || {};
  $: gifts = $gameState?.gifts || [];
  $: coals = $gameState?.coals || [];
  
  // Update isPaused based on game state
  $: {
    if (currentState === GameState.PAUSED) {
      isPaused = true;
    } else if (currentState === GameState.PLAYING) {
      isPaused = false;
    }
  }

  function toggleControlPanel() {
    controlPanelOpen = !controlPanelOpen;
  }

  function showConfirmation(message: string, action: () => void) {
    confirmMessage = message;
    confirmAction = action;
    showConfirmDialog = true;
  }

  function confirm() {
    if (confirmAction) {
      confirmAction();
    }
    showConfirmDialog = false;
    confirmAction = null;
  }

  function cancelConfirm() {
    showConfirmDialog = false;
    confirmAction = null;
  }

  function endGame() {
    showConfirmation('Are you sure you want to end the current game?', () => {
      $socket.emit('end_game');
      playSound('gameEnd');
      // Navigate back to room selection after a brief delay
      setTimeout(() => {
        goto(`/room/${roomCode}`);
      }, 1000);
    });
  }

  function pauseGame() {
    if (canPause) {
      $socket.emit('pause_game');
      isPaused = true;
      playSound('click');
    }
  }

  function resumeGame() {
    if (canResume) {
      $socket.emit('resume_game');
      isPaused = false;
      playSound('click');
    }
  }

  function startNewGame() {
    goto(`/room/${roomCode}`);
  }

  function returnToLobby() {
    goto(`/room/${roomCode}`);
  }

  function kickPlayer(playerId: string, playerName: string) {
    showConfirmation(`Remove ${playerName} from the room?`, () => {
      $socket.emit('kick_player', playerId, (response: any) => {
        if (response.success) {
          playSound('click');
        } else {
          alert(response.error || 'Failed to remove player');
        }
      });
    });
  }

  function copyRoomCode() {
    if (browser && navigator.clipboard) {
      navigator.clipboard.writeText(roomCode);
      playSound('click');
      alert('Room code copied!');
    }
  }

  function openSettings() {
    if (browser) {
      window.open(`/gamemaster?room=${roomCode}`, '_blank');
    }
  }
</script>

<svelte:head>
  <title>Host Screen - Room {roomCode}</title>
</svelte:head>

<div class="host-screen">
  <!-- Control Panel Toggle Button -->
  <button
    on:click={toggleControlPanel}
    class="control-toggle"
    class:open={controlPanelOpen}
    title={controlPanelOpen ? 'Close Control Panel' : 'Open Control Panel'}
  >
    {controlPanelOpen ? '✕' : '⚙️'}
  </button>

  <!-- Floating Control Panel -->
  <div class="control-panel" class:open={controlPanelOpen}>
    <div class="panel-header">
      <h2>Host Controls</h2>
      <button on:click={toggleControlPanel} class="close-btn">✕</button>
    </div>

    <div class="panel-content">
      <!-- Game Controls -->
      <div class="panel-section">
        <h3>🎮 Game Controls</h3>
        <div class="button-group">
          {#if isGameActive}
            <button on:click={endGame} class="btn-danger">
              ⏹️ End Game
            </button>
            {#if canPause}
              <button on:click={pauseGame} class="btn-secondary">
                ⏸️ Pause
              </button>
            {:else if canResume}
              <button on:click={resumeGame} class="btn-primary">
                ▶️ Resume
              </button>
            {/if}
          {/if}
          {#if currentState === GameState.GAME_END}
            <button on:click={startNewGame} class="btn-primary">
              🚀 Start New Game
            </button>
          {/if}
          <button on:click={returnToLobby} class="btn-secondary">
            🏠 Return to Lobby
          </button>
        </div>
      </div>

      <!-- Player Management -->
      <div class="panel-section">
        <h3>👥 Players ({$players.length})</h3>
        <div class="player-list">
          {#each $players as player}
            <div class="player-item" class:disconnected={player.status === PlayerStatus.DISCONNECTED}>
              <div class="player-info">
                <span class="player-avatar-small">{player.avatar}</span>
                <div class="player-details">
                  <span class="player-name-small">
                    {player.name}
                    {#if player.status === PlayerStatus.DISCONNECTED}
                      <span class="disconnected-badge">🔴</span>
                    {/if}
                  </span>
                  <span class="player-score-small">Score: {player.score || 0}</span>
                </div>
              </div>
              {#if player.id !== $socket?.id}
                <button
                  on:click={() => kickPlayer(player.id, player.name)}
                  class="kick-btn"
                  title="Remove player"
                >
                  🗑️
                </button>
              {:else}
                <span class="host-badge">Host</span>
              {/if}
            </div>
          {/each}
        </div>
      </div>

      <!-- Room Management -->
      <div class="panel-section">
        <h3>🏠 Room Management</h3>
        <div class="button-group">
          <button on:click={copyRoomCode} class="btn-secondary">
            📋 Copy Room Code
          </button>
          <button on:click={openSettings} class="btn-secondary">
            ⚙️ Settings
          </button>
        </div>
        <div class="room-info-panel">
          <p><strong>Room Code:</strong> <code>{roomCode}</code></p>
          <p><strong>Join URL:</strong></p>
          <code class="join-url">{origin}/join?code={roomCode}</code>
        </div>
      </div>

      <!-- Game State Indicator -->
      <div class="panel-section">
        <h3>📊 Game Status</h3>
        <div class="status-info">
          <p><strong>State:</strong> {currentState || 'LOBBY'}</p>
          {#if isPaused}
            <p class="paused-indicator">⏸️ PAUSED</p>
          {/if}
          {#if round > 0}
            <p><strong>Round:</strong> {round}/{maxRounds}</p>
          {/if}
        </div>
      </div>

      <!-- Leaderboards -->
      <div class="panel-section">
        <h3>🏆 Leaderboards</h3>
        <div class="leaderboard-tabs">
          <button
            on:click={() => (leaderboardTab = 'session')}
            class="tab-btn"
            class:active={leaderboardTab === 'session'}
          >
            Session
          </button>
          <button
            on:click={() => (leaderboardTab = 'global')}
            class="tab-btn"
            class:active={leaderboardTab === 'global'}
          >
            Global
          </button>
        </div>
        {#if leaderboardTab === 'session'}
          <SessionLeaderboard {roomCode} />
        {:else}
          <GlobalLeaderboard {roomCode} />
        {/if}
      </div>
    </div>
  </div>

  <!-- Confirmation Dialog -->
  {#if showConfirmDialog}
    <div class="confirm-overlay" on:click={cancelConfirm}>
      <div class="confirm-dialog" on:click|stopPropagation>
        <h3>Confirm Action</h3>
        <p>{confirmMessage}</p>
        <div class="confirm-buttons">
          <button on:click={confirm} class="btn-primary">Confirm</button>
          <button on:click={cancelConfirm} class="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Top Bar -->
  <div class="host-header">
    <div class="room-info">
      <span class="room-code">Room: {roomCode}</span>
      <span class="player-count">👥 {$players.length} Players</span>
      {#if isPaused}
        <span class="paused-badge">⏸️ PAUSED</span>
      {/if}
    </div>
    {#if round > 0}
      <div class="round-info">
        Round {round}/{maxRounds}
      </div>
    {/if}
  </div>

  <!-- Main Content Area -->
  <div class="host-content">
    {#if currentState === GameState.LOBBY}
      <div class="lobby-screen">
        <h1 class="mega-title">🎄 Christmas Party Games 🎄</h1>
        <p class="waiting-text">Waiting for host to start...</p>
        <div class="player-grid">
          {#each $players as player}
            <div class="player-badge">
              <span class="player-avatar">{player.avatar}</span>
              <span class="player-name">{player.name}</span>
            </div>
          {/each}
        </div>
      </div>
    {:else if currentState === GameState.STARTING}
      <div class="countdown-screen">
        <h1 class="countdown-text">Get Ready!</h1>
        <div class="countdown-number">3</div>
        <p class="countdown-subtitle">Game starting soon...</p>
      </div>
    {:else if currentState === GameState.PLAYING}
      <div class="playing-screen">
        {#if currentGameType === GameType.GIFT_GRABBER}
          <!-- Gift Grabber: Show Phaser canvas -->
          <div class="gift-grabber-host-view">
            <GiftGrabberHostCanvas 
              {playerPositions} 
              {gifts} 
              {coals}
            />
          </div>
        {:else if currentGameType === GameType.WORKSHOP_TYCOON}
          <!-- Workshop Tycoon: Show leaderboard -->
          <div class="workshop-leaderboard">
            <h2 class="game-title">🏭 Workshop Tycoon</h2>
            <div class="tycoon-scoreboard">
              {#each scoreboard.slice(0, 10) as player, i}
                <div class="tycoon-entry" class:leader={i === 0}>
                  <span class="tycoon-rank">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</span>
                  <span class="tycoon-name">{player.name}</span>
                  <span class="tycoon-resources">🎁 {Math.floor($gameState?.playerResources?.[player.playerId] || 0)}</span>
                  <span class="tycoon-production">⚡ {($gameState?.playerProduction?.[player.playerId] || 0).toFixed(1)}/s</span>
                </div>
              {/each}
            </div>
          </div>
        {:else}
          <h2 class="game-title">Game in Progress...</h2>
          <p class="instruction-text">Check your phones!</p>
          
          {#if $gameState?.currentQuestion}
            <div class="question-display">
              <h3 class="question-text">{$gameState.currentQuestion.question}</h3>
            </div>
          {:else if $gameState?.currentPrompt}
            <div class="prompt-display">
              <h3 class="prompt-text">{$gameState.currentPrompt.prompt}</h3>
            </div>
          {:else if $gameState?.currentItem}
            <div class="item-display">
              <img src={$gameState.currentItem.imageUrl} alt="Item" class="item-image" />
              <h3 class="item-name">{$gameState.currentItem.name}</h3>
            </div>
          {/if}
        {/if}
      </div>
    {:else if currentState === GameState.ROUND_END}
      <div class="results-screen">
        <h2 class="results-title">🎉 Round {round} Results 🎉</h2>
        <div class="mini-scoreboard">
          {#each scoreboard.slice(0, 10) as player, i}
            <div class="score-entry" class:leader={i === 0}>
              <span class="rank">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</span>
              <span class="name">{player.name}</span>
              <span class="score">{player.score}</span>
            </div>
          {/each}
        </div>
        {#if currentGameType === GameType.EMOJI_CAROL && $gameState?.roundResults?.[round - 1]}
          <div class="emoji-results-display">
            <h3 class="text-xl font-bold mb-4">Emoji Picks</h3>
            <div class="emoji-results-grid">
              {#each Object.entries($gameState.roundResults[round - 1].emojiCounts || {}) as [emoji, count]}
                <div class="emoji-result-item">
                  <span class="emoji-large">{emoji}</span>
                  <span class="emoji-count">×{count}</span>
                </div>
              {/each}
            </div>
          </div>
        {:else if currentGameType === GameType.NAUGHTY_OR_NICE && $gameState?.votes}
          {@const votes = $gameState.votes || {}}
          {@const naughtyCount = Object.values(votes).filter(v => v === 'naughty').length}
          {@const niceCount = Object.values(votes).filter(v => v === 'nice').length}
          {@const total = naughtyCount + niceCount}
          <div class="vote-results-display">
            <h3 class="text-xl font-bold mb-4">Vote Results</h3>
            <div class="vote-bars">
              <div class="vote-bar-container">
                <div class="vote-bar-label">😈 Naughty</div>
                <div class="vote-bar">
                  <div class="vote-bar-fill naughty-fill" style="width: {total > 0 ? (naughtyCount / total * 100) : 0}%">
                    {naughtyCount}
                  </div>
                </div>
              </div>
              <div class="vote-bar-container">
                <div class="vote-bar-label">👼 Nice</div>
                <div class="vote-bar">
                  <div class="vote-bar-fill nice-fill" style="width: {total > 0 ? (niceCount / total * 100) : 0}%">
                    {niceCount}
                  </div>
                </div>
              </div>
            </div>
          </div>
        {/if}
      </div>
    {:else if currentState === GameState.GAME_END}
      <div class="final-screen">
        <h1 class="mega-title">🏆 Final Results 🏆</h1>
        <div class="final-scoreboard">
          {#each scoreboard as player, i}
            <div class="final-score-entry" class:winner={i === 0} class:podium={i < 3}>
              <span class="final-rank">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</span>
              <span class="final-avatar">{player.name.charAt(0)}</span>
              <span class="final-name">{player.name}</span>
              <span class="final-score">{player.score}</span>
            </div>
          {/each}
        </div>
        <div class="game-end-actions">
          <button on:click={startNewGame} class="btn-primary-large">
            🚀 Start New Game
          </button>
          <button on:click={returnToLobby} class="btn-secondary-large">
            🏠 Return to Lobby
          </button>
        </div>
      </div>
    {:else if currentState === GameState.PAUSED}
      <div class="paused-screen">
        <h1 class="mega-title">⏸️ Game Paused</h1>
        <p class="instruction-text">The game is currently paused</p>
        <button on:click={resumeGame} class="btn-primary-large">
          ▶️ Resume Game
        </button>
      </div>
    {/if}
  </div>

  <!-- Bottom Scoreboard -->
  {#if currentState !== GameState.LOBBY && currentState !== GameState.GAME_END}
    <div class="bottom-scorebar">
      <div class="ticker-scroll">
        {#each scoreboard as player, i}
          <span class="ticker-item">
            #{i + 1} {player.name}: {player.score}
          </span>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .host-screen {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
    color: white;
    overflow: hidden;
  }

  .host-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 2rem 3rem;
    background: rgba(0, 0, 0, 0.5);
    border-bottom: 4px solid #ffd700;
  }

  .room-info {
    display: flex;
    gap: 2rem;
    font-size: 1.5rem;
    font-weight: bold;
  }

  .room-code {
    color: #ffd700;
  }

  .round-info {
    font-size: 2rem;
    font-weight: bold;
    color: #ffd700;
  }

  .host-content {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 3rem;
  }

  .lobby-screen, .countdown-screen, .playing-screen, .results-screen, .final-screen, .paused-screen {
    width: 100%;
    max-width: 1400px;
    text-align: center;
  }

  .gift-grabber-host-view {
    width: 100%;
    height: 100%;
    min-height: 600px;
  }

  .workshop-leaderboard {
    width: 100%;
    max-width: 1000px;
  }

  .tycoon-scoreboard {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-top: 2rem;
  }

  .tycoon-entry {
    display: grid;
    grid-template-columns: 80px 1fr 150px 120px;
    gap: 1rem;
    align-items: center;
    padding: 1rem 1.5rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 1rem;
    border: 2px solid transparent;
    transition: all 0.2s;
  }

  .tycoon-entry.leader {
    background: linear-gradient(90deg, rgba(255, 215, 0, 0.2), rgba(255, 215, 0, 0.05));
    border-color: #ffd700;
  }

  .tycoon-rank {
    font-size: 1.5rem;
    font-weight: bold;
  }

  .tycoon-name {
    font-size: 1.25rem;
    font-weight: bold;
  }

  .tycoon-resources {
    font-size: 1.125rem;
    color: #ffd700;
    font-weight: bold;
  }

  .tycoon-production {
    font-size: 1rem;
    color: #0f8644;
    font-weight: bold;
  }

  .emoji-results-display {
    margin-top: 3rem;
    max-width: 800px;
    margin-left: auto;
    margin-right: auto;
  }

  .emoji-results-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 1rem;
    margin-top: 1rem;
  }

  .emoji-result-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 1rem;
  }

  .emoji-large {
    font-size: 3rem;
  }

  .emoji-count {
    font-size: 1.5rem;
    font-weight: bold;
    color: #ffd700;
  }

  .vote-results-display {
    margin-top: 3rem;
    max-width: 600px;
    margin-left: auto;
    margin-right: auto;
  }

  .vote-bars {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    margin-top: 1rem;
  }

  .vote-bar-container {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .vote-bar-label {
    font-size: 1.25rem;
    font-weight: bold;
  }

  .vote-bar {
    width: 100%;
    height: 40px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 9999px;
    overflow: hidden;
    position: relative;
  }

  .vote-bar-fill {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: bold;
    font-size: 1.125rem;
    transition: width 0.5s ease;
  }

  .naughty-fill {
    background: linear-gradient(90deg, #c41e3a, #8b1538);
  }

  .nice-fill {
    background: linear-gradient(90deg, #0f8644, #0a5d2e);
  }

  .paused-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2rem;
  }

  .game-end-actions {
    display: flex;
    gap: 2rem;
    justify-content: center;
    margin-top: 3rem;
  }

  .btn-primary-large, .btn-secondary-large {
    padding: 1.5rem 3rem;
    font-size: 1.5rem;
    font-weight: bold;
    border-radius: 1rem;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-primary-large {
    background: linear-gradient(135deg, #c41e3a 0%, #8b1538 100%);
    color: white;
    box-shadow: 0 4px 15px rgba(196, 30, 58, 0.4);
  }

  .btn-primary-large:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(196, 30, 58, 0.6);
  }

  .btn-secondary-large {
    background: rgba(255, 255, 255, 0.1);
    color: white;
    border: 2px solid rgba(255, 255, 255, 0.3);
  }

  .btn-secondary-large:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  /* Control Panel Styles */
  .control-toggle {
    position: fixed;
    top: 2rem;
    right: 2rem;
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.8);
    border: 3px solid #ffd700;
    color: #ffd700;
    font-size: 1.5rem;
    cursor: pointer;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
  }

  .control-toggle:hover {
    background: rgba(0, 0, 0, 0.9);
    transform: scale(1.1);
  }

  .control-toggle.open {
    background: rgba(196, 30, 58, 0.9);
    border-color: #ffd700;
  }

  .control-panel {
    position: fixed;
    top: 0;
    right: 0;
    width: 400px;
    max-width: 90vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.95);
    border-left: 4px solid #ffd700;
    z-index: 999;
    transform: translateX(100%);
    transition: transform 0.3s ease-in-out;
    overflow-y: auto;
    box-shadow: -4px 0 20px rgba(0, 0, 0, 0.5);
  }

  .control-panel.open {
    transform: translateX(0);
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 2rem;
    background: rgba(196, 30, 58, 0.3);
    border-bottom: 2px solid #ffd700;
  }

  .panel-header h2 {
    margin: 0;
    font-size: 1.5rem;
    color: #ffd700;
  }

  .close-btn {
    background: none;
    border: none;
    color: white;
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0.5rem;
    border-radius: 0.25rem;
    transition: background 0.2s;
  }

  .close-btn:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .panel-content {
    padding: 1.5rem;
  }

  .panel-section {
    margin-bottom: 2rem;
    padding-bottom: 2rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .panel-section:last-child {
    border-bottom: none;
  }

  .panel-section h3 {
    margin: 0 0 1rem 0;
    font-size: 1.25rem;
    color: #ffd700;
  }

  .leaderboard-tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .tab-btn {
    flex: 1;
    padding: 0.5rem 1rem;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 0.5rem;
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    transition: all 0.2s;
  }

  .tab-btn:hover {
    background: rgba(255, 255, 255, 0.15);
  }

  .tab-btn.active {
    background: rgba(196, 30, 58, 0.3);
    border-color: #c41e3a;
    color: white;
  }

  .button-group {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .button-group button {
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    font-weight: 600;
    transition: all 0.2s;
    text-align: left;
  }

  .btn-primary {
    background: linear-gradient(135deg, #c41e3a 0%, #8b1538 100%);
    color: white;
  }

  .btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 10px rgba(196, 30, 58, 0.4);
  }

  .btn-secondary {
    background: rgba(255, 255, 255, 0.1);
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .btn-secondary:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .btn-danger {
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
    color: white;
  }

  .btn-danger:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 10px rgba(220, 38, 38, 0.4);
  }

  .player-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    max-height: 300px;
    overflow-y: auto;
  }

  .player-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 0.5rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
    opacity: 1;
    transition: opacity 0.2s;
  }

  .player-item.disconnected {
    opacity: 0.5;
    border: 1px dashed rgba(255, 255, 255, 0.2);
  }

  .disconnected-badge {
    font-size: 0.75rem;
    margin-left: 0.25rem;
  }

  .player-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
  }

  .player-avatar-small {
    font-size: 2rem;
  }

  .player-details {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .player-name-small {
    font-weight: 600;
    color: white;
  }

  .player-score-small {
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .kick-btn {
    background: rgba(220, 38, 38, 0.2);
    border: 1px solid rgba(220, 38, 38, 0.5);
    color: #fca5a5;
    padding: 0.5rem;
    border-radius: 0.25rem;
    cursor: pointer;
    font-size: 1rem;
    transition: all 0.2s;
  }

  .kick-btn:hover {
    background: rgba(220, 38, 38, 0.4);
    border-color: #dc2626;
  }

  .host-badge {
    background: rgba(255, 215, 0, 0.2);
    border: 1px solid #ffd700;
    color: #ffd700;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .room-info-panel {
    margin-top: 1rem;
    padding: 1rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 0.5rem;
    font-size: 0.875rem;
  }

  .room-info-panel p {
    margin: 0.5rem 0;
    color: rgba(255, 255, 255, 0.8);
  }

  .room-info-panel code {
    background: rgba(0, 0, 0, 0.3);
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    color: #ffd700;
    font-family: monospace;
  }

  .join-url {
    display: block;
    word-break: break-all;
    margin-top: 0.5rem;
  }

  .status-info {
    padding: 1rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 0.5rem;
  }

  .status-info p {
    margin: 0.5rem 0;
    color: rgba(255, 255, 255, 0.8);
  }

  .paused-indicator {
    color: #ffd700 !important;
    font-weight: bold;
    font-size: 1.1rem;
  }

  .paused-badge {
    background: rgba(255, 215, 0, 0.2);
    border: 1px solid #ffd700;
    color: #ffd700;
    padding: 0.25rem 0.75rem;
    border-radius: 0.25rem;
    font-size: 0.875rem;
    font-weight: 600;
  }

  /* Confirmation Dialog */
  .confirm-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    z-index: 2000;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .confirm-dialog {
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    border: 3px solid #ffd700;
    border-radius: 1rem;
    padding: 2rem;
    max-width: 400px;
    width: 90%;
    text-align: center;
  }

  .confirm-dialog h3 {
    margin: 0 0 1rem 0;
    color: #ffd700;
    font-size: 1.5rem;
  }

  .confirm-dialog p {
    margin: 0 0 2rem 0;
    color: white;
    font-size: 1.1rem;
  }

  .confirm-buttons {
    display: flex;
    gap: 1rem;
    justify-content: center;
  }

  .confirm-buttons button {
    padding: 0.75rem 2rem;
    border-radius: 0.5rem;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    font-weight: 600;
    transition: all 0.2s;
  }

  @media (max-width: 768px) {
    .control-panel {
      width: 100vw;
      max-width: 100vw;
    }

    .control-toggle {
      top: 1rem;
      right: 1rem;
      width: 50px;
      height: 50px;
      font-size: 1.25rem;
    }

    .game-end-actions {
      flex-direction: column;
      gap: 1rem;
    }

    .btn-primary-large, .btn-secondary-large {
      width: 100%;
      max-width: 300px;
    }
  }

  .mega-title {
    font-size: 5rem;
    font-weight: bold;
    margin-bottom: 2rem;
    text-shadow: 4px 4px 8px rgba(0, 0, 0, 0.5);
  }

  .waiting-text {
    font-size: 2rem;
    color: rgba(255, 255, 255, 0.7);
    margin-bottom: 3rem;
  }

  .player-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1.5rem;
  }

  .player-badge {
    background: rgba(255, 255, 255, 0.1);
    padding: 1.5rem;
    border-radius: 1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .player-avatar {
    font-size: 3rem;
  }

  .player-name {
    font-size: 1.25rem;
    font-weight: bold;
  }

  .countdown-text {
    font-size: 4rem;
    margin-bottom: 2rem;
  }

  .countdown-number {
    font-size: 15rem;
    font-weight: bold;
    color: #ffd700;
    animation: pulse 1s ease-in-out;
  }

  .countdown-subtitle {
    font-size: 2rem;
    color: rgba(255, 255, 255, 0.7);
    margin-top: 2rem;
  }

  .game-title {
    font-size: 4rem;
    margin-bottom: 1rem;
  }

  .instruction-text {
    font-size: 2rem;
    color: rgba(255, 255, 255, 0.7);
    margin-bottom: 3rem;
  }

  .question-display, .prompt-display, .item-display {
    background: rgba(255, 255, 255, 0.1);
    padding: 3rem;
    border-radius: 2rem;
    border: 4px solid #ffd700;
  }

  .question-text, .prompt-text {
    font-size: 3rem;
    font-weight: bold;
    line-height: 1.4;
  }

  .item-image {
    width: 100%;
    max-width: 600px;
    max-height: 400px;
    object-fit: contain;
    border-radius: 1rem;
    margin-bottom: 2rem;
  }

  .item-name {
    font-size: 3rem;
    font-weight: bold;
  }

  .results-title {
    font-size: 4rem;
    margin-bottom: 3rem;
  }

  .mini-scoreboard, .final-scoreboard {
    background: rgba(0, 0, 0, 0.3);
    padding: 2rem;
    border-radius: 2rem;
    max-width: 800px;
    margin: 0 auto;
  }

  .score-entry, .final-score-entry {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 2rem;
    align-items: center;
    padding: 1.5rem;
    margin-bottom: 1rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 1rem;
    font-size: 2rem;
  }

  .score-entry.leader, .final-score-entry.winner {
    background: linear-gradient(90deg, rgba(255, 215, 0, 0.3), rgba(255, 215, 0, 0.1));
    border: 3px solid #ffd700;
  }

  .rank, .final-rank {
    font-weight: bold;
    width: 4rem;
  }

  .name, .final-name {
    font-weight: bold;
    text-align: left;
  }

  .score, .final-score {
    font-weight: bold;
    color: #ffd700;
    font-size: 2.5rem;
  }

  .bottom-scorebar {
    background: rgba(0, 0, 0, 0.7);
    padding: 1rem;
    border-top: 3px solid #ffd700;
    overflow: hidden;
  }

  .ticker-scroll {
    display: flex;
    gap: 3rem;
    animation: scroll 30s linear infinite;
    white-space: nowrap;
  }

  .ticker-item {
    font-size: 1.5rem;
    font-weight: bold;
  }

  @keyframes scroll {
    0% {
      transform: translateX(0);
    }
    100% {
      transform: translateX(-50%);
    }
  }

  @keyframes pulse {
    0%, 100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.1);
    }
  }
</style>
