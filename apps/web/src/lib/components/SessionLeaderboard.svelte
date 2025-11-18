<script lang="ts">
  import { socket } from '$lib/socket';
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n';

  export let roomCode: string;

  let sessionLeaderboard: Array<{
    playerName: string;
    totalScore: number;
  }> = [];
  let loading = false;
  let error = '';

  function loadSessionLeaderboard() {
    if (!$socket) return;
    
    loading = true;
    error = '';
    
    $socket.emit('get_session_leaderboard', roomCode, (response: any) => {
      loading = false;
      if (response.success) {
        sessionLeaderboard = response.leaderboard || [];
      } else {
        error = response.error || t('leaderboard.errors.failedLoad');
      }
    });
  }

  onMount(() => {
    loadSessionLeaderboard();
    
    // Refresh periodically
    const interval = setInterval(() => {
      loadSessionLeaderboard();
    }, 5000);
    
    return () => clearInterval(interval);
  });
</script>

<div class="session-leaderboard">
  <div class="leaderboard-header">
    <h3>📊 {t('leaderboard.session')}</h3>
    <button on:click={loadSessionLeaderboard} class="refresh-btn" disabled={loading}>
      {loading ? '⏳' : '🔄'}
    </button>
  </div>

  {#if error}
    <div class="error-message">{error}</div>
  {:else if loading}
    <div class="loading">{t('common.status.loading')}</div>
  {:else if sessionLeaderboard.length === 0}
    <div class="empty">{t('leaderboard.noData')}</div>
  {:else}
    <div class="leaderboard-list">
      {#each sessionLeaderboard.slice(0, 20) as player, i}
        <div class="leaderboard-entry" class:top={i < 3}>
          <span class="rank">
            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
          </span>
          <span class="name">{player.playerName}</span>
          <span class="score">{player.totalScore.toLocaleString()}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .session-leaderboard {
    background: rgba(0, 0, 0, 0.3);
    border-radius: 1rem;
    padding: 1.5rem;
    max-height: 500px;
    overflow-y: auto;
  }

  .leaderboard-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .leaderboard-header h3 {
    font-size: 1.5rem;
    font-weight: bold;
    margin: 0;
  }

  .refresh-btn {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 0.5rem;
    padding: 0.5rem;
    cursor: pointer;
    font-size: 1.25rem;
  }

  .refresh-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.2);
  }

  .leaderboard-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .leaderboard-entry {
    display: grid;
    grid-template-columns: 3rem 1fr auto;
    gap: 1rem;
    align-items: center;
    padding: 0.75rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 0.5rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .leaderboard-entry.top {
    background: linear-gradient(90deg, rgba(255, 215, 0, 0.2), rgba(255, 215, 0, 0.05));
    border-color: rgba(255, 215, 0, 0.5);
  }

  .rank {
    font-weight: bold;
    font-size: 1.25rem;
  }

  .name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .score {
    font-weight: bold;
    color: #ffd700;
    text-align: right;
  }

  .error-message,
  .loading,
  .empty {
    text-align: center;
    padding: 2rem;
    color: rgba(255, 255, 255, 0.6);
  }
</style>

