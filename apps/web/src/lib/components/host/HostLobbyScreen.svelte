<script lang="ts">
  import { players } from '$lib/socket';
  import { goto } from '$app/navigation';
  import { t } from '$lib/i18n';

  export let roomCode: string;
</script>

<div class="lobby-screen">
  <h1 class="mega-title">🎄 {t('home.title')} 🎄</h1>
  <p class="waiting-text">{t('host.readyToStart')}</p>
  <div class="player-grid">
    {#each $players as player}
      <div class="player-badge">
        <span class="player-avatar">{player.avatar}</span>
        <span class="player-name">{player.name}</span>
      </div>
    {/each}
  </div>
  <div class="lobby-actions">
    <button on:click={() => goto(`/room/${roomCode}`)} class="btn-primary-large">
      🎮 {t('host.selectStartGame')}
    </button>
  </div>
</div>

<style>
  .lobby-screen {
    width: 100%;
    min-height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding: clamp(1rem, 2vh, 2rem);
    box-sizing: border-box;
  }

  .mega-title {
    font-size: clamp(2.5rem, 5vw, 4rem);
    font-weight: bold;
    margin-bottom: clamp(1rem, 2vh, 1.5rem);
    color: #e0f2fe;
    text-shadow: 
      0 0 15px rgba(224, 242, 254, 0.8),
      0 0 30px rgba(173, 216, 230, 0.6),
      4px 4px 8px rgba(0, 0, 0, 0.5);
    filter: drop-shadow(0 0 10px rgba(224, 242, 254, 0.4));
  }

  .waiting-text {
    font-size: clamp(1rem, 2vw, 1.5rem);
    color: rgba(224, 242, 254, 0.8);
    margin-bottom: clamp(1.5rem, 3vh, 2rem);
    text-shadow: 
      0 0 8px rgba(224, 242, 254, 0.4),
      1px 1px 3px rgba(0, 0, 0, 0.5);
  }

  .player-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(clamp(120px, 15vw, 180px), 1fr));
    gap: clamp(0.75rem, 1.5vw, 1rem);
    width: 100%;
    max-width: min(90vw, 1200px);
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: clamp(0.5rem, 1vh, 1rem);
    margin-bottom: clamp(1rem, 2vh, 1.5rem);
    box-sizing: border-box;
    min-height: 0;
  }

  .player-badge {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: clamp(0.5rem, 1vh, 0.75rem);
    padding: clamp(0.75rem, 1.5vh, 1rem);
    background: rgba(255, 255, 255, 0.1);
    border: 2px solid rgba(255, 215, 0, 0.3);
    border-radius: 1rem;
    backdrop-filter: blur(10px);
    transition: all 0.3s ease;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }

  .player-badge:hover {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 215, 0, 0.5);
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
  }

  .player-avatar {
    font-size: clamp(2.5rem, 4vw, 3.5rem);
    filter: drop-shadow(0 0 8px rgba(255, 215, 0, 0.3));
  }

  .player-name {
    font-size: clamp(0.875rem, 1.3vw, 1.125rem);
    font-weight: 600;
    color: #ffffff;
    text-align: center;
    text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.5);
  }

  .lobby-actions {
    margin-top: clamp(1rem, 2vh, 1.5rem);
  }

  .btn-primary-large {
    padding: clamp(0.75rem, 1.5vh, 1rem) clamp(1.5rem, 3vw, 2.5rem);
    font-size: clamp(1rem, 1.8vw, 1.25rem);
    font-weight: bold;
    background: linear-gradient(135deg, #c41e3a 0%, #8b1538 100%);
    color: white;
    border-radius: 0.75rem;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 4px 15px rgba(196, 30, 58, 0.4);
  }

  .btn-primary-large:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(196, 30, 58, 0.6);
  }
</style>

