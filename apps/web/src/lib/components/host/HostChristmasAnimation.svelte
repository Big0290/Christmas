<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { playSoundOnce } from '$lib/audio';
  import type { GameType } from '@christmas/core';

  export let roomCode: string;
  export let scoreboard: Array<{ name: string; score: number }>;
  export let gameType: GameType | null = null;

  let countdown = 30;
  let timer: ReturnType<typeof setInterval> | null = null;
  let navigationTimeout: ReturnType<typeof setTimeout> | null = null;
  let show = false;
  let winnerElement: HTMLElement | null = null;

  const winner = scoreboard && scoreboard.length > 0 ? scoreboard[0] : null;

  onMount(() => {
    // Play end sound and trigger animations (use playSoundOnce to prevent duplicates)
    playSoundOnce('gameEnd', 2000);
    
    // Stagger reveal
    setTimeout(() => (show = true), 150);
    
    // Fire confetti bursts
    burstConfetti();
    setTimeout(burstConfetti, 800);
    setTimeout(burstConfetti, 1500);
    
    // Create snowflakes
    createSnowflakes();
    
    // Create sparkles around winner
    setTimeout(() => {
      if (winnerElement) {
        createWinnerSparkles(winnerElement);
      }
    }, 600);

    // Start countdown timer
    timer = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
      }
    }, 1000);

    // Navigate after 30 seconds
    navigationTimeout = setTimeout(() => {
      goto(`/room/${roomCode}`);
    }, 30000);
  });

  onDestroy(() => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (navigationTimeout) {
      clearTimeout(navigationTimeout);
      navigationTimeout = null;
    }
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
</script>

<div class="animation-overlay">
  <div class="confetti-layer" aria-hidden="true"></div>
  <div class="snowflakes-layer" aria-hidden="true"></div>
  
  <div class="animation-content" class:show={show}>
    <!-- Countdown Timer -->
    <div class="countdown-timer">
      <div class="countdown-label">Returning to lobby in</div>
      <div class="countdown-number">{countdown}</div>
      <div class="countdown-unit">seconds</div>
    </div>

    <!-- Winner Announcement -->
    {#if winner}
      <div class="winner-container" bind:this={winnerElement}>
        <div class="winner-announcement" class:visible={show}>
          <span class="winner-icon">🎉</span>
          <span class="winner-text">🎄 Winner! 🎄</span>
          <span class="winner-icon">🎉</span>
        </div>

        <div class="winner-card">
          <div class="winner-sparkles" aria-hidden="true"></div>
          <div class="christmas-lights">
            <span class="light">💡</span>
            <span class="light">💡</span>
            <span class="light">💡</span>
            <span class="light">💡</span>
            <span class="light">💡</span>
          </div>
          <div class="crown">👑</div>
          <div class="winner-name">{winner.name}</div>
          <div class="winner-score">{winner.score} points</div>
          <div class="winner-glow"></div>
        </div>

        <!-- Top 3 Display -->
        {#if scoreboard.length > 1}
          <div class="top-three">
            {#if scoreboard[1]}
              <div class="place-card second">
                <div class="place-icon">🥈</div>
                <div class="place-name">{scoreboard[1].name}</div>
                <div class="place-score">{scoreboard[1].score}</div>
              </div>
            {/if}
            {#if scoreboard[2]}
              <div class="place-card third">
                <div class="place-icon">🥉</div>
                <div class="place-name">{scoreboard[2].name}</div>
                <div class="place-score">{scoreboard[2].score}</div>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .animation-overlay {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: radial-gradient(60% 60% at 50% 40%, rgba(255,255,255,0.06), rgba(0,0,0,0.9));
    z-index: 1000;
    overflow: hidden;
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

  .animation-content {
    position: relative;
    width: min(900px, 95%);
    max-width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2rem;
    transform: translateY(20px);
    opacity: 0;
    transition: opacity 500ms ease, transform 500ms ease;
  }

  .animation-content.show {
    opacity: 1;
    transform: translateY(0);
  }

  .countdown-timer {
    text-align: center;
    padding: 1.5rem 2.5rem;
    background: rgba(0, 0, 0, 0.6);
    border: 2px solid rgba(255, 215, 0, 0.5);
    border-radius: 16px;
    backdrop-filter: blur(8px);
    box-shadow: 0 8px 32px rgba(255, 215, 0, 0.3);
  }

  .countdown-label {
    font-size: 1rem;
    color: rgba(255, 255, 255, 0.8);
    margin-bottom: 0.5rem;
  }

  .countdown-number {
    font-size: 4rem;
    font-weight: bold;
    color: #FFD700;
    text-shadow: 
      0 0 20px rgba(255, 215, 0, 0.8),
      0 0 40px rgba(255, 215, 0, 0.6);
    line-height: 1;
    animation: countdown-pulse 1s ease-in-out infinite;
  }

  @keyframes countdown-pulse {
    0%, 100% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(1.1);
      opacity: 0.9;
    }
  }

  .countdown-unit {
    font-size: 1rem;
    color: rgba(255, 255, 255, 0.7);
    margin-top: 0.5rem;
  }

  .winner-container {
    position: relative;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
  }

  .winner-announcement {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
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
    font-size: 2rem;
    animation: spin-slow 3s linear infinite;
  }

  .winner-text {
    font-size: 2rem;
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

  .winner-card {
    position: relative;
    width: min(500px, 90%);
    padding: 2.5rem 2rem;
    background: rgba(0, 0, 0, 0.7);
    border: 3px solid rgba(255, 215, 0, 0.6);
    border-radius: 20px;
    text-align: center;
    backdrop-filter: blur(10px);
    overflow: visible;
    animation: winner-pulse 2s ease-in-out infinite;
  }

  @keyframes winner-pulse {
    0%, 100% {
      box-shadow: 0 12px 40px rgba(255, 215, 0, 0.4), 0 0 30px rgba(255, 215, 0, 0.3);
      border-color: rgba(255, 215, 0, 0.6);
    }
    50% {
      box-shadow: 0 16px 50px rgba(255, 215, 0, 0.6), 0 0 50px rgba(255, 215, 0, 0.5);
      border-color: rgba(255, 215, 0, 0.9);
    }
  }

  .christmas-lights {
    position: absolute;
    top: -20px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 10px;
    pointer-events: none;
  }

  .christmas-lights .light {
    font-size: 1.2rem;
    animation: light-twinkle 1.5s ease-in-out infinite;
    filter: drop-shadow(0 0 6px rgba(255, 215, 0, 0.8));
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

  .crown {
    font-size: 3rem;
    margin-bottom: 0.5rem;
    animation: crown-bounce 1.5s ease-in-out infinite;
    filter: drop-shadow(0 0 12px rgba(255, 215, 0, 0.8));
  }

  @keyframes crown-bounce {
    0%, 100% { transform: translateY(0) rotate(-5deg); }
    25% { transform: translateY(-8px) rotate(5deg); }
    50% { transform: translateY(-12px) rotate(-5deg); }
    75% { transform: translateY(-8px) rotate(5deg); }
  }

  .winner-name {
    font-size: 2.5rem;
    font-weight: bold;
    color: #FFD700;
    margin: 0.75rem 0 0.5rem 0;
    text-shadow: 
      0 0 15px rgba(255, 215, 0, 0.8),
      0 0 30px rgba(255, 215, 0, 0.6),
      0 0 45px rgba(255, 215, 0, 0.4);
    animation: winner-glow 2s ease-in-out infinite;
  }

  @keyframes winner-glow {
    0%, 100% {
      text-shadow: 
        0 0 15px rgba(255, 215, 0, 0.8),
        0 0 30px rgba(255, 215, 0, 0.6),
        0 0 45px rgba(255, 215, 0, 0.4);
    }
    50% {
      text-shadow: 
        0 0 20px rgba(255, 215, 0, 1),
        0 0 40px rgba(255, 215, 0, 0.8),
        0 0 60px rgba(255, 215, 0, 0.6);
    }
  }

  .winner-score {
    font-size: 1.5rem;
    color: rgba(255, 255, 255, 0.9);
    font-weight: 600;
  }

  .winner-glow {
    position: absolute;
    inset: -15px;
    border-radius: 20px;
    background: radial-gradient(circle at center, rgba(255, 215, 0, 0.4), transparent 70%);
    pointer-events: none;
    z-index: -1;
    animation: glow-pulse 2s ease-in-out infinite;
  }

  @keyframes glow-pulse {
    0%, 100% {
      opacity: 0.6;
      transform: scale(1);
    }
    50% {
      opacity: 0.9;
      transform: scale(1.15);
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

  .top-three {
    display: flex;
    gap: 1rem;
    justify-content: center;
    flex-wrap: wrap;
  }

  .place-card {
    padding: 1rem 1.5rem;
    background: rgba(0, 0, 0, 0.5);
    border: 2px solid rgba(255, 255, 255, 0.2);
    border-radius: 12px;
    text-align: center;
    backdrop-filter: blur(6px);
    min-width: 140px;
  }

  .place-card.second {
    border-color: rgba(192, 192, 192, 0.5);
  }

  .place-card.third {
    border-color: rgba(205, 127, 50, 0.5);
  }

  .place-icon {
    font-size: 2rem;
    margin-bottom: 0.5rem;
  }

  .place-name {
    font-size: 1.1rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
    margin-bottom: 0.25rem;
  }

  .place-score {
    font-size: 1rem;
    color: rgba(255, 255, 255, 0.7);
  }

  @media (max-width: 640px) {
    .animation-content {
      gap: 1.5rem;
    }

    .countdown-number {
      font-size: 3rem;
    }

    .winner-card {
      padding: 2rem 1.5rem;
    }

    .winner-name {
      font-size: 2rem;
    }

    .crown {
      font-size: 2.5rem;
    }

    .top-three {
      flex-direction: column;
      width: 100%;
    }

    .place-card {
      width: 100%;
    }
  }
</style>

