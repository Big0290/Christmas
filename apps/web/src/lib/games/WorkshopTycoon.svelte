<script lang="ts">
  import { socket, gameState } from '$lib/socket';
  import { GameState } from '@christmas/core';

  $: state = $gameState?.state;
  $: resources = $gameState?.playerResources?.[$socket?.id] || 0;
  $: production = $gameState?.playerProduction?.[$socket?.id] || 1;
  $: upgrades = $gameState?.availableUpgrades || [];

  function buyUpgrade(upgradeId: string) {
    $socket.emit('workshop_upgrade', upgradeId);
  }
</script>

<div class="workshop-container">
  {#if !state}
    <div class="loading-overlay">
      <div class="text-6xl mb-4 animate-spin">⏳</div>
      <p class="text-xl text-white/70">Loading game...</p>
    </div>
  {:else if state === GameState.STARTING}
    <div class="countdown-overlay">
      <div class="text-8xl mb-4">🏭</div>
      <h1 class="text-4xl font-bold">Get Ready!</h1>
      <p class="text-xl text-white/70 mt-2">Starting soon...</p>
    </div>
  {:else if state === GameState.PLAYING}
    <div class="workshop-card">
      <div class="stats-bar">
        <div class="stat">
          <span class="stat-label">Resources</span>
          <span class="stat-value">🎁 {Math.floor(resources)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Production</span>
          <span class="stat-value">⚡ {production.toFixed(1)}/s</span>
        </div>
      </div>

      <h2 class="section-title">🛠️ Upgrades</h2>

      <div class="upgrades-list">
        {#each upgrades as upgrade}
          <button
            on:click={() => buyUpgrade(upgrade.id)}
            disabled={resources < upgrade.cost}
            class="upgrade-btn"
          >
            <div class="upgrade-icon">{upgrade.icon || '🏭'}</div>
            <div class="upgrade-info">
              <div class="upgrade-name">{upgrade.name}</div>
              <div class="upgrade-cost">💰 {upgrade.cost}</div>
            </div>
            {#if upgrade.owned > 0}
              <div class="upgrade-owned">×{upgrade.owned}</div>
            {/if}
          </button>
        {/each}
      </div>
    </div>
  {:else if state === GameState.GAME_END}
    <div class="game-end">
      <div class="text-8xl mb-6">🏆</div>
      <h1 class="text-4xl font-bold mb-4">Workshop Complete!</h1>
      <div class="final-score">
        <span class="score-label">Final Resources:</span>
        <span class="score-value">🎁 {Math.floor(resources)}</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .workshop-container {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .workshop-card {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .stats-bar {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .stat {
    background: rgba(255, 255, 255, 0.1);
    padding: 1rem;
    border-radius: 1rem;
    text-align: center;
  }

  .stat-label {
    display: block;
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.7);
    margin-bottom: 0.5rem;
  }

  .stat-value {
    display: block;
    font-size: 1.5rem;
    font-weight: bold;
  }

  .section-title {
    font-size: 1.5rem;
    font-weight: bold;
    text-align: center;
  }

  .upgrades-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .upgrade-btn {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: rgba(15, 134, 68, 0.2);
    border: 2px solid #0f8644;
    border-radius: 1rem;
    text-align: left;
    transition: all 0.2s;
  }

  .upgrade-btn:active:not(:disabled) {
    transform: scale(0.98);
    background: rgba(15, 134, 68, 0.3);
  }

  .upgrade-btn:disabled {
    opacity: 0.5;
  }

  .upgrade-icon {
    font-size: 2rem;
  }

  .upgrade-info {
    flex: 1;
  }

  .upgrade-name {
    font-weight: bold;
    margin-bottom: 0.25rem;
  }

  .upgrade-cost {
    font-size: 0.875rem;
    color: #ffd700;
  }

  .upgrade-owned {
    font-size: 1.25rem;
    font-weight: bold;
    color: #ffd700;
  }

  .loading-overlay, .countdown-overlay {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
  }

  .game-end {
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

  .final-score {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 2rem;
  }

  .score-label {
    font-size: 1.25rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .score-value {
    font-size: 2.5rem;
    font-weight: bold;
    color: #ffd700;
  }
</style>
