<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { getAudioManager } from '$lib/audio';
  import { t } from '$lib/i18n';
  import type { Track } from '$lib/utils/audio-discovery';

  export let show: boolean = false;
  export let isPlaying: boolean = false;
  export let currentTrack: Track | null = null;
  export let onClose: () => void = () => {};

  let confettiContainer: HTMLElement | null = null;
  let snowflakesContainer: HTMLElement | null = null;
  let sparklesContainer: HTMLElement | null = null;
  let backgroundElement: HTMLElement | null = null;
  let animationFrameId: number | null = null;
  let lastConfettiTime = 0;
  const CONFETTI_COOLDOWN = 500; // Minimum time between confetti bursts (ms)

  // Christmas colors
  const CHRISTMAS_RED = '#C41E3A';
  const CHRISTMAS_GREEN = '#0F8644';
  const CHRISTMAS_GOLD = '#FFD700';

  // Auto-close when music stops
  $: if (show && !isPlaying) {
    onClose();
  }

  onMount(() => {
    if (!browser) return;
  });

  onDestroy(() => {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  });

  $: if (show && browser) {
    // Wait for next tick to ensure DOM is ready
    setTimeout(() => {
      if (backgroundElement) {
        // Initialize with default colors
        const redRgb = hexToRgb(CHRISTMAS_RED);
        const greenRgb = hexToRgb(CHRISTMAS_GREEN);
        const goldRgb = hexToRgb(CHRISTMAS_GOLD);
        
        backgroundElement.style.setProperty('--red-intensity', `rgba(${redRgb.r}, ${redRgb.g}, ${redRgb.b}, 0.4)`);
        backgroundElement.style.setProperty('--green-intensity', `rgba(${greenRgb.r}, ${greenRgb.g}, ${greenRgb.b}, 0.4)`);
        backgroundElement.style.setProperty('--gold-intensity', `rgba(${goldRgb.r}, ${goldRgb.g}, ${goldRgb.b}, 0.4)`);
        backgroundElement.style.setProperty('--overall-intensity', '0.4');
      }
      
      if (snowflakesContainer && animationFrameId === null) {
        createSnowflakes();
        startMusicReactiveEffects();
      }
    }, 50);
  }

  $: if (!show && animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  function createSnowflakes() {
    if (!snowflakesContainer) return;
    
    // Clear existing snowflakes
    snowflakesContainer.innerHTML = '';
    
    // Create 80 snowflakes
    for (let i = 0; i < 80; i++) {
      const snowflake = document.createElement('div');
      snowflake.className = 'snowflake';
      snowflake.textContent = '❄';
      snowflake.style.left = `${Math.random() * 100}%`;
      snowflake.style.animationDelay = `${Math.random() * 5}s`;
      snowflake.style.animationDuration = `${8 + Math.random() * 4}s`;
      snowflake.style.opacity = `${0.4 + Math.random() * 0.4}`;
      snowflake.style.fontSize = `${14 + Math.random() * 10}px`;
      snowflakesContainer.appendChild(snowflake);
    }
  }

  function startMusicReactiveEffects() {
    if (!browser || !backgroundElement) return;

    function animate() {
      if (!show || !backgroundElement) {
        if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
        return;
      }

      const audioManager = getAudioManager();
      const frequencyData = audioManager.getFrequencyData();
      
      // Initialize default colors if no frequency data
      if (!backgroundElement.style.getPropertyValue('--red-intensity')) {
        const redRgb = hexToRgb(CHRISTMAS_RED);
        const greenRgb = hexToRgb(CHRISTMAS_GREEN);
        const goldRgb = hexToRgb(CHRISTMAS_GOLD);
        
        backgroundElement.style.setProperty('--red-intensity', `rgba(${redRgb.r}, ${redRgb.g}, ${redRgb.b}, 0.3)`);
        backgroundElement.style.setProperty('--green-intensity', `rgba(${greenRgb.r}, ${greenRgb.g}, ${greenRgb.b}, 0.3)`);
        backgroundElement.style.setProperty('--gold-intensity', `rgba(${goldRgb.r}, ${goldRgb.g}, ${goldRgb.b}, 0.3)`);
        backgroundElement.style.setProperty('--overall-intensity', '0.3');
      }

      if (frequencyData && isPlaying) {
        // Calculate frequency bands for different colors
        const dataLength = frequencyData.length;
        
        // Low frequencies (bass) - Red
        const lowStart = 0;
        const lowEnd = Math.floor(dataLength * 0.33);
        let lowSum = 0;
        for (let i = lowStart; i < lowEnd; i++) {
          lowSum += frequencyData[i];
        }
        const lowAvg = lowSum / (lowEnd - lowStart);
        const lowIntensity = Math.min(lowAvg / 255, 1);

        // Mid frequencies - Green
        const midStart = lowEnd;
        const midEnd = Math.floor(dataLength * 0.66);
        let midSum = 0;
        for (let i = midStart; i < midEnd; i++) {
          midSum += frequencyData[i];
        }
        const midAvg = midSum / (midEnd - midStart);
        const midIntensity = Math.min(midAvg / 255, 1);

        // High frequencies (treble) - Gold
        const highStart = midEnd;
        const highEnd = dataLength;
        let highSum = 0;
        for (let i = highStart; i < highEnd; i++) {
          highSum += frequencyData[i];
        }
        const highAvg = highSum / (highEnd - highStart);
        const highIntensity = Math.min(highAvg / 255, 1);

        // Overall intensity for general brightness
        let totalSum = 0;
        for (let i = 0; i < frequencyData.length; i++) {
          totalSum += frequencyData[i];
        }
        const overallIntensity = Math.min(totalSum / (frequencyData.length * 255), 1);

        // Update background colors with intensity
        // Base opacity increases with intensity, colors get brighter
        const baseOpacity = 0.3 + (overallIntensity * 0.7); // 0.3 to 1.0
        
        // Calculate color intensities (0 to 1)
        const redIntensity = Math.min(lowIntensity * 1.5, 1);
        const greenIntensity = Math.min(midIntensity * 1.5, 1);
        const goldIntensity = Math.min(highIntensity * 1.5, 1);

        // Convert hex to rgb and apply intensity
        const redRgb = hexToRgb(CHRISTMAS_RED);
        const greenRgb = hexToRgb(CHRISTMAS_GREEN);
        const goldRgb = hexToRgb(CHRISTMAS_GOLD);

        // Apply intensity to colors (make them brighter)
        const redColor = `rgba(${redRgb.r}, ${redRgb.g}, ${redRgb.b}, ${baseOpacity * redIntensity})`;
        const greenColor = `rgba(${greenRgb.r}, ${greenRgb.g}, ${greenRgb.b}, ${baseOpacity * greenIntensity})`;
        const goldColor = `rgba(${goldRgb.r}, ${goldRgb.g}, ${goldRgb.b}, ${baseOpacity * goldIntensity})`;

        // Update CSS custom properties
        backgroundElement.style.setProperty('--red-intensity', redColor);
        backgroundElement.style.setProperty('--green-intensity', greenColor);
        backgroundElement.style.setProperty('--gold-intensity', goldColor);
        backgroundElement.style.setProperty('--overall-intensity', overallIntensity.toString());

        // Trigger confetti on peaks
        const threshold = 100;
        const now = Date.now();
        if (overallIntensity > 0.4 && (now - lastConfettiTime) > CONFETTI_COOLDOWN) {
          burstConfetti();
          lastConfettiTime = now;
        }

        // Update sparkles based on frequency
        updateSparkles(frequencyData);
      } else {
        // No music playing - set to base colors
        if (backgroundElement) {
          const redRgb = hexToRgb(CHRISTMAS_RED);
          const greenRgb = hexToRgb(CHRISTMAS_GREEN);
          const goldRgb = hexToRgb(CHRISTMAS_GOLD);
          
          backgroundElement.style.setProperty('--red-intensity', `rgba(${redRgb.r}, ${redRgb.g}, ${redRgb.b}, 0.2)`);
          backgroundElement.style.setProperty('--green-intensity', `rgba(${greenRgb.r}, ${greenRgb.g}, ${greenRgb.b}, 0.2)`);
          backgroundElement.style.setProperty('--gold-intensity', `rgba(${goldRgb.r}, ${goldRgb.g}, ${goldRgb.b}, 0.2)`);
          backgroundElement.style.setProperty('--overall-intensity', '0.2');
        }
      }

      animationFrameId = requestAnimationFrame(animate);
    }

    animate();
  }

  function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16)
        }
      : { r: 0, g: 0, b: 0 };
  }

  function burstConfetti() {
    if (!confettiContainer) return;
    
    for (let i = 0; i < 60; i++) {
      const piece = document.createElement('span');
      piece.className = 'confetti';
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = randomConfettiColor();
      piece.style.transform = `rotate(${Math.random() * 360}deg)`;
      piece.style.animationDelay = `${Math.random() * 0.3}s`;
      piece.style.animationDuration = `${1.8 + Math.random() * 0.9}s`;
      confettiContainer.appendChild(piece);
      setTimeout(() => piece.remove(), 3000);
    }
  }

  function randomConfettiColor() {
    const colors = [CHRISTMAS_GOLD, CHRISTMAS_RED, CHRISTMAS_GREEN, '#FF3D3D', '#FF8C00', '#E91E63'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  function updateSparkles(frequencyData: Uint8Array) {
    if (!sparklesContainer) return;

    // Clear old sparkles
    const existingSparkles = sparklesContainer.querySelectorAll('.sparkle');
    if (existingSparkles.length > 50) {
      existingSparkles.forEach((sparkle, index) => {
        if (index < existingSparkles.length - 30) {
          sparkle.remove();
        }
      });
    }

    // Add new sparkles based on frequency
    const bands = 8;
    const step = Math.floor(frequencyData.length / bands);
    
    for (let i = 0; i < bands; i++) {
      const value = frequencyData[i * step] / 255;
      if (value > 0.3 && Math.random() > 0.7) {
        const sparkle = document.createElement('div');
        sparkle.className = 'sparkle';
        const emojis = ['⭐', '✨', '🌟', '💫', '🎄'];
        sparkle.textContent = emojis[Math.floor(Math.random() * emojis.length)];
        sparkle.style.left = `${Math.random() * 100}%`;
        sparkle.style.top = `${Math.random() * 100}%`;
        sparkle.style.animationDelay = `${Math.random() * 1}s`;
        sparkle.style.animationDuration = `${1.5 + Math.random() * 1}s`;
        sparkle.style.fontSize = `${16 + value * 20}px`;
        sparkle.style.opacity = `${0.6 + value * 0.4}`;
        sparklesContainer.appendChild(sparkle);
        setTimeout(() => sparkle.remove(), 3000);
      }
    }
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && show) {
      onClose();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if show}
  <div 
    class="visualizer-overlay" 
    bind:this={backgroundElement}
    on:click={handleOverlayClick} 
    role="dialog" 
    aria-modal="true"
  >
    <div class="confetti-layer" bind:this={confettiContainer} aria-hidden="true"></div>
    <div class="snowflakes-layer" bind:this={snowflakesContainer} aria-hidden="true"></div>
    <div class="sparkles-layer" bind:this={sparklesContainer} aria-hidden="true"></div>
    
    <!-- Track Info Overlay -->
    <div class="track-info-overlay" on:click|stopPropagation>
      <!-- Close Button -->
      <button class="close-btn" on:click={onClose} title={t('jukebox.closeVisualizer')} aria-label={t('jukebox.closeVisualizer')}>
        ✕
      </button>

      <!-- Track Info -->
      {#if currentTrack}
        <div class="track-info">
          <div class="track-name-large">{currentTrack.displayName}</div>
          <div class="track-status">{isPlaying ? '♪ Playing' : '⏸ Paused'}</div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .visualizer-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 2000;
    overflow: hidden;
    animation: fadeIn 0.3s ease-in;
    
    /* Default Christmas color background - will be overridden by JS */
    --red-intensity: rgba(196, 30, 58, 0.5);
    --green-intensity: rgba(15, 134, 68, 0.5);
    --gold-intensity: rgba(255, 215, 0, 0.5);
    --overall-intensity: 0.5;
    
    /* Christmas color background with dynamic intensity */
    background: 
      radial-gradient(circle at 20% 30%, var(--red-intensity) 0%, transparent 50%),
      radial-gradient(circle at 80% 50%, var(--green-intensity) 0%, transparent 50%),
      radial-gradient(circle at 50% 80%, var(--gold-intensity) 0%, transparent 50%),
      linear-gradient(135deg, 
        var(--red-intensity) 0%, 
        var(--green-intensity) 50%, 
        var(--gold-intensity) 100%
      ),
      radial-gradient(ellipse at center, 
        rgba(0, 0, 0, calc(0.5 - var(--overall-intensity) * 0.3)) 0%, 
        rgba(0, 0, 0, 0.85) 100%
      );
    background-size: 
      100% 100%,
      100% 100%,
      100% 100%,
      100% 100%,
      100% 100%;
    background-blend-mode: screen, screen, screen, normal, normal;
    transition: background 0.1s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .confetti-layer,
  .snowflakes-layer,
  .sparkles-layer {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    z-index: 1;
  }

  .confetti {
    position: absolute;
    top: -10px;
    width: 10px;
    height: 16px;
    border-radius: 2px;
    opacity: 0.9;
    animation: confetti-fall linear forwards;
  }

  @keyframes confetti-fall {
    0% {
      transform: translateY(-10px) rotate(0deg);
    }
    100% {
      transform: translateY(110vh) rotate(720deg);
    }
  }

  .snowflake {
    position: absolute;
    top: -20px;
    color: rgba(255, 255, 255, 0.9);
    text-shadow: 0 0 6px rgba(255, 255, 255, 0.6);
    animation: snowflake-fall linear infinite;
    pointer-events: none;
  }

  @keyframes snowflake-fall {
    0% {
      transform: translateY(-20px) translateX(0) rotate(0deg);
      opacity: 0.8;
    }
    50% {
      transform: translateY(50vh) translateX(30px) rotate(180deg);
      opacity: 0.6;
    }
    100% {
      transform: translateY(110vh) translateX(-30px) rotate(360deg);
      opacity: 0;
    }
  }

  .sparkle {
    position: absolute;
    animation: sparkle-float linear forwards;
    filter: drop-shadow(0 0 8px rgba(255, 215, 0, 0.8));
    pointer-events: none;
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

  .track-info-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    padding: 2rem;
    z-index: 10;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    pointer-events: none;
  }

  .track-info-overlay > * {
    pointer-events: auto;
  }

  .close-btn {
    position: absolute;
    top: 1rem;
    right: 1rem;
    background: rgba(0, 0, 0, 0.7);
    border: 2px solid rgba(255, 215, 0, 0.8);
    border-radius: 50%;
    width: 3rem;
    height: 3rem;
    color: #ffd700;
    font-size: 1.5rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    backdrop-filter: blur(8px);
    box-shadow: 0 0 20px rgba(255, 215, 0, 0.5);
  }

  .close-btn:hover {
    background: rgba(255, 215, 0, 0.3);
    border-color: #ffd700;
    transform: scale(1.1);
    box-shadow: 0 0 30px rgba(255, 215, 0, 0.8);
  }

  .track-info {
    text-align: center;
    padding: 1.5rem 2rem;
    background: rgba(0, 0, 0, 0.7);
    border: 2px solid rgba(255, 215, 0, 0.6);
    border-radius: 16px;
    backdrop-filter: blur(10px);
    box-shadow: 0 8px 32px rgba(255, 215, 0, 0.4);
    animation: slideDown 0.4s ease-out;
  }

  @keyframes slideDown {
    from {
      transform: translateY(-20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .track-name-large {
    font-size: 2rem;
    font-weight: bold;
    color: #ffd700;
    text-shadow: 
      0 0 15px rgba(255, 215, 0, 0.8),
      0 0 30px rgba(255, 215, 0, 0.6),
      0 0 45px rgba(255, 215, 0, 0.4);
    margin-bottom: 0.5rem;
  }

  .track-status {
    font-size: 1.2rem;
    color: rgba(255, 255, 255, 0.9);
    text-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
  }

  @media (max-width: 768px) {
    .track-info-overlay {
      padding: 1rem;
    }

    .track-name-large {
      font-size: 1.5rem;
    }

    .track-status {
      font-size: 1rem;
    }

    .close-btn {
      width: 2.5rem;
      height: 2.5rem;
      font-size: 1.2rem;
      top: 0.5rem;
      right: 0.5rem;
    }

    .track-info {
      padding: 1rem 1.5rem;
    }
  }
</style>
