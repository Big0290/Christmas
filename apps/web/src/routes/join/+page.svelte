<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { socket, connectSocket, connected } from '$lib/socket';
  import { t } from '$lib/i18n';
  import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';

  let roomCode = '';
  let playerName = '';
  let loading = false;
  let error = '';
  let showAvatarPicker = false;
  let selectedAvatar = '';
  let avatarStyle: 'festive' | 'emoji' = 'festive';
  let socketReady = false;

  const festiveAvatars = [
    '🎅', '🤶', '🎄', '⛄', '🦌', '🎁', '🔔', '⭐', '🕯️', '🎿',
    '🧝', '🧙', '👼', '🎺', '🎻', '🎸', '🥁', '🎷', '🎉', '🎊'
  ];

  const emojiAvatars = [
    '😀', '😁', '😂', '🤣', '😃', '😄', '😅', '😆', '😉', '😊',
    '😋', '😎', '😍', '😘', '🥰', '😗', '😙', '😚', '🙂', '🤗'
  ];

  onMount(() => {
    connectSocket();
    
    // Check if code was provided in URL
    const urlCode = $page.url.searchParams.get('code');
    if (urlCode) {
      roomCode = urlCode.toUpperCase().trim();
    }

    // Load saved avatar preference
    if (browser) {
      const savedAvatar = localStorage.getItem('christmas_preferredAvatar');
      const savedStyle = localStorage.getItem('christmas_avatarStyle');
      if (savedAvatar) {
        selectedAvatar = savedAvatar;
        avatarStyle = (savedStyle as 'festive' | 'emoji') || 'festive';
      }
    }

    // Wait for socket connection
    const checkConnection = setInterval(() => {
      if ($connected && $socket) {
        socketReady = true;
        clearInterval(checkConnection);
        console.log('[Join] Socket connected and ready');
      }
    }, 100);

    // Timeout after 10 seconds
    setTimeout(() => {
      clearInterval(checkConnection);
      if (!$connected) {
        error = t('join.errors.connectionFailed') || 'Failed to connect to server. Please refresh the page.';
        console.error('[Join] Socket connection timeout');
      }
    }, 10000);
  });

  // Watch for connection changes
  $: if ($connected && $socket && !socketReady) {
    socketReady = true;
    console.log('[Join] Socket connected (reactive)');
  }

  async function joinRoom() {
    if (!playerName.trim()) {
      error = t('join.errors.enterName');
      return;
    }

    // Normalize room code: uppercase and trim whitespace
    const normalizedCode = roomCode.trim().toUpperCase();
    
    if (!normalizedCode || normalizedCode.length !== 4) {
      error = t('join.errors.validCode');
      return;
    }

    // Ensure socket is connected
    if (!$socket || !$connected) {
      error = t('join.errors.notConnected') || 'Not connected to server. Please wait...';
      console.error('[Join] Socket not connected, attempting to reconnect...');
      connectSocket();
      
      // Wait a bit for connection
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (!$connected || !$socket) {
        error = t('join.errors.connectionFailed') || 'Failed to connect. Please refresh the page.';
        return;
      }
    }

    loading = true;
    error = '';

    console.log(`[Join] Attempting to join room ${normalizedCode} as ${playerName}`);
    console.log(`[Join] Socket ID: ${$socket?.id}`);
    console.log(`[Join] Socket connected: ${$connected}`);

    $socket.emit('join_room', normalizedCode, playerName, selectedAvatar || undefined, (response: any) => {
      loading = false;
      
      console.log(`[Join] join_room response:`, response);
      
      if (response.success) {
        console.log(`[Join] ✅ Successfully joined room ${normalizedCode}`);
        console.log(`[Join] Response players:`, response.players || []);
        console.log(`[Join] Player count:`, response.players?.length || 0);
        
        if (browser) {
          // Store player info with normalized room code
          localStorage.setItem('christmas_playerName', playerName);
          localStorage.setItem('christmas_role', 'player');
          localStorage.setItem('christmas_roomCode', normalizedCode);
          if (selectedAvatar) {
            localStorage.setItem('christmas_preferredAvatar', selectedAvatar);
            localStorage.setItem('christmas_avatarStyle', avatarStyle);
          }
          if (response.playerToken) {
            localStorage.setItem('christmas_playerToken', response.playerToken);
          }
        }
        
        // Navigate to play page with normalized code
        goto(`/play/${normalizedCode}`);
      } else {
        console.error(`[Join] Failed to join room ${normalizedCode}:`, response.error);
        error = response.error || t('home.errors.failedJoin');
      }
    });
  }
