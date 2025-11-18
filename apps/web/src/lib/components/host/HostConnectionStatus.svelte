<script lang="ts">
  import { connected } from '$lib/socket';
  import { t } from '$lib/i18n';

  export let error: string = '';
  export let currentState: any = null;
</script>

{#if error}
  <div class="loading-screen">
    <div class="text-6xl mb-4">⚠️</div>
    <h2 class="text-2xl font-bold mb-2 text-red-400">Connection Error</h2>
    <p class="text-white/70 mb-4">{error}</p>
    <button
      on:click={() => {
        error = '';
        location.reload();
      }}
      class="btn-primary"
    >
      Refresh Page
    </button>
  </div>
{:else if !$connected}
  <div class="loading-screen">
    <div class="text-6xl mb-4 animate-spin">⏳</div>
    <h2 class="text-2xl font-bold mb-2">{t('common.status.connecting')}</h2>
    <p class="text-white/70">{t('host.settingUp')}</p>
  </div>
{:else if currentState === undefined || currentState === null}
  <div class="loading-screen">
    <div class="text-6xl mb-4 animate-spin">⏳</div>
    <h2 class="text-2xl font-bold mb-2">{t('common.status.loading')}</h2>
    <p class="text-white/70">{t('host.waitingGameState')}</p>
  </div>
{/if}

