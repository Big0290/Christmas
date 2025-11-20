<script lang="ts">
  import { socket, players } from '$lib/socket';
  import { GameState, PlayerStatus } from '@christmas/core';
  import SessionLeaderboard from '$lib/components/SessionLeaderboard.svelte';
  import GlobalLeaderboard from '$lib/components/GlobalLeaderboard.svelte';
  import { t } from '$lib/i18n';
  import { playSound, playSoundOnce } from '$lib/audio';
  import { goto } from '$app/navigation';

  export let controlPanelOpen: boolean = false;
  export let roomCode: string;
  export let origin: string;
  export let currentState: GameState | null | undefined;
  export let isPaused: boolean = false;
  export let round: number = 0;
  export let maxRounds: number = 0;
  export let leaderboardTab: 'session' | 'global' = 'session';
  export let showConfirmation: (message: string, action: () => void) => void;

  $: isGameActive = currentState === GameState.PLAYING || currentState === GameState.STARTING || currentState === GameState.ROUND_END;
  $: canPause = isGameActive && !isPaused;
  $: canResume = isPaused;

  function toggleControlPanel() {
    controlPanelOpen = !controlPanelOpen;
  }

  function endGame() {
    if (!$socket) return;
    showConfirmation(t('host.confirmEndGame'), () => {
      $socket.emit('end_game');
      playSoundOnce('gameEnd', 1000);
      setTimeout(() => {
        goto(`/room/${roomCode}`);
      }, 1000);
    });
  }

  function pauseGame() {
    if (!$socket || !canPause) return;
    $socket.emit('pause_game');
    isPaused = true;
    playSound('click');
  }

  function resumeGame() {
    if (!$socket || !canResume) return;
    $socket.emit('resume_game');
    isPaused = false;
    playSound('click');
  }

  function startNewGame() {
    goto(`/room/${roomCode}`);
  }

  function returnToLobby() {
    goto(`/room/${roomCode}`);
  }

  function kickPlayer(playerId: string, playerName: string) {
    if (!$socket) return;
    showConfirmation(t('host.removePlayer', { name: playerName }), () => {
      ($socket as any).emit('kick_player', playerId, (response: any) => {
        if (response.success) {
          playSound('click');
        } else {
          alert(response.error || t('host.failedRemovePlayer'));
        }
      });
    });
  }

  function copyRoomCode() {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(roomCode);
      playSound('click');
      alert(t('host.roomCodeCopied'));
    }
  }
</script>

<!-- Control Panel Toggle Button (Hamburger Menu) -->
<button
  on:click={toggleControlPanel}
  class="control-toggle"
  class:open={controlPanelOpen}
  title={controlPanelOpen ? 'Close Control Panel' : 'Open Control Panel'}
  aria-label={controlPanelOpen ? 'Close menu' : 'Open menu'}
>
  <span class="hamburger">
    <span class="hamburger-line"></span>
    <span class="hamburger-line"></span>
    <span class="hamburger-line"></span>
  </span>
</button>

