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

