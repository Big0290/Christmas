<script lang="ts">
  import { beforeUpdate } from 'svelte';
  import type { Player } from '@christmas/core';
  import { socket } from '$lib/socket';

  export let players: Player[] = [];
  export let showScores: boolean = true;
  export let showRanking: boolean = true;
  export let compact: boolean = false;

  let previousPlayerIds = new Set<string>();
  let newPlayerIds = new Set<string>();
  let animationTimeoutIds = new Map<string, ReturnType<typeof setTimeout>>();

  // CRITICAL: Capture previous player IDs BEFORE the update happens
  // This ensures we can detect new players when room_update replaces the entire array
  beforeUpdate(() => {
    if (players && players.length > 0) {
      // Store current player IDs as "previous" before the update
      // This will be compared against the new players array after update
      previousPlayerIds = new Set(players.map(p => p.id));
    }
  });

  // Track new players for animation - runs AFTER beforeUpdate captures previous state
  $: {
    if (players && players.length > 0) {
      const currentPlayerIds = new Set(players.map(p => p.id));
      
      // Clear old animation timeouts for players that are no longer new
      newPlayerIds.forEach(id => {
        if (!currentPlayerIds.has(id)) {
          const timeoutId = animationTimeoutIds.get(id);
          if (timeoutId) {
            clearTimeout(timeoutId);
            animationTimeoutIds.delete(id);
          }
        }
      });
      
      // Find newly joined players by comparing current with previous
      const newlyJoined: string[] = [];
      currentPlayerIds.forEach(id => {
        if (!previousPlayerIds.has(id)) {
          newlyJoined.push(id);
          newPlayerIds.add(id);
          
          // Set a timeout to remove the new-player class after animation completes
          // This prevents the animation from retriggering on subsequent updates
          const timeoutId = setTimeout(() => {
            newPlayerIds.delete(id);
            animationTimeoutIds.delete(id);
            // Force reactivity update
            newPlayerIds = new Set(newPlayerIds);
          }, 1000); // Animation duration is 0.8s, give it 1s to be safe
          
          animationTimeoutIds.set(id, timeoutId);
        }
      });
      
      // Update previousPlayerIds for next comparison
      previousPlayerIds = new Set(currentPlayerIds);
    } else if (players.length === 0) {
      // Clear all when players list is empty
      newPlayerIds.clear();
      animationTimeoutIds.forEach(timeoutId => clearTimeout(timeoutId));
      animationTimeoutIds.clear();
      previousPlayerIds.clear();
    }
  }

  // Sort players by score (descending) if scores are shown
  $: sortedPlayers = showScores && showRanking
    ? [...players].sort((a, b) => (b.score || 0) - (a.score || 0))
    : players;
</script>

