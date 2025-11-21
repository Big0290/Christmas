<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import { playSound } from '$lib/audio';

  const roomCode = $page.params.code;
  let hasHostToken = false;

  onMount(() => {
    // Verify host has valid token
    if (browser) {
      const hostToken = localStorage.getItem('christmas_hostToken');
      const savedRoomCode = localStorage.getItem('christmas_roomCode');
      hasHostToken = !!(hostToken && savedRoomCode === roomCode);
      
      if (!hasHostToken) {
        // Redirect to room page if not a valid host
        goto(`/room/${roomCode}`);
      }
    }
  });

  function selectMode(mode: 'control' | 'display') {
    playSound('click');
    if (browser) {
      // Store selected mode in sessionStorage to verify user came from mode selector
      const modeValue = mode === 'control' ? 'host-control' : 'host-display';
      sessionStorage.setItem(`host_mode_${roomCode}`, modeValue);
    }
    if (mode === 'control') {
      goto(`/room/${roomCode}/control?role=host-control`);
    } else {
      goto(`/room/${roomCode}/display?role=host-display`);
    }
  }
</script>

<svelte:head>
  <title>{t('host.modeSelector.title', { code: roomCode })} | {t('home.title')}</title>
</svelte:head>

{#if hasHostToken}
  <div class="mode-selector-page">
    <div class="mode-selector-container">
      <div class="header-section">
        <h1 class="main-title">🎄 {t('host.modeSelector.title', { code: roomCode }) || 'Choose Host Mode'}</h1>
        <div class="room-code-display">
          <span class="room-code-label">{t('common.label.roomCode') || 'Room Code'}:</span>
          <span class="room-code-value">{roomCode}</span>
        </div>
      </div>

      <div class="modes-grid">
        <button class="mode-card control-mode" on:click={() => selectMode('control')}>
          <div class="mode-icon">🎮</div>
          <h2 class="mode-title">{t('host.modeSelector.controllerMode') || 'Controller Mode'}</h2>
          <p class="mode-description">
            {t('host.modeSelector.controllerDescription') || 'Full controls to start games, manage players, and control gameplay'}
          </p>
          <div class="mode-features">
            <div class="feature-item">✓ Start & control games</div>
            <div class="feature-item">✓ Manage players</div>
            <div class="feature-item">✓ Game settings</div>
          </div>
        </button>

        <button class="mode-card display-mode" on:click={() => selectMode('display')}>
          <div class="mode-icon">📺</div>
          <h2 class="mode-title">{t('host.modeSelector.displayMode') || 'Display Mode'}</h2>
          <p class="mode-description">
            {t('host.modeSelector.displayDescription') || 'Fullscreen projector view - perfect for TV or projector display'}
          </p>
          <div class="mode-features">
            <div class="feature-item">✓ Fullscreen display</div>
            <div class="feature-item">✓ Real-time updates</div>
            <div class="feature-item">✓ No controls</div>
          </div>
        </button>
      </div>
    </div>
  </div>
{:else}
  <div class="loading-page">
    <div class="loading-spinner">⏳</div>
    <p>{t('common.status.loading') || 'Loading...'}</p>
  </div>
{/if}

<style>
  .mode-selector-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #0a1a2e 0%, #1a2a4e 30%, #2a3a6e 60%, #1a2a4e 100%);
    background-image: 
      radial-gradient(circle at 20% 30%, rgba(255, 255, 255, 0.1) 0%, transparent 50%),
      radial-gradient(circle at 80% 70%, rgba(173, 216, 230, 0.15) 0%, transparent 50%),
      radial-gradient(circle at 50% 50%, rgba(176, 224, 230, 0.1) 0%, transparent 50%);
    padding: 2rem;
    position: relative;
    overflow: hidden;
  }

  .mode-selector-page::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-image: 
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Cpath d='M50 0 L55 20 L75 15 L60 30 L80 40 L50 35 L50 50 L35 50 L40 30 L20 40 L30 25 L15 20 L35 15 Z' fill='rgba(255,255,255,0.03)'/%3E%3C/svg%3E");
    background-size: 200px 200px;
    animation: snow-drift 20s linear infinite;
    pointer-events: none;
    opacity: 0.6;
  }

  @keyframes snow-drift {
    0% { transform: translateY(0) translateX(0); }
    100% { transform: translateY(100vh) translateX(50px); }
  }

  .mode-selector-container {
    max-width: 1200px;
    width: 100%;
    z-index: 1;
    position: relative;
  }

  .header-section {
    text-align: center;
    margin-bottom: 3rem;
  }

  .main-title {
    font-size: clamp(2rem, 5vw, 3.5rem);
    font-weight: bold;
    color: #ffd700;
    text-shadow: 
      0 0 20px rgba(255, 215, 0, 0.8),
      0 0 40px rgba(255, 215, 0, 0.6),
      2px 2px 8px rgba(0, 0, 0, 0.5);
    margin-bottom: 1.5rem;
    filter: drop-shadow(0 0 10px rgba(255, 215, 0, 0.4));
  }

  .room-code-display {
    display: inline-flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem 2rem;
    background: rgba(0, 0, 0, 0.4);
    border: 2px solid #ffd700;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4), 0 0 30px rgba(255, 215, 0, 0.3);
    backdrop-filter: blur(10px);
  }

  .room-code-label {
    font-size: 1.1rem;
    color: rgba(255, 255, 255, 0.8);
    text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.5);
  }

  .room-code-value {
    font-size: 1.5rem;
    font-weight: bold;
    color: #ffd700;
    text-shadow: 0 0 10px rgba(255, 215, 0, 0.8);
    letter-spacing: 4px;
    font-family: 'Courier New', monospace;
  }

  .modes-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: 2rem;
    margin-top: 2rem;
  }

  .mode-card {
    background: linear-gradient(135deg, rgba(196, 30, 58, 0.9) 0%, rgba(15, 134, 68, 0.9) 50%, rgba(15, 52, 96, 0.9) 100%);
    border: 3px solid #ffd700;
    border-radius: 20px;
    padding: 3rem 2rem;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4), 0 0 40px rgba(255, 215, 0, 0.2);
    backdrop-filter: blur(10px);
    text-align: center;
    position: relative;
    overflow: hidden;
  }

  .mode-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: repeating-linear-gradient(
      45deg,
      transparent,
      transparent 20px,
      rgba(255, 215, 0, 0.05) 20px,
      rgba(255, 215, 0, 0.05) 22px
    );
    pointer-events: none;
    opacity: 0.5;
  }

  .mode-card:hover {
    transform: translateY(-10px) scale(1.02);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5), 0 0 60px rgba(255, 215, 0, 0.4);
    border-color: #ffed4e;
  }

  .mode-card:active {
    transform: translateY(-5px) scale(1.01);
  }

  .control-mode {
    background: linear-gradient(135deg, rgba(15, 134, 68, 0.95) 0%, rgba(10, 93, 46, 0.95) 100%);
  }

  .display-mode {
    background: linear-gradient(135deg, rgba(15, 52, 96, 0.95) 0%, rgba(10, 35, 64, 0.95) 100%);
  }

  .mode-icon {
    font-size: 5rem;
    margin-bottom: 1.5rem;
    filter: drop-shadow(0 0 20px rgba(255, 215, 0, 0.6));
    animation: float 3s ease-in-out infinite;
  }

  @keyframes float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-10px); }
  }

  .mode-title {
    font-size: clamp(1.5rem, 3vw, 2rem);
    font-weight: bold;
    color: #ffd700;
    text-shadow: 
      0 0 15px rgba(255, 215, 0, 0.8),
      2px 2px 6px rgba(0, 0, 0, 0.5);
    margin-bottom: 1rem;
  }

  .mode-description {
    font-size: 1.1rem;
    color: rgba(255, 255, 255, 0.9);
    text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.5);
    margin-bottom: 1.5rem;
    line-height: 1.6;
  }

  .mode-features {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: 2rem;
    text-align: left;
  }

  .feature-item {
    font-size: 1rem;
    color: rgba(255, 255, 255, 0.85);
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
    padding-left: 1rem;
  }

  .loading-page {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #0a1a2e 0%, #1a2a4e 100%);
    color: white;
  }

  .loading-spinner {
    font-size: 3rem;
    animation: spin 1s linear infinite;
    margin-bottom: 1rem;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @media (max-width: 768px) {
    .modes-grid {
      grid-template-columns: 1fr;
      gap: 1.5rem;
    }

    .mode-card {
      padding: 2rem 1.5rem;
    }

    .main-title {
      font-size: 2rem;
    }
  }
</style>

