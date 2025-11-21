<script lang="ts">
  import { goto } from '$app/navigation';
  import { socket, connectSocket, connected } from '$lib/socket';
  import { authUser, authLoading } from '$lib/supabase';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { t, language } from '$lib/i18n';
  import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';

  let error = '';
  
  // Initialize translation variables
  let titleText = '';
  let subtitleText = '';
  let footerText = '';
  let connectingText = '';
  let connectedText = '';
  let joinTitleText = '';
  let joinDescriptionText = '';
  let hostTitleText = '';
  let hostDescriptionText = '';
  let loadingText = '';
  let signedInAsText = '';

  // Make translations reactive by subscribing to language changes
  // This reactive block runs whenever $language changes and updates all translations
  // Using a reactive statement that explicitly depends on $language
  $: {
    // Force reactivity by referencing $language
    const currentLang = $language;
    if (currentLang) {
      titleText = t('home.title');
      subtitleText = t('home.subtitle');
      footerText = t('home.footer');
      connectingText = t('home.connection.connecting');
      connectedText = t('home.connection.connected');
      joinTitleText = t('home.choice.join.title');
      joinDescriptionText = t('home.choice.join.description');
      hostTitleText = t('home.choice.host.title');
      hostDescriptionText = t('home.choice.host.description');
      loadingText = t('common.status.loading');
      signedInAsText = t('home.auth.signedInAs');
    }
  }

  onMount(() => {
    // Socket is initialized by layout, but landing page is entry point so ensure it's connected
    if (!$socket) {
      connectSocket();
    }

    // Show connection error if socket fails to connect
    const unsubscribe = connected.subscribe((isConnected) => {
      if (!isConnected && $socket && browser) {
        // Give it a moment to connect
        setTimeout(() => {
          if (!$connected) {
            error = t('home.errors.connectionError');
          }
        }, 3000);
      } else if (isConnected) {
        error = ''; // Clear error when connected
      }
    });

    return () => unsubscribe();
  });

  function handleJoin() {
    goto('/join');
  }

  function handleHost() {
    if ($authUser) {
      // User is authenticated, go to room management
      goto('/host/manage');
    } else {
      // User not authenticated, redirect to login with return URL
      goto('/auth/login?redirect=' + encodeURIComponent('/host/manage'));
    }
  }
</script>

<svelte:head>
  <title>{titleText} 🎄</title>
</svelte:head>

