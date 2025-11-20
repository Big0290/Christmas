<script lang="ts">
  import { goto } from '$app/navigation';
  import { signUp, authLoading } from '$lib/supabase';
  import { socket, connectSocket, connected } from '$lib/socket';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { t } from '$lib/i18n';

  // Params are accessed via $page.params in SvelteKit, not as a prop

  let email = '';
  let password = '';
  let confirmPassword = '';
  let playerName = '';
  let loading = false;
  let error = '';
  let success = '';
  let profileLinked = false;

  onMount(() => {
    connectSocket();
    
    // Load saved player name if available
    if (browser) {
      const savedName = localStorage.getItem('christmas_playerName');
      if (savedName) {
        playerName = savedName;
      }
    }
  });

  async function handleSignup() {
    if (!email.trim() || !password.trim()) {
      error = t('auth.signup.errors.bothRequired');
      return;
    }

    if (!email.includes('@')) {
      error = t('auth.signup.errors.invalidEmail');
      return;
    }

    if (password.length < 6) {
      error = t('auth.signup.errors.passwordLength');
      return;
    }

    if (password !== confirmPassword) {
      error = t('auth.signup.errors.passwordMatch');
      return;
    }

    loading = true;
    error = '';
    success = '';
    profileLinked = false;

    try {
      // Sign up user
      const { user, session } = await signUp(email, password);
      
      if (!user) {
        throw new Error(t('auth.signup.errors.failedCreate'));
      }

      // Wait a moment for the session to be fully initialized
      await new Promise(resolve => setTimeout(resolve, 500));

      success = t('auth.signup.success.created');
      
      // If email confirmation is required, show a message
      if (user && !session) {
        success += ' ' + t('auth.signup.success.checkEmail');
      }

      // If player name is provided, try to link existing profile
      if (playerName.trim() && $socket && $connected) {
        try {
          $socket.emit('link_profile_to_user', playerName.trim(), user.id, (response: any) => {
            if (response && response.success) {
              profileLinked = true;
              success += ' ' + t('auth.signup.success.profileLinked');
            }
            // Redirect after a short delay to allow auth state to sync
            setTimeout(() => {
              goto('/');
            }, 1500);
          });
        } catch (err) {
          console.error('[Signup] Error linking profile:', err);
          // Still redirect even if linking fails
          setTimeout(() => {
            goto('/');
          }, 1500);
        }
      } else {
        // Redirect after a short delay to allow auth state to sync
        setTimeout(() => {
          goto('/');
        }, 1500);
      }
    } catch (err: any) {
      error = err.message || t('auth.signup.errors.failedTryAgain');
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>{t('auth.signup.title')} | {t('home.title')}</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center p-4">
  <div class="card max-w-md w-full space-y-6">
    <div class="text-center">
      <h1 class="text-4xl font-bold mb-2">🎄 {t('auth.signup.title')}</h1>
      <p class="text-white/70">
        {t('auth.signup.subtitle')}
      </p>
    </div>

    <form on:submit|preventDefault={handleSignup} class="space-y-4">
      <div>
        <label for="email" class="block text-sm font-medium mb-2">{t('auth.signup.email')}</label>
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
        <label for="playerName" class="block text-sm font-medium mb-2">{t('auth.signup.playerName')}</label>
        <input
          id="playerName"
          type="text"
          placeholder={t('auth.signup.playerNamePlaceholder')}
          bind:value={playerName}
          class="input"
          disabled={loading || $authLoading}
          maxlength="20"
          autocomplete="username"
        />
        <p class="text-xs text-white/50 mt-1">
          {t('auth.signup.playerNameHint')}
        </p>
      </div>

      <div>
        <label for="password" class="block text-sm font-medium mb-2">{t('auth.signup.password')}</label>
        <input
          id="password"
          type="password"
          placeholder={t('auth.signup.passwordPlaceholder')}
          bind:value={password}
          class="input"
          disabled={loading || $authLoading}
          required
          autocomplete="new-password"
          minlength="6"
        />
      </div>

      <div>
        <label for="confirmPassword" class="block text-sm font-medium mb-2">{t('auth.signup.confirmPassword')}</label>
        <input
          id="confirmPassword"
          type="password"
          placeholder={t('auth.signup.confirmPasswordPlaceholder')}
          bind:value={confirmPassword}
          class="input"
          disabled={loading || $authLoading}
          required
          autocomplete="new-password"
          minlength="6"
        />
      </div>

      {#if error}
        <div class="bg-red-500/20 border border-red-500 rounded-lg p-3 text-sm">
          {error}
        </div>
      {/if}

      {#if success}
        <div class="bg-green-500/20 border border-green-500 rounded-lg p-3 text-sm">
          {success}
        </div>
      {/if}

      <button
        type="submit"
        disabled={loading || $authLoading || !email.trim() || !password.trim() || password !== confirmPassword}
        class="btn-primary w-full text-xl py-4"
      >
        {loading || $authLoading ? t('auth.signup.creating') : `✨ ${t('auth.signup.button')}`}
      </button>
    </form>

    <div class="text-center text-sm text-white/50">
      <p>
        {t('auth.signup.hasAccount')} 
        <a href="/auth/login" class="text-christmas-gold hover:underline">{t('auth.signup.signIn')}</a>
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