</script>

<svelte:head>
  <title>{t('join.title')} | {t('home.title')}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
</svelte:head>

<div class="min-h-screen flex items-center justify-center p-4 relative">
  <div class="absolute top-4 right-4">
    <LanguageSwitcher />
  </div>
  <div class="card max-w-md w-full space-y-6">
    <div class="text-center">
      <h1 class="text-4xl font-bold mb-2">🎄 {t('join.title')}</h1>
      <p class="text-white/70">
        {t('join.subtitle')}
      </p>
    </div>

    <div class="space-y-4">
      <div>
        <label class="block text-sm font-medium mb-2">{t('join.nameLabel')}</label>
        <input
          type="text"
          placeholder={t('join.namePlaceholder')}
          bind:value={playerName}
          class="input"
          maxlength="20"
          disabled={loading}
          on:keydown={(e) => e.key === 'Enter' && joinRoom()}
        />
      </div>

      <div>
        <label class="block text-sm font-medium mb-2">{t('join.codeLabel')}</label>
        <input
          type="text"
          placeholder={t('join.codePlaceholder')}
          bind:value={roomCode}
          class="input text-center text-2xl tracking-widest"
          maxlength="4"
          disabled={loading}
          on:input={(e) => {
            roomCode = e.currentTarget.value.toUpperCase();
          }}
          on:keydown={(e) => e.key === 'Enter' && joinRoom()}
        />
      </div>

      <div>
        <div class="block text-sm font-medium mb-2">{t('join.avatarLabel')}</div>
        <div class="flex items-center gap-3">
          <button
            on:click={() => showAvatarPicker = !showAvatarPicker}
            class="text-4xl p-3 bg-white/10 hover:bg-white/20 rounded-lg border-2 border-white/20"
            type="button"
          >
            {selectedAvatar || '🎄'}
          </button>
          <div class="flex-1">
            <select bind:value={avatarStyle} class="input text-sm" disabled={loading}>
              <option value="festive">{t('join.avatarStyles.festive')}</option>
              <option value="emoji">{t('join.avatarStyles.emoji')}</option>
            </select>
          </div>
        </div>
        {#if showAvatarPicker}
          <div class="mt-2 grid grid-cols-10 gap-2 max-h-48 overflow-y-auto p-2 bg-white/5 rounded-lg">
            {#each (avatarStyle === 'festive' ? festiveAvatars : emojiAvatars) as avatar}
              <button
                on:click={() => {
                  selectedAvatar = avatar;
                  showAvatarPicker = false;
                }}
                class="text-2xl p-2 rounded {selectedAvatar === avatar ? 'bg-christmas-gold ring-2 ring-christmas-red' : 'bg-white/5 hover:bg-white/10'}"
                type="button"
              >
                {avatar}
              </button>
            {/each}
          </div>
        {/if}
      </div>

      {#if error}
        <div class="bg-red-500/20 border border-red-500 rounded-lg p-3 text-sm">
          {error}
        </div>
      {/if}

      <button
        on:click={joinRoom}
        disabled={loading || !playerName.trim() || roomCode.length !== 4 || !socketReady}
        class="btn-primary w-full text-xl py-4"
      >
        {#if !socketReady}
          {t('common.status.connecting')}...
        {:else if loading}
          {t('join.joining')}
        {:else}
          🎮 {t('join.button')}
        {/if}
      </button>
    </div>

    <div class="text-center text-sm text-white/50">
      <p>{t('join.footer')}</p>
    </div>
  </div>
</div>

<style>
  :global(body) {
    background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
  }
</style>