<div class="player-list-container" class:compact>
  {#if !players || !Array.isArray(players) || players.length === 0}
    <div class="empty-players">
      <div class="empty-icon">👥</div>
      <p class="empty-text">Waiting for players...</p>
    </div>
  {:else}
    <div class="player-list">
      {#each sortedPlayers as player, index (player.id)}
        {@const playerName = player?.name && typeof player.name === 'string' && player.name.trim().length > 0 ? player.name : `Player ${index + 1}`}
        {@const isCurrentPlayer = player.id === $socket?.id}
        <div 
          class="player-card"
          class:new-player={newPlayerIds.has(player.id)}
          class:current-player={isCurrentPlayer}
          class:top-player={showRanking && index < 3 && (player.score || 0) > 0}
          style="animation-delay: {index * 0.1}s"
        >
          {#if showRanking}
            <div class="player-rank">
              {#if index === 0 && (player.score || 0) > 0}
                <span class="rank-medal">🥇</span>
              {:else if index === 1 && (player.score || 0) > 0}
                <span class="rank-medal">🥈</span>
              {:else if index === 2 && (player.score || 0) > 0}
                <span class="rank-medal">🥉</span>
              {:else}
                <span class="rank-number">#{index + 1}</span>
              {/if}
            </div>
          {/if}
          
          <div class="player-avatar">{player?.avatar || '🎄'}</div>
          
          <div class="player-info">
            <div class="player-name-row">
              <span class="player-name">{playerName}</span>
              {#if isCurrentPlayer}
                <span class="you-badge">You</span>
              {/if}
            </div>
            {#if showScores && player?.score !== undefined}
              <div class="player-score">⭐ {player.score || 0} pts</div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .player-list-container {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .player-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .player-card {
    background: linear-gradient(to right, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05));
    backdrop-filter: blur(10px);
    border: 2px solid rgba(255, 215, 0, 0.3);
    border-radius: 0.75rem;
    padding: 1rem;
    display: flex;
    align-items: center;
    gap: 1rem;
    transition: all 0.3s ease;
    animation: slideIn 0.5s ease-out;
    opacity: 0;
    animation-fill-mode: forwards;
  }

  .player-card:hover {
    background: linear-gradient(to right, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.1));
    border-color: rgba(255, 215, 0, 0.6);
    transform: translateX(5px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }

  .player-card.new-player {
    animation: playerJoin 0.8s ease-out;
    border-color: rgba(255, 215, 0, 0.8);
    box-shadow: 0 0 20px rgba(255, 215, 0, 0.5);
  }

  .player-card.current-player {
    border-color: rgba(255, 215, 0, 0.6);
    box-shadow: 0 0 10px rgba(255, 215, 0, 0.3);
  }

  .player-card.top-player {
    background: linear-gradient(135deg, rgba(255, 215, 0, 0.2), rgba(255, 215, 0, 0.1));
    border-color: rgba(255, 215, 0, 0.5);
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateX(-20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @keyframes playerJoin {
    0% {
      opacity: 0;
      transform: scale(0.8) translateX(-50px);
      box-shadow: 0 0 0 rgba(255, 215, 0, 0);
    }
    50% {
      transform: scale(1.05) translateX(0);
      box-shadow: 0 0 30px rgba(255, 215, 0, 0.8);
    }
    100% {
      opacity: 1;
      transform: scale(1) translateX(0);
      box-shadow: 0 0 20px rgba(255, 215, 0, 0.5);
    }
  }

  .player-rank {
    flex-shrink: 0;
    width: 2rem;
    text-align: center;
  }

  .rank-medal {
    font-size: 1.5rem;
    display: block;
  }

  .rank-number {
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.6);
    font-weight: bold;
  }

  .player-avatar {
    font-size: 2rem;
    flex-shrink: 0;
    animation: bounce 2s ease-in-out infinite;
  }

  @keyframes bounce {
    0%, 100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-5px);
    }
  }

  .player-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .player-name-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .player-name {
    font-size: 1rem;
    font-weight: 600;
    color: white;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .you-badge {
    font-size: 0.75rem;
    background: linear-gradient(135deg, #ffd700, #ffed4e);
    color: black;
    padding: 0.25rem 0.5rem;
    border-radius: 0.5rem;
    font-weight: bold;
    flex-shrink: 0;
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.8;
    }
  }

  .player-score {
    font-size: 0.875rem;
    color: rgba(255, 215, 0, 0.9);
    font-weight: 600;
  }

  .empty-players {
    text-align: center;
    padding: 2rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .empty-icon {
    font-size: 3rem;
    margin-bottom: 0.5rem;
    opacity: 0.5;
  }

  .empty-text {
    font-size: 1rem;
    color: rgba(255, 255, 255, 0.6);
  }

  /* Compact mode */
  .compact .player-card {
    padding: 0.75rem;
    gap: 0.75rem;
  }

  .compact .player-avatar {
    font-size: 1.5rem;
  }

  .compact .player-name {
    font-size: 0.875rem;
  }

  .compact .player-score {
    font-size: 0.75rem;
  }
</style>

