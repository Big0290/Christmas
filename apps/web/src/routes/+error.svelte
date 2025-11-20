<script lang="ts">
  import { t } from '$lib/i18n';
  
  // Params are accessed via $page.params in SvelteKit, not as a prop
  
  // Error page props (required by SvelteKit)
  export let status: number;
  export let error: Error | undefined = undefined;
  
  // Provide defaults if not set
  $: statusCode = status ?? 500;
  $: errorMessage = error?.message ?? t('errors.generic');
</script>

<svelte:head>
  <title>{t('errors.generic')} {statusCode}</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center p-4">
  <div class="text-center">
    <h1 class="text-6xl font-bold text-christmas-gold mb-4">{statusCode}</h1>
    <p class="text-2xl text-white mb-8">
      {errorMessage}
    </p>
    <a href="/" class="btn-primary">{t('errors.goHome')}</a>
  </div>
</div>

<style>
  :global(body) {
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  }
</style>

