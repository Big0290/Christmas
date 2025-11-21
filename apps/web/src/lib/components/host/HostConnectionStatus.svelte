<script lang="ts">
  import { connected } from '$lib/socket';
  import { t, language } from '$lib/i18n';
  import ChristmasLoading from '$lib/components/ChristmasLoading.svelte';

  export let error: string = '';
  export let currentState: any = null;

  // Make translations reactive by subscribing to language changes
  // Include $language in each reactive statement so Svelte knows to re-run when language changes
  $: connectingText = $language && t('common.status.connecting');
  $: settingUpText = $language && t('host.settingUp');
  $: loadingText = $language && t('common.status.loading');
  $: waitingGameStateText = $language && t('host.waitingGameState');
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
    <ChristmasLoading message={connectingText || 'Connecting...'} variant="connecting" size="large" />
    <p class="text-white/70 mt-4">{settingUpText}</p>
  </div>
{:else if currentState === undefined || currentState === null}
  <div class="loading-screen">
    <ChristmasLoading message={loadingText || 'Loading...'} size="large" />
    <p class="text-white/70 mt-4">{waitingGameStateText}</p>
  </div>
{/if}

