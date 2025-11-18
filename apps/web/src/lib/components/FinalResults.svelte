<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { playSound } from '$lib/audio';
  import SessionLeaderboard from '$lib/components/SessionLeaderboard.svelte';
  import GlobalLeaderboard from '$lib/components/GlobalLeaderboard.svelte';
  import type { GameType } from '@christmas/core';
  import { t } from '$lib/i18n';
  
  export let roomCode: string;
  export let scoreboard: Array<{ name: string; score: number }>;
  export let gameType: GameType | null = null;
  export let isHost: boolean = false;

  let show = false;

  onMount(() => {
    // Play end sound and trigger confetti/reveal
    playSound('gameEnd');
    // Stagger reveal
    setTimeout(() => (show = true), 150);
    // Fire simple confetti bursts
    burstConfetti();
    setTimeout(burstConfetti, 800);
    setTimeout(burstConfetti, 1500);
  });

  function burstConfetti() {
    const container = document.querySelector('.confetti-layer');
    if (!container) return;
    for (let i = 0; i < 80; i++) {
      const piece = document.createElement('span');
      piece.className = 'confetti';
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = randomConfettiColor();
      piece.style.transform = `rotate(${Math.random() * 360}deg)`;
      piece.style.animationDelay = `${Math.random() * 0.3}s`;
      piece.style.animationDuration = `${1.8 + Math.random() * 0.9}s`;
      container.appendChild(piece);
      setTimeout(() => piece.remove(), 3000);
    }
  }

  function randomConfettiColor() {
    const colors = ['#FFD700', '#FF3D3D', '#2ECC71', '#4DA3FF', '#FF8C00', '#E91E63'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  function startNewGame() {
    goto(`/room/${roomCode}`);
  }

  function returnToLobby() {
    goto(`/room/${roomCode}`);
  }
</script>

<div class="final-overlay">
  <div class="confetti-layer" aria-hidden="true"></div>
  <div class="final-card" class:show={show}>
    <h1 class="title">🏆 {t('finalResults.title')} 🏆</h1>
    <p class="subtitle">{gameType ? t('finalResults.game', { gameType: String(gameType) }) : ''}</p>

    <!-- Podium -->
    {#if scoreboard && scoreboard.length > 0}
      <div class="podium">
        <div class="podium-col second" class:visible={show && scoreboard[1]}>
          <div class="place">🥈</div>
          <div class="name">{scoreboard[1]?.name}</div>
          <div class="score">{scoreboard[1]?.score}</div>
        </div>
        <div class="podium-col first" class:visible={show}>
          <div class="crown">👑</div>
          <div class="place">🥇</div>
          <div class="name winner">{scoreboard[0].name}</div>
          <div class="score">{scoreboard[0].score}</div>
        </div>
        <div class="podium-col third" class:visible={show && scoreboard[2]}>
          <div class="place">🥉</div>
          <div class="name">{scoreboard[2]?.name}</div>
          <div class="score">{scoreboard[2]?.score}</div>
        </div>
      </div>
    {/if}

    <!-- Full ranking -->
    {#if scoreboard && scoreboard.length > 0}
      <div class="ranking">
        {#each scoreboard as player, i}
          <div class="row" class:winner={i === 0} style={`--delay:${i * 60}ms`}>
            <span class="rank">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</span>
            <span class="player">{player.name}</span>
            <span class="points">{player.score}</span>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Leaderboards -->
    <div class="boards">
      <div class="board">
        <h3>📊 {t('leaderboard.session')}</h3>
        <SessionLeaderboard {roomCode} />
      </div>
      <div class="board">
        <h3>🌍 {t('leaderboard.global')}</h3>
        <GlobalLeaderboard {roomCode} />
      </div>
    </div>

    <!-- Actions -->
    <div class="actions">
      {#if isHost}
        <button class="btn primary" on:click={startNewGame}>🚀 {t('finalResults.startNewGame')}</button>
        <button class="btn secondary" on:click={returnToLobby}>🏠 {t('finalResults.returnToLobby')}</button>
      {:else}
        <button class="btn primary" on:click={returnToLobby}>🏠 {t('finalResults.returnToLobby')}</button>
      {/if}
    </div>
  </div>
</div>

<style>
  .final-overlay {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    background: radial-gradient(60% 60% at 50% 40%, rgba(255,255,255,0.06), rgba(0,0,0,0.8));
    z-index: 1000;
    padding: 1.5rem;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-y;
  }
  .confetti-layer {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }
  .confetti {
    position: absolute;
    top: -10px;
    width: 8px;
    height: 14px;
    border-radius: 2px;
    opacity: 0.9;
    animation: fall linear forwards;
  }
  @keyframes fall {
    0% { transform: translateY(-10px) rotate(0deg); }
    100% { transform: translateY(110vh) rotate(720deg); }
  }

  .final-card {
    position: relative;
    width: min(1100px, 100%);
    max-width: 100%;
    background: rgba(0, 0, 0, 0.55);
    border: 2px solid rgba(255, 215, 0, 0.35);
    border-radius: 16px;
    padding: 1.5rem;
    margin: auto;
    transform: translateY(10px);
    opacity: 0;
    transition: opacity 300ms ease, transform 300ms ease;
    backdrop-filter: blur(6px);
    display: flex;
    flex-direction: column;
  }
  .final-card.show {
    opacity: 1;
    transform: translateY(0);
  }
  .title {
    text-align: center;
    font-size: 2rem;
    color: #FFD700;
    margin: 0.25rem 0 0.25rem 0;
    text-shadow: 0 0 12px rgba(255, 215, 0, 0.6);
  }
  .subtitle {
    text-align: center;
    opacity: 0.8;
    margin: 0 0 1rem 0;
  }

  .podium {
    display: grid;
    grid-template-columns: 1fr 1.2fr 1fr;
    gap: 0.75rem;
    align-items: end;
    margin: 0 auto 1rem auto;
    max-width: 680px;
  }
  .podium-col {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 0.75rem;
    text-align: center;
    transform: translateY(8px) scale(0.98);
    opacity: 0;
    transition: transform 300ms ease, opacity 300ms ease, box-shadow 300ms ease;
  }
  .podium-col.visible {
    opacity: 1;
    transform: translateY(0) scale(1);
    box-shadow: 0 8px 24px rgba(255, 215, 0, 0.15);
  }
  .podium-col.first { border-color: rgba(255, 215, 0, 0.4); }
  .podium-col .place { font-size: 1.5rem; margin-bottom: 0.25rem; }
  .podium-col .name { font-weight: 700; }
  .podium-col .name.winner {
    color: #FFD700;
    text-shadow: 0 0 8px rgba(255,215,0,0.5);
  }
  .podium-col .score { opacity: 0.9; }
  .podium-col .crown { font-size: 1.3rem; margin-bottom: 0.25rem; }

  .ranking {
    margin-top: 1rem;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 12px;
    padding: 0.5rem;
    max-height: 30vh;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    flex-shrink: 0;
  }
  .row {
    display: grid;
    grid-template-columns: 64px 1fr 100px;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    opacity: 0;
    transform: translateY(6px);
    animation: reveal 420ms ease forwards;
    animation-delay: var(--delay, 0ms);
    border-bottom: 1px dashed rgba(255,255,255,0.08);
  }
  .row:last-child { border-bottom: 0; }
  .row.winner {
    background: linear-gradient(90deg, rgba(255,215,0,0.12), transparent);
  }
  .rank { text-align: center; }
  .player { font-weight: 600; }
  .points { text-align: right; font-variant-numeric: tabular-nums; }
  @keyframes reveal {
    to { opacity: 1; transform: translateY(0); }
  }

  .boards {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-top: 1rem;
    flex-shrink: 0;
  }
  .board {
    background: rgba(0,0,0,0.35);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 12px;
    padding: 0.75rem;
    max-height: 30vh;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
  }
  .board h3 {
    margin: 0 0 0.5rem 0;
  }

  .actions {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
    margin-top: 1.25rem;
    flex-shrink: 0;
  }
  .btn {
    border: 1px solid rgba(255,255,255,0.15);
    padding: 1rem 1.5rem;
    min-height: 48px;
    border-radius: 10px;
    cursor: pointer;
    transition: transform 120ms ease, background 120ms ease, box-shadow 120ms ease;
    background: rgba(255,255,255,0.06);
    color: #fff;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
    font-size: clamp(0.875rem, 3vw, 1rem);
  }
  .btn.primary {
    border-color: rgba(255,215,0,0.35);
    background: linear-gradient(180deg, rgba(255,215,0,0.25), rgba(255,215,0,0.12));
    box-shadow: 0 6px 16px rgba(255,215,0,0.15);
  }
  .btn.secondary {
    background: rgba(255,255,255,0.06);
  }
  .btn:hover,
  .btn:active {
    transform: translateY(-1px);
  }

  @media (max-width: 900px) {
    .boards { 
      grid-template-columns: 1fr; 
    }
    .ranking { 
      max-height: 25vh; 
    }
    .board {
      max-height: 25vh;
    }
  }

  @media (max-width: 640px) {
    .final-overlay {
      padding: 0.75rem;
      align-items: flex-start;
    }

    .final-card {
      padding: 1rem;
      border-radius: 12px;
      max-height: calc(100vh - 1.5rem);
      margin-top: 0.75rem;
    }

    .title {
      font-size: 1.5rem;
    }

    .podium {
      gap: 0.5rem;
    }

    .podium-col {
      padding: 0.5rem;
    }

    .ranking {
      max-height: 20vh;
    }

    .board {
      max-height: 20vh;
    }

    .row {
      padding: 0.625rem 0.5rem;
      font-size: 0.875rem;
    }

    .actions {
      flex-direction: column;
      gap: 0.5rem;
    }

    .btn {
      width: 100%;
      padding: 1rem;
    }
  }
</style>