<!-- Floating Control Panel -->
<div class="control-panel" class:open={controlPanelOpen}>
  <div class="panel-header">
    <h2>{t('host.controlPanel')}</h2>
    <button on:click={toggleControlPanel} class="close-btn">✕</button>
  </div>

  <div class="panel-content">
    <!-- Game Controls -->
    <div class="panel-section">
      <h3>🎮 {t('host.gameControls')}</h3>
      <div class="button-group">
        {#if isGameActive}
          <button on:click={endGame} class="btn-danger">
            ⏹️ {t('host.endGame')}
          </button>
          {#if canPause}
            <button on:click={pauseGame} class="btn-secondary">
              ⏸️ {t('host.pause')}
            </button>
          {:else if canResume}
            <button on:click={resumeGame} class="btn-primary">
              ▶️ {t('host.resume')}
            </button>
          {/if}
        {/if}
        {#if currentState === GameState.GAME_END}
          <button on:click={startNewGame} class="btn-primary">
            🚀 {t('host.startNewGame')}
          </button>
        {/if}
        <button on:click={returnToLobby} class="btn-secondary">
          🏠 {t('host.returnToLobby')}
        </button>
      </div>
    </div>

    <!-- Player Management -->
    <div class="panel-section">
      <h3>👥 {t('host.players')} ({$players.length})</h3>
      <div class="player-list">
        {#each $players as player}
          <div
            class="player-item"
            class:disconnected={player.status === PlayerStatus.DISCONNECTED}
          >
            <div class="player-info">
              <span class="player-avatar-small">{player.avatar}</span>
              <div class="player-details">
                <span class="player-name-small">
                  {player.name}
                  {#if player.status === PlayerStatus.DISCONNECTED}
                    <span class="disconnected-badge">🔴</span>
                  {/if}
                </span>
                <span class="player-score-small"
                  >{t('common.label.score')}: {player.score || 0}</span
                >
              </div>
            </div>
            {#if player.id !== $socket?.id}
              <button
                on:click={() => kickPlayer(player.id, player.name)}
                class="kick-btn"
                title={t('host.removePlayerTitle')}
              >
                🗑️
              </button>
            {:else}
              <span class="host-badge">{t('common.label.host')}</span>
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <!-- Room Management -->
    <div class="panel-section">
      <h3>🏠 {t('host.roomManagement')}</h3>
      <div class="button-group">
        <button on:click={copyRoomCode} class="btn-secondary">
          📋 {t('host.copyRoomCode')}
        </button>
      </div>
      <div class="room-info-panel">
        <p><strong>{t('common.label.roomCode')}:</strong> <code>{roomCode}</code></p>
        <p><strong>{t('host.joinUrl')}:</strong></p>
        <code class="join-url">{origin}/join?code={roomCode}</code>
      </div>
    </div>

    <!-- Game State Indicator -->
    <div class="panel-section">
      <h3>📊 {t('host.gameStatus')}</h3>
      <div class="status-info">
        <p>
          <strong>{t('host.state')}:</strong>
          {currentState
            ? t(`host.gameState.${String(currentState).toLowerCase()}`)
            : t('host.gameState.lobby')}
        </p>
        {#if isPaused}
          <p class="paused-indicator">⏸️ {t('host.gameState.paused')}</p>
        {/if}
        {#if round > 0}
          <p>
            <strong>{t('common.label.round')}:</strong>
            {t('host.round', { round, maxRounds })}
          </p>
        {/if}
      </div>
    </div>

    <!-- Leaderboards -->
    <div class="panel-section">
      <h3>🏆 {t('host.leaderboards')}</h3>
      <div class="leaderboard-tabs">
        <button
          on:click={() => (leaderboardTab = 'session')}
          class="tab-btn"
          class:active={leaderboardTab === 'session'}
        >
          {t('host.leaderboard.session')}
        </button>
        <button
          on:click={() => (leaderboardTab = 'global')}
          class="tab-btn"
          class:active={leaderboardTab === 'global'}
        >
          {t('host.leaderboard.global')}
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

<style>
  /* Hamburger Menu Toggle Button */
  .control-toggle {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 1001;
    width: 50px;
    height: 50px;
    background: rgba(0, 0, 0, 0.8);
    border: 2px solid #ffd700;
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s ease;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .control-toggle:hover {
    background: rgba(0, 0, 0, 0.9);
    transform: scale(1.05);
    box-shadow: 0 6px 16px rgba(255, 215, 0, 0.4);
  }

  .hamburger {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    width: 24px;
    height: 18px;
  }

  .hamburger-line {
    width: 100%;
    height: 3px;
    background: #ffd700;
    border-radius: 2px;
    transition: all 0.3s ease;
  }

  .control-toggle.open .hamburger-line:nth-child(1) {
    transform: translateY(7.5px) rotate(45deg);
  }

  .control-toggle.open .hamburger-line:nth-child(2) {
    opacity: 0;
  }

  .control-toggle.open .hamburger-line:nth-child(3) {
    transform: translateY(-7.5px) rotate(-45deg);
  }

  /* Control Panel */
  .control-panel {
    position: fixed;
    top: 0;
    right: 0;
    width: clamp(280px, 25vw, 400px);
    max-width: min(90vw, 400px);
    height: 100vh;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    border-left: 2px solid #ffd700;
    box-shadow: -4px 0 20px rgba(0, 0, 0, 0.5);
    z-index: 1000;
    transform: translateX(100%);
    transition: transform 0.3s ease-in-out;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .control-panel.open {
    transform: translateX(0);
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 2px solid #ffd700;
    background: rgba(0, 0, 0, 0.3);
  }

  .panel-header h2 {
    margin: 0;
    font-size: clamp(1.125rem, 2vw, 1.5rem);
    color: #ffd700;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: #ffd700;
    font-size: clamp(1.125rem, 2vw, 1.5rem);
    cursor: pointer;
    padding: 0.5rem;
    line-height: 1;
    transition: transform 0.2s;
  }

  .close-btn:hover {
    transform: rotate(90deg);
  }

  .panel-content {
    padding: clamp(1rem, 1.5vh, 1.5rem);
  }

  .panel-section {
    margin-bottom: clamp(1rem, 1.5vh, 1.5rem);
    padding-bottom: clamp(0.75rem, 1vh, 1rem);
    border-bottom: 1px solid rgba(255, 215, 0, 0.2);
  }

  .panel-section:last-child {
    border-bottom: none;
  }

  .panel-section h3 {
    margin: 0 0 clamp(0.5rem, 1vh, 0.75rem) 0;
    font-size: clamp(1rem, 1.3vw, 1.2rem);
    color: #ffd700;
  }

  .button-group {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .btn-primary,
  .btn-secondary,
  .btn-danger {
    padding: 0.75rem 1rem;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
  }

  .btn-primary {
    background: linear-gradient(135deg, #c41e3a 0%, #8b1538 100%);
    color: white;
  }

  .btn-primary:hover {
    transform: translateX(4px);
    box-shadow: 0 4px 12px rgba(196, 30, 58, 0.4);
  }

  .btn-secondary {
    background: rgba(255, 255, 255, 0.1);
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .btn-secondary:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: translateX(4px);
  }

  .btn-danger {
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
    color: white;
  }

  .btn-danger:hover {
    transform: translateX(4px);
    box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);
  }

  /* Player List */
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
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .player-item.disconnected {
    opacity: 0.5;
  }

  .player-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
  }

  .player-avatar-small {
    font-size: clamp(1.25rem, 1.8vw, 1.5rem);
  }

  .player-details {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .player-name-small {
    font-weight: bold;
    color: white;
    font-size: clamp(0.875rem, 1.1vw, 1rem);
  }

  .player-score-small {
    font-size: clamp(0.75rem, 1vw, 0.875rem);
    color: rgba(255, 255, 255, 0.7);
  }

  .disconnected-badge {
    margin-left: 0.5rem;
  }

  .kick-btn {
    background: rgba(220, 38, 38, 0.2);
    border: 1px solid rgba(220, 38, 38, 0.5);
    color: #ef4444;
    padding: 0.5rem;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .kick-btn:hover {
    background: rgba(220, 38, 38, 0.4);
    transform: scale(1.1);
  }

  .host-badge {
    background: rgba(255, 215, 0, 0.2);
    color: #ffd700;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: clamp(0.65rem, 0.9vw, 0.75rem);
    font-weight: bold;
  }

  /* Room Info */
  .room-info-panel {
    margin-top: 1rem;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 8px;
  }

  .room-info-panel p {
    margin: 0.5rem 0;
    font-size: clamp(0.75rem, 1vw, 0.875rem);
    color: rgba(255, 255, 255, 0.8);
  }

  .room-info-panel code {
    display: block;
    margin-top: 0.5rem;
    padding: 0.5rem;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 4px;
    font-size: clamp(0.65rem, 0.9vw, 0.75rem);
    word-break: break-all;
    color: #ffd700;
  }

  .join-url {
    font-size: clamp(0.6rem, 0.8vw, 0.7rem) !important;
  }

  /* Status Info */
  .status-info p {
    margin: 0.5rem 0;
    color: rgba(255, 255, 255, 0.8);
  }

  .paused-indicator {
    color: #ffd700 !important;
    font-weight: bold;
  }

  /* Leaderboard Tabs */
  .leaderboard-tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .tab-btn {
    flex: 1;
    padding: 0.5rem;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    transition: all 0.2s;
  }

  .tab-btn.active {
    background: rgba(255, 215, 0, 0.2);
    border-color: #ffd700;
    color: #ffd700;
    font-weight: bold;
  }

  .tab-btn:hover {
    background: rgba(255, 255, 255, 0.15);
  }

  /* Mobile Responsive */
  @media (max-width: 768px) {
    .control-panel {
      width: 100vw;
      max-width: 100vw;
    }

    .control-toggle {
      top: 0.5rem;
      right: 0.5rem;
      width: 44px;
      height: 44px;
    }
  }
</style>

