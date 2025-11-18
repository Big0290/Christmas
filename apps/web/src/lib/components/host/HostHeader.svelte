<script lang="ts">
  import { players, connected } from '$lib/socket';
  import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
  import { t } from '$lib/i18n';

  export let roomCode: string;
  export let isPaused: boolean = false;
  export let round: number = 0;
  export let maxRounds: number = 0;
  export let onReconnect: () => void;
</script>

<div class="host-header">
  <div class="header-left">
    <div class="room-info">
      <div class="room-code-badge">
        <span class="badge-icon">🎄</span>
        <span class="room-code-text">{roomCode}</span>
      </div>
      <div class="player-count-badge">
        <span class="badge-icon">👥</span>
        <span class="player-count-text">{$players.length}</span>
      </div>
      {#if isPaused}
        <div class="paused-badge">
          <span class="badge-icon">⏸️</span>
          <span class="paused-text">{t('host.gameState.paused')}</span>
        </div>
      {/if}
    </div>
    {#if round > 0}
      <div class="round-info">
        <span class="round-label">{t('common.label.round')}</span>
        <span class="round-number">{round}{#if maxRounds > 0} / {maxRounds}{/if}</span>
      </div>
    {/if}
  </div>
  <div class="header-right">
    {#if !$connected}
      <button on:click={onReconnect} class="reconnect-btn">
        <span class="btn-icon">🔄</span>
        <span class="btn-text">{t('host.reconnectHost')}</span>
      </button>
    {/if}
    <div class="language-switcher-wrapper">
      <LanguageSwitcher />
    </div>
  </div>
</div>

<style>
  .host-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 2rem;
    background: linear-gradient(135deg, rgba(196, 30, 58, 0.9) 0%, rgba(15, 134, 68, 0.9) 50%, rgba(15, 52, 96, 0.9) 100%);
    border-bottom: 3px solid #ffd700;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4), 0 0 30px rgba(255, 215, 0, 0.2);
    backdrop-filter: blur(10px);
    position: relative;
    z-index: 100;
  }

  .host-header::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: repeating-linear-gradient(
      90deg,
      transparent,
      transparent 20px,
      rgba(255, 215, 0, 0.05) 20px,
      rgba(255, 215, 0, 0.05) 22px
    );
    pointer-events: none;
    opacity: 0.5;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    flex: 1;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .room-info {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .room-code-badge,
  .player-count-badge,
  .paused-badge {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: rgba(0, 0, 0, 0.4);
    border: 2px solid #ffd700;
    border-radius: 12px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3), 0 0 15px rgba(255, 215, 0, 0.3);
    backdrop-filter: blur(5px);
    transition: all 0.3s ease;
  }

  .room-code-badge:hover,
  .player-count-badge:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4), 0 0 25px rgba(255, 215, 0, 0.5);
    background: rgba(0, 0, 0, 0.5);
  }

  .badge-icon {
    font-size: 1.2rem;
    filter: drop-shadow(0 0 5px rgba(255, 215, 0, 0.5));
  }

  .room-code-text {
    font-size: 1.25rem;
    font-weight: bold;
    color: #ffd700;
    text-shadow: 0 0 10px rgba(255, 215, 0, 0.8), 2px 2px 4px rgba(0, 0, 0, 0.8);
    letter-spacing: 2px;
    font-family: 'Courier New', monospace;
  }

  .player-count-text {
    font-size: 1.1rem;
    font-weight: bold;
    color: #ffffff;
    text-shadow: 0 0 5px rgba(255, 255, 255, 0.5), 1px 1px 3px rgba(0, 0, 0, 0.8);
  }

  .paused-badge {
    background: rgba(220, 38, 38, 0.4);
    border-color: #ff6b6b;
    animation: pulse-paused 2s ease-in-out infinite;
  }

  @keyframes pulse-paused {
    0%, 100% {
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3), 0 0 15px rgba(255, 107, 107, 0.3);
    }
    50% {
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3), 0 0 25px rgba(255, 107, 107, 0.6);
    }
  }

  .paused-text {
    font-size: 0.9rem;
    font-weight: bold;
    color: #ff6b6b;
    text-shadow: 0 0 5px rgba(255, 107, 107, 0.8);
  }

  .round-info {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.5rem 1rem;
    background: rgba(0, 0, 0, 0.3);
    border: 2px solid rgba(255, 215, 0, 0.5);
    border-radius: 12px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
  }

  .round-label {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.7);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 0.25rem;
  }

  .round-number {
    font-size: 1.25rem;
    font-weight: bold;
    color: #ffd700;
    text-shadow: 0 0 10px rgba(255, 215, 0, 0.8);
  }

  .reconnect-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 1.2rem;
    background: linear-gradient(135deg, rgba(15, 134, 68, 0.8), rgba(10, 93, 46, 0.8));
    border: 2px solid #ffd700;
    border-radius: 10px;
    color: white;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3), 0 0 15px rgba(255, 215, 0, 0.2);
    backdrop-filter: blur(5px);
  }

  .reconnect-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4), 0 0 25px rgba(255, 215, 0, 0.4);
    background: linear-gradient(135deg, rgba(15, 134, 68, 1), rgba(10, 93, 46, 1));
  }

  .reconnect-btn:active {
    transform: translateY(0);
  }

  .btn-icon {
    font-size: 1.1rem;
    animation: spin-slow 3s linear infinite;
  }

  @keyframes spin-slow {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .btn-text {
    font-size: 0.9rem;
  }

  .language-switcher-wrapper {
    display: flex;
    align-items: center;
  }

  /* Responsive Design */
  @media (max-width: 768px) {
    .host-header {
      flex-direction: column;
      gap: 1rem;
      padding: 1rem;
    }

    .header-left {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.75rem;
      width: 100%;
    }

    .room-info {
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .header-right {
      width: 100%;
      justify-content: space-between;
    }

    .room-code-text {
      font-size: 1rem;
    }

    .player-count-text {
      font-size: 1rem;
    }
  }
</style>

