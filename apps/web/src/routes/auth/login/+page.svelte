<script lang="ts">
  import { goto } from '$app/navigation';
  import { signIn, authLoading } from '$lib/supabase';
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n';

  let email = '';
  let password = '';
  let loading = false;
  let error = '';
  let redirectTo = '';

  onMount(() => {
    // Check for redirect parameter
    const urlParams = new URLSearchParams(window.location.search);
    redirectTo = urlParams.get('redirect') || '/';
  });

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      error = t('auth.login.errors.bothRequired');
      return;
    }

    if (!email.includes('@')) {
      error = t('auth.login.errors.invalidEmail');
      return;
    }

    loading = true;
    error = '';

    try {
      await signIn(email, password);
      // Redirect to home or specified redirect
      goto(redirectTo);
    } catch (err: any) {
      error = err.message || t('auth.login.errors.failed');
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>{t('auth.login.title')} | {t('home.title')}</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center p-4">
  <div class="card max-w-md w-full space-y-6">
    <div class="text-center">
      <h1 class="text-4xl font-bold mb-2">🎄 {t('auth.login.title')}</h1>
      <p class="text-white/70">
        {t('auth.login.subtitle')}
      </p>
    </div>

    <form on:submit|preventDefault={handleLogin} class="space-y-4">
      <div>
        <label for="email" class="block text-sm font-medium mb-2">{t('auth.login.email')}</label>
        <input
          id="email"
          type="email"
          placeholder="your@email.com"
          bind:value={email}
          class="input"
          disabled={loading || $authLoading}
          required
          autocomplete="email"
        />
      </div>

      <div>
        <label for="password" class="block text-sm font-medium mb-2">{t('auth.login.password')}</label>
        <input
          id="password"
          type="password"
          placeholder={t('auth.login.passwordPlaceholder')}
          bind:value={password}
          class="input"
          disabled={loading || $authLoading}
          required
          autocomplete="current-password"
        />
      </div>

      {#if error}
        <div class="bg-red-500/20 border border-red-500 rounded-lg p-3 text-sm">
          {error}
        </div>
      {/if}

      <button
        type="submit"
        disabled={loading || $authLoading || !email.trim() || !password.trim()}
        class="btn-primary w-full text-xl py-4"
      >
        {loading || $authLoading ? t('auth.login.signingIn') : `🔐 ${t('auth.login.button')}`}
      </button>
    </form>

    <div class="text-center text-sm text-white/50">
      <p>
        {t('auth.login.noAccount')} 
        <a href="/auth/signup" class="text-christmas-gold hover:underline">{t('auth.login.signUp')}</a>
      </p>
    </div>

    <div class="text-center text-xs text-white/40">
      <p>{t('home.auth.playersCanJoin')}</p>
    </div>
  </div>
</div>

<style>
  :global(body) {
    background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
  }
</style>

