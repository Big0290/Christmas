<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { playSoundOnce } from '$lib/audio';
  import SessionLeaderboard from '$lib/components/SessionLeaderboard.svelte';
  import GlobalLeaderboard from '$lib/components/GlobalLeaderboard.svelte';
  import type { GameType } from '@christmas/core';
  import { t } from '$lib/i18n';
  
  export let roomCode: string;
  export let scoreboard: Array<{ name: string; score: number }>;
  export let gameType: GameType | null = null;
  export let isHost: boolean = false;

  let show = false;
  let winnerElement: HTMLElement | null = null;

  onMount(() => {
    // Play end sound and trigger confetti/reveal (use playSoundOnce to prevent duplicates)
    playSoundOnce('gameEnd', 2000);
    // Stagger reveal
    setTimeout(() => (show = true), 150);
    // Fire simple confetti bursts with Christmas colors
    burstConfetti();
    setTimeout(burstConfetti, 800);
    setTimeout(burstConfetti, 1500);
    
    // Create Christmas snowflakes
    createSnowflakes();
    
    // Create Christmas sparkles around winner
    setTimeout(() => {
      if (winnerElement) {
        createWinnerSparkles(winnerElement);
      }
    }, 600);
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
    // Christmas-themed colors
    const colors = ['#FFD700', '#C41E3A', '#0F8644', '#FF3D3D', '#FF8C00', '#E91E63'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  function createSnowflakes() {
    const container = document.querySelector('.snowflakes-layer');
    if (!container) return;
    
    // Create 50 snowflakes
    for (let i = 0; i < 50; i++) {
      const snowflake = document.createElement('div');
      snowflake.className = 'snowflake';
      snowflake.textContent = '❄';
      snowflake.style.left = `${Math.random() * 100}%`;
      snowflake.style.animationDelay = `${Math.random() * 5}s`;
      snowflake.style.animationDuration = `${8 + Math.random() * 4}s`;
      snowflake.style.opacity = `${0.4 + Math.random() * 0.4}`;
      snowflake.style.fontSize = `${12 + Math.random() * 8}px`;
      container.appendChild(snowflake);
    }
  }

  function createWinnerSparkles(winnerContainer: HTMLElement) {
    const container = document.querySelector('.winner-sparkles');
    if (!container) return;
    
    // Create 30 sparkles around winner
    for (let i = 0; i < 30; i++) {
      const sparkle = document.createElement('div');
      sparkle.className = 'christmas-sparkle';
      
      // Random Christmas emojis
      const emojis = ['⭐', '✨', '🎄', '🌟', '💫', '🎅', '❄'];
      sparkle.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      
      // Position around winner (circular pattern centered at 50%, 50% of container)
      const angle = (Math.PI * 2 * i) / 30;
      const radius = 120 + Math.random() * 60;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      
      sparkle.style.left = `calc(50% + ${x}px)`;
      sparkle.style.top = `calc(50% + ${y}px)`;
      sparkle.style.animationDelay = `${Math.random() * 2}s`;
      sparkle.style.animationDuration = `${2 + Math.random() * 1.5}s`;
      sparkle.style.fontSize = `${14 + Math.random() * 8}px`;
      
      container.appendChild(sparkle);
    }
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
  <div class="snowflakes-layer" aria-hidden="true"></div>
  <div class="final-card" class:show={show}>
    <h1 class="title">🎄 {t('finalResults.title')} 🎄</h1>
    <p class="subtitle">{gameType ? t('finalResults.game', { gameType: String(gameType) }) : ''}</p>

    <!-- Podium -->
    {#if scoreboard && scoreboard.length > 0}
      <div class="podium-container">
        <!-- Winner announcement with Christmas emojis -->
        <div class="winner-announcement" class:visible={show}>
          <span class="winner-icon">🎉</span>
          <span class="winner-text">🎄 Winner! 🎄</span>
          <span class="winner-icon">🎉</span>
        </div>
        
        <div class="podium">
          <div class="podium-col second" class:visible={show && scoreboard[1]}>
            <div class="place">🥈</div>
            <div class="name">{scoreboard[1]?.name}</div>
            <div class="score">{scoreboard[1]?.score}</div>
          </div>
          <div class="podium-col first" class:visible={show} bind:this={winnerElement}>
            <div class="christmas-lights">
              <span class="light">💡</span>
              <span class="light">💡</span>
              <span class="light">💡</span>
              <span class="light">💡</span>
              <span class="light">💡</span>
            </div>
            <div class="crown">👑</div>
            <div class="place">🥇</div>
            <div class="name winner">{scoreboard[0].name}</div>
            <div class="score">{scoreboard[0].score}</div>
            <div class="winner-glow"></div>
          </div>
          <div class="winner-sparkles" aria-hidden="true"></div>
          <div class="podium-col third" class:visible={show && scoreboard[2]}>
            <div class="place">🥉</div>
            <div class="name">{scoreboard[2]?.name}</div>
            <div class="score">{scoreboard[2]?.score}</div>
          </div>
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

  .snowflakes-layer {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    z-index: 1;
  }
  .snowflake {
    position: absolute;
    top: -20px;
    color: rgba(255, 255, 255, 0.8);
    text-shadow: 0 0 4px rgba(255, 255, 255, 0.5);
    animation: snowflake-fall linear infinite;
    pointer-events: none;
  }
  @keyframes snowflake-fall {
    0% {
      transform: translateY(-20px) translateX(0) rotate(0deg);
      opacity: 0.8;
    }
    50% {
      transform: translateY(50vh) translateX(20px) rotate(180deg);
      opacity: 0.6;
    }
    100% {
      transform: translateY(110vh) translateX(-20px) rotate(360deg);
      opacity: 0;
    }
  }

  .podium-container {
    position: relative;
    margin: 0 auto 1rem auto;
    overflow: visible;
  }

  .winner-announcement {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
    opacity: 0;
    transform: scale(0.8) translateY(-10px);
    transition: opacity 500ms ease, transform 500ms ease;
  }
  .winner-announcement.visible {
    opacity: 1;
    transform: scale(1) translateY(0);
    animation: winner-bounce 1s ease-in-out infinite;
  }
  @keyframes winner-bounce {
    0%, 100% { transform: scale(1) translateY(0); }
    50% { transform: scale(1.05) translateY(-5px); }
  }
  .winner-icon {
    font-size: 1.5rem;
    animation: spin-slow 3s linear infinite;
  }
  .winner-text {
    font-size: 1.5rem;
    font-weight: bold;
    color: #FFD700;
    text-shadow: 
      0 0 10px rgba(255, 215, 0, 0.8),
      0 0 20px rgba(255, 215, 0, 0.6),
      0 0 30px rgba(255, 215, 0, 0.4);
  }
  @keyframes spin-slow {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
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
  .podium-col.first {
    border-color: rgba(255, 215, 0, 0.6);
    position: relative;
    overflow: visible;
  }
  .podium-col.first.visible {
    animation: winner-pulse 2s ease-in-out infinite;
  }
  @keyframes winner-pulse {
    0%, 100% {
      box-shadow: 0 8px 24px rgba(255, 215, 0, 0.3), 0 0 20px rgba(255, 215, 0, 0.2);
      border-color: rgba(255, 215, 0, 0.6);
    }
    50% {
      box-shadow: 0 12px 32px rgba(255, 215, 0, 0.5), 0 0 40px rgba(255, 215, 0, 0.4);
      border-color: rgba(255, 215, 0, 0.9);
    }
  }
  .podium-col .place { font-size: 1.5rem; margin-bottom: 0.25rem; }
  .podium-col .name { font-weight: 700; }
  .podium-col .name.winner {
    color: #FFD700;
    text-shadow: 
      0 0 10px rgba(255, 215, 0, 0.8),
      0 0 20px rgba(255, 215, 0, 0.6),
      0 0 30px rgba(255, 215, 0, 0.4);
    animation: winner-glow 2s ease-in-out infinite;
  }
  @keyframes winner-glow {
    0%, 100% {
      text-shadow: 
        0 0 10px rgba(255, 215, 0, 0.8),
        0 0 20px rgba(255, 215, 0, 0.6),
        0 0 30px rgba(255, 215, 0, 0.4);
    }
    50% {
      text-shadow: 
        0 0 15px rgba(255, 215, 0, 1),
        0 0 30px rgba(255, 215, 0, 0.8),
        0 0 45px rgba(255, 215, 0, 0.6);
    }
  }
  .podium-col .score { opacity: 0.9; }
  .podium-col .crown {
    font-size: 1.5rem;
    margin-bottom: 0.25rem;
    animation: crown-bounce 1.5s ease-in-out infinite;
    filter: drop-shadow(0 0 8px rgba(255, 215, 0, 0.8));
  }
  @keyframes crown-bounce {
    0%, 100% { transform: translateY(0) rotate(-5deg); }
    25% { transform: translateY(-5px) rotate(5deg); }
    50% { transform: translateY(-8px) rotate(-5deg); }
    75% { transform: translateY(-5px) rotate(5deg); }
  }

  .christmas-lights {
    position: absolute;
    top: -15px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 8px;
    pointer-events: none;
  }
  .christmas-lights .light {
    font-size: 0.9rem;
    animation: light-twinkle 1.5s ease-in-out infinite;
    filter: drop-shadow(0 0 4px rgba(255, 215, 0, 0.8));
  }
  .christmas-lights .light:nth-child(1) { animation-delay: 0s; }
  .christmas-lights .light:nth-child(2) { animation-delay: 0.3s; }
  .christmas-lights .light:nth-child(3) { animation-delay: 0.6s; }
  .christmas-lights .light:nth-child(4) { animation-delay: 0.9s; }
  .christmas-lights .light:nth-child(5) { animation-delay: 1.2s; }
  @keyframes light-twinkle {
    0%, 100% {
      opacity: 0.6;
      transform: scale(0.9);
    }
    50% {
      opacity: 1;
      transform: scale(1.1);
    }
  }

  .winner-sparkles {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 400px;
    height: 400px;
    pointer-events: none;
    z-index: 10;
    overflow: visible;
  }
  .christmas-sparkle {
    position: absolute;
    animation: sparkle-float linear infinite;
    filter: drop-shadow(0 0 6px rgba(255, 215, 0, 0.8));
  }
  @keyframes sparkle-float {
    0% {
      opacity: 0;
      transform: translateY(0) scale(0) rotate(0deg);
    }
    20% {
      opacity: 1;
      transform: translateY(-20px) scale(1) rotate(180deg);
    }
    80% {
      opacity: 1;
      transform: translateY(-40px) scale(1) rotate(360deg);
    }
    100% {
      opacity: 0;
      transform: translateY(-60px) scale(0) rotate(540deg);
    }
  }

  .winner-glow {
    position: absolute;
    inset: -10px;
    border-radius: 12px;
    background: radial-gradient(circle at center, rgba(255, 215, 0, 0.3), transparent 70%);
    pointer-events: none;
    z-index: -1;
    animation: glow-pulse 2s ease-in-out infinite;
  }
  @keyframes glow-pulse {
    0%, 100% {
      opacity: 0.5;
      transform: scale(1);
    }
    50% {
      opacity: 0.8;
      transform: scale(1.1);
    }
  }

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