<div class="landing-page min-h-screen flex items-center justify-center p-4 relative">
  <!-- Snowflake background animation -->
  <div class="snowflakes" aria-hidden="true">
    {#each Array(50) as _, i}
      <div 
        class="snowflake"
        style="left: {Math.random() * 100}%; animation-duration: {10 + Math.random() * 20}s; animation-delay: {Math.random() * 5}s; font-size: {0.8 + Math.random() * 1.2}rem;"
      >
        ❄
      </div>
    {/each}
  </div>

  <div class="absolute top-4 right-4 z-10">
    <LanguageSwitcher />
  </div>

  <div class="landing-container max-w-4xl w-full z-10 relative">
    <!-- Header -->
    <div class="text-center mb-12">
      <h1 class="text-7xl md:text-8xl font-bold mb-4 animate-bounce">🎄</h1>
      <h2 class="text-4xl md:text-5xl font-bold text-christmas-gold mb-4 drop-shadow-lg">
        {titleText}
      </h2>
      <p class="text-xl md:text-2xl text-white/90">
        {subtitleText}
      </p>
    </div>

    <!-- Connection Status -->
    {#if error}
      <div class="bg-red-500/20 border border-red-500 rounded-lg p-3 text-sm text-center mb-6">
        <span>⚠️</span>
        <span>{error}</span>
      </div>
    {:else if !$connected && $socket}
      <div class="bg-yellow-500/20 border border-yellow-500 rounded-lg p-3 text-sm text-center mb-6">
        <span>🟡</span>
        <span>{connectingText}</span>
      </div>
    {:else if $connected}
      <div class="bg-green-500/20 border border-green-500 rounded-lg p-2 text-xs text-center mb-6">
        <span>🟢</span>
        <span>{connectedText}</span>
      </div>
    {/if}

    <!-- Choice Buttons -->
    <div class="choice-buttons grid md:grid-cols-2 gap-6 mb-8">
      <!-- Join Button -->
      <button
        on:click={handleJoin}
        disabled={!$connected && $socket}
        class="choice-card join-card"
      >
        <div class="choice-icon">🚪</div>
        <h3 class="choice-title">{joinTitleText}</h3>
        <p class="choice-description">{joinDescriptionText}</p>
        <div class="choice-footer">
          <span class="choice-arrow">→</span>
        </div>
      </button>

      <!-- Host Button -->
      <button
        on:click={handleHost}
        disabled={$authLoading || (!$connected && $socket)}
        class="choice-card host-card"
      >
        <div class="choice-icon">🎮</div>
        <h3 class="choice-title">{hostTitleText}</h3>
        <p class="choice-description">{hostDescriptionText}</p>
        <div class="choice-footer">
          {#if $authLoading}
            <span class="text-sm">{loadingText}...</span>
          {:else if $authUser}
            <span class="text-xs text-white/70">{signedInAsText} {$authUser.email}</span>
          {:else}
            <span class="choice-arrow">→</span>
          {/if}
        </div>
      </button>
    </div>

    <!-- Footer -->
    <div class="text-center text-sm text-white/60">
      <p>{footerText}</p>
    </div>
  </div>
</div>

<style>
  .landing-page {
    background: linear-gradient(135deg, #0a1a2e 0%, #1a2a4e 30%, #2a3a6e 60%, #1a2a4e 100%);
    background-image: 
      radial-gradient(circle at 20% 30%, rgba(255, 255, 255, 0.1) 0%, transparent 50%),
      radial-gradient(circle at 80% 70%, rgba(173, 216, 230, 0.15) 0%, transparent 50%),
      radial-gradient(circle at 50% 50%, rgba(176, 224, 230, 0.1) 0%, transparent 50%);
    position: relative;
    overflow: hidden;
  }

  /* Snowflake animation */
  .snowflakes {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 1;
  }

  .snowflake {
    position: absolute;
    color: rgba(255, 255, 255, 0.8);
    font-size: 1.5rem;
    animation: snowfall linear infinite;
    opacity: 0.7;
  }

  @keyframes snowfall {
    0% {
      transform: translateY(-100vh) rotate(0deg);
      opacity: 0;
    }
    10% {
      opacity: 0.7;
    }
    90% {
      opacity: 0.7;
    }
    100% {
      transform: translateY(100vh) rotate(360deg);
      opacity: 0;
    }
  }

  /* Snowflake positioning handled by inline styles */

  .landing-container {
    animation: fadeIn 0.6s ease-in;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .choice-buttons {
    margin-top: 2rem;
  }

  .choice-card {
    background: linear-gradient(135deg, rgba(196, 30, 58, 0.9) 0%, rgba(15, 134, 68, 0.9) 50%, rgba(15, 52, 96, 0.9) 100%);
    border: 3px solid #ffd700;
    border-radius: 24px;
    padding: 3rem 2rem;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4), 0 0 40px rgba(255, 215, 0, 0.2);
    backdrop-filter: blur(10px);
    text-align: center;
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    min-height: 280px;
  }

  .choice-card::before {
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

  .choice-card:hover:not(:disabled) {
    transform: translateY(-10px) scale(1.02);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5), 0 0 60px rgba(255, 215, 0, 0.4);
    border-color: #ffed4e;
  }

  .choice-card:active:not(:disabled) {
    transform: translateY(-5px) scale(1.01);
  }

  .choice-card:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .join-card {
    background: linear-gradient(135deg, rgba(15, 134, 68, 0.95) 0%, rgba(10, 93, 46, 0.95) 100%);
  }

  .host-card {
    background: linear-gradient(135deg, rgba(15, 52, 96, 0.95) 0%, rgba(10, 35, 64, 0.95) 100%);
  }

  .choice-icon {
    font-size: 5rem;
    margin-bottom: 1rem;
    filter: drop-shadow(0 0 20px rgba(255, 215, 0, 0.6));
    animation: float 3s ease-in-out infinite;
  }

  @keyframes float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-10px); }
  }

  .choice-title {
    font-size: clamp(1.5rem, 3vw, 2rem);
    font-weight: bold;
    color: #ffd700;
    text-shadow: 
      0 0 15px rgba(255, 215, 0, 0.8),
      2px 2px 6px rgba(0, 0, 0, 0.5);
    margin-bottom: 1rem;
  }

  .choice-description {
    font-size: 1.1rem;
    color: rgba(255, 255, 255, 0.9);
    text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.5);
    margin-bottom: 1.5rem;
    line-height: 1.6;
    flex: 1;
  }

  .choice-footer {
    width: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    margin-top: auto;
  }

  .choice-arrow {
    font-size: 2rem;
    color: #ffd700;
    text-shadow: 0 0 10px rgba(255, 215, 0, 0.8);
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: translateX(0); }
    50% { opacity: 0.7; transform: translateX(5px); }
  }

  @media (max-width: 768px) {
    .choice-buttons {
      grid-template-columns: 1fr;
      gap: 1.5rem;
    }

    .choice-card {
      padding: 2rem 1.5rem;
      min-height: 240px;
    }

    .choice-icon {
      font-size: 4rem;
    }
  }
</style>
