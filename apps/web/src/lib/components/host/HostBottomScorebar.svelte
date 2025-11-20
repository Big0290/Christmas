<script lang="ts">
  export let scoreboard: Array<{ name: string; score: number }>;
  
  // Sort scoreboard by score (descending) for display
  $: sortedScoreboard = [...scoreboard].sort((a, b) => (b.score || 0) - (a.score || 0));
</script>

<div class="bottom-scorebar">
  <div class="scorebar-header">
    <span class="scorebar-title">🏆 {scoreboard.length > 0 ? 'Live Leaderboard' : 'Waiting for players...'}</span>
  </div>
  {#if scoreboard.length > 0}
    <div class="ticker-container">
      <div class="ticker-scroll">
        {#each sortedScoreboard as player, i}
          <div class="ticker-item" class:leader={i === 0}>
            <span class="ticker-rank">
              {#if i === 0}🥇
              {:else if i === 1}🥈
              {:else if i === 2}🥉
              {:else}#{i + 1}
              {/if}
            </span>
            <span class="ticker-name">{player.name}</span>
            <span class="ticker-score">{player.score || 0}</span>
          </div>
        {/each}
        <!-- Duplicate for seamless loop -->
        {#each sortedScoreboard as player, i}
          <div class="ticker-item" class:leader={i === 0}>
            <span class="ticker-rank">
              {#if i === 0}🥇
              {:else if i === 1}🥈
              {:else if i === 2}🥉
              {:else}#{i + 1}
              {/if}
            </span>
            <span class="ticker-name">{player.name}</span>
            <span class="ticker-score">{player.score || 0}</span>
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <div class="empty-scorebar">
      <span class="empty-text">No scores yet</span>
    </div>
  {/if}
</div>

<style>
  .bottom-scorebar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: clamp(60px, 7vh, 70px);
    min-height: clamp(60px, 7vh, 70px);
    max-height: clamp(60px, 7vh, 70px);
    background: linear-gradient(135deg, rgba(196, 30, 58, 0.95) 0%, rgba(15, 134, 68, 0.95) 50%, rgba(15, 52, 96, 0.95) 100%);
    border-top: 2px solid #ffd700;
    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.4), 0 -2px 30px rgba(255, 215, 0, 0.2);
    backdrop-filter: blur(10px);
    z-index: 100;
    overflow: hidden;
  }

  .scorebar-header {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: clamp(24px, 3vh, 28px);
    background: rgba(0, 0, 0, 0.3);
    border-bottom: 2px solid rgba(255, 215, 0, 0.3);
    display: flex;
    align-items: center;
    padding: 0 clamp(1rem, 1.5vw, 1.5rem);
    z-index: 2;
  }

  .scorebar-title {
    font-size: clamp(0.75rem, 1vw, 0.875rem);
    font-weight: bold;
    color: #ffd700;
    text-shadow: 0 0 10px rgba(255, 215, 0, 0.8), 1px 1px 3px rgba(0, 0, 0, 0.8);
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  .ticker-container {
    position: absolute;
    top: 30px;
    left: 0;
    right: 0;
    bottom: 0;
    overflow: hidden;
    mask-image: linear-gradient(
      to right,
      transparent 0%,
      black 5%,
      black 95%,
      transparent 100%
    );
    -webkit-mask-image: linear-gradient(
      to right,
      transparent 0%,
      black 5%,
      black 95%,
      transparent 100%
    );
  }

  .ticker-scroll {
    display: flex;
    align-items: center;
    gap: 2rem;
    height: 100%;
    animation: scroll-left 30s linear infinite;
    will-change: transform;
  }

  @keyframes scroll-left {
    from {
      transform: translateX(0);
    }
    to {
      transform: translateX(-50%);
    }
  }

  .ticker-item {
    display: flex;
    align-items: center;
    gap: clamp(0.75rem, 1vw, 1rem);
    padding: clamp(0.4rem, 0.8vh, 0.5rem) clamp(1rem, 1.5vw, 1.5rem);
    background: rgba(0, 0, 0, 0.3);
    border: 2px solid rgba(255, 215, 0, 0.3);
    border-radius: 12px;
    white-space: nowrap;
    backdrop-filter: blur(5px);
    transition: all 0.3s ease;
    flex-shrink: 0;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .ticker-item.leader {
    background: linear-gradient(135deg, rgba(255, 215, 0, 0.3), rgba(255, 215, 0, 0.1));
    border-color: #ffd700;
    box-shadow: 0 2px 15px rgba(255, 215, 0, 0.5), 0 0 20px rgba(255, 215, 0, 0.3);
    animation: leader-glow 2s ease-in-out infinite;
  }

  @keyframes leader-glow {
    0%, 100% {
      box-shadow: 0 2px 15px rgba(255, 215, 0, 0.5), 0 0 20px rgba(255, 215, 0, 0.3);
    }
    50% {
      box-shadow: 0 2px 20px rgba(255, 215, 0, 0.7), 0 0 30px rgba(255, 215, 0, 0.5);
    }
  }

  .ticker-rank {
    font-size: clamp(1rem, 1.3vw, 1.25rem);
    font-weight: bold;
    min-width: clamp(2rem, 2.5vw, 2.5rem);
    text-align: center;
    filter: drop-shadow(0 0 5px rgba(255, 215, 0, 0.5));
  }

  .ticker-name {
    font-size: clamp(0.875rem, 1.1vw, 1rem);
    font-weight: 600;
    color: #ffffff;
    text-shadow: 0 0 5px rgba(255, 255, 255, 0.3), 1px 1px 3px rgba(0, 0, 0, 0.8);
    min-width: clamp(80px, 10vw, 100px);
    text-align: left;
  }

  .ticker-item.leader .ticker-name {
    color: #ffd700;
    text-shadow: 0 0 10px rgba(255, 215, 0, 0.8), 1px 1px 3px rgba(0, 0, 0, 0.8);
    font-weight: bold;
  }

  .ticker-score {
    font-size: clamp(1rem, 1.3vw, 1.25rem);
    font-weight: bold;
    color: #ffd700;
    text-shadow: 0 0 10px rgba(255, 215, 0, 0.8), 2px 2px 4px rgba(0, 0, 0, 0.8);
    min-width: clamp(2.5rem, 3vw, 3rem);
    text-align: right;
    font-family: 'Courier New', monospace;
  }

  .empty-scorebar {
    position: absolute;
    top: 30px;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .empty-text {
    font-size: 1rem;
    color: rgba(255, 255, 255, 0.5);
    font-style: italic;
    text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.8);
  }

  /* Pause animation on hover for better readability */
  .ticker-container:hover .ticker-scroll {
    animation-play-state: paused;
  }

  /* Responsive Design */
  @media (max-width: 768px) {
    .bottom-scorebar {
      height: 70px;
    }

    .scorebar-header {
      height: 25px;
      padding: 0 1rem;
    }

    .scorebar-title {
      font-size: 0.75rem;
    }

    .ticker-item {
      padding: 0.4rem 1rem;
      gap: 0.75rem;
    }

    .ticker-rank {
      font-size: 1.1rem;
      min-width: 2rem;
    }

    .ticker-name {
      font-size: 0.9rem;
      min-width: 80px;
    }

    .ticker-score {
      font-size: 1.1rem;
      min-width: 2.5rem;
    }

    .ticker-scroll {
      gap: 1.5rem;
      animation-duration: 25s;
    }
  }

  @media (max-width: 480px) {
    .bottom-scorebar {
      height: 60px;
    }

    .scorebar-header {
      height: 22px;
      padding: 0 0.75rem;
    }

    .scorebar-title {
      font-size: 0.7rem;
    }

    .ticker-item {
      padding: 0.3rem 0.75rem;
      gap: 0.5rem;
    }

    .ticker-rank {
      font-size: 1rem;
      min-width: 1.5rem;
    }

    .ticker-name {
      font-size: 0.85rem;
      min-width: 60px;
    }

    .ticker-score {
      font-size: 1rem;
      min-width: 2rem;
    }
  }
</style>

