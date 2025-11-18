<script lang="ts">
  import { goto } from '$app/navigation';
  import { socket, connectSocket, connected } from '$lib/socket';
  import { authUser, authLoading, getAccessToken } from '$lib/supabase';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { t, language } from '$lib/i18n';
  import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';

  // Accept params prop to suppress SvelteKit warning
  export const params: Record<string, string> = {};

  let playerName = '';
  let roomCode = '';
  let loading = false;
  let error = '';
  let myRoom: { code: string; hostToken: string } | null = null;
  let loadingMyRoom = false;
  let showAvatarPicker = false;
  let selectedAvatar = '';
  let avatarStyle: 'festive' | 'emoji' = 'festive';

  const festiveAvatars = [
    '🎅', '🤶', '🎄', '⛄', '🦌', '🎁', '🔔', '⭐', '🕯️', '🎿',
    '🧝', '🧙', '👼', '🎺', '🎻', '🎸', '🥁', '🎷', '🎉', '🎊'
  ];

  const emojiAvatars = [
    '😀', '😁', '😂', '🤣', '😃', '😄', '😅', '😆', '😉', '😊',
    '😋', '😎', '😍', '😘', '🥰', '😗', '😙', '😚', '🙂', '🤗'
  ];

  async function checkMyRoom() {
    if (!$authUser || !$socket || !$connected) {
      myRoom = null;
      return;
    }

    loadingMyRoom = true;
    $socket.emit('get_my_room', (response: any) => {
      loadingMyRoom = false;
      if (response && response.success && response.room) {
        myRoom = {
          code: response.room.code,
          hostToken: response.room.hostToken
        };
      } else {
        myRoom = null;
      }
    });
  }

  onMount(() => {
    connectSocket();
    
    // Load saved player name and avatar from localStorage
    if (browser) {
      const savedName = localStorage.getItem('christmas_playerName');
      if (savedName) {
        playerName = savedName;
      }
      const savedAvatar = localStorage.getItem('christmas_preferredAvatar');
      const savedStyle = localStorage.getItem('christmas_avatarStyle');
      if (savedAvatar) {
        selectedAvatar = savedAvatar;
        avatarStyle = (savedStyle as 'festive' | 'emoji') || 'festive';
      }
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
        // Check for user's room when connected
        if ($authUser) {
          checkMyRoom();
        }
      }
    });

    return () => unsubscribe();
  });

  // Check for room when auth state changes
  $: {
    if ($authUser && $connected && $socket) {
      checkMyRoom();
    } else {
      myRoom = null;
    }
  }

  async function goToMyRoom() {
    if (!myRoom) return;
    
    loading = true;
    error = '';

    if (!$socket || !$connected) {
      error = t('home.errors.notConnected');
      connectSocket();
      loading = false;
      return;
    }

    // Get auth token
    const authToken = await getAccessToken();
    if (!authToken) {
      loading = false;
      error = t('home.errors.mustSignIn');
      return;
    }

    // Reconnect host to room
    $socket.emit('reconnect_host', myRoom.code, myRoom.hostToken, $language, (response: any) => {
      loading = false;
      if (response && response.success) {
        if (browser) {
          localStorage.setItem('christmas_playerName', playerName);
          localStorage.setItem('christmas_role', 'host');
          localStorage.setItem('christmas_roomCode', myRoom!.code);
          localStorage.setItem('christmas_hostToken', myRoom!.hostToken);
          if (selectedAvatar) {
            localStorage.setItem('christmas_preferredAvatar', selectedAvatar);
            localStorage.setItem('christmas_avatarStyle', avatarStyle);
          }
        }
        goto(`/room/${myRoom!.code}`);
      } else {
        error = response?.error || t('home.errors.failedReconnect');
      }
    });
  }

  async function createRoom() {
    if (!playerName.trim()) {
      error = t('home.errors.enterName');
      return;
    }

    // Check if socket is connected
    if (!$socket || !$connected) {
      error = t('home.errors.notConnected');
      // Try to reconnect
      connectSocket();
      return;
    }

    loading = true;
    error = '';

    // Set a timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      loading = false;
      error = t('home.errors.timeout');
    }, 10000); // 10 second timeout

    // Get auth token for room creation
    if (browser) {
      const supabase = await import('$lib/supabase');
      const client = supabase.getSupabaseClient();
      if (client) {
        // Refresh session to get latest token
        const { data: { session }, error } = await client.auth.getSession();
        if (error) {
          console.error('[CreateRoom] Error refreshing session:', error);
        }
        if (session) {
          console.log('[CreateRoom] Session refreshed:', {
            userId: session.user.id,
            email: session.user.email,
            emailConfirmed: !!session.user.email_confirmed_at,
          });
        }
      }
    }
    
    const authToken = await getAccessToken();
    if (!authToken) {
      clearTimeout(timeout);
      loading = false;
      error = t('home.errors.mustSignIn');
      setTimeout(() => {
        goto(`/auth/login?redirect=${encodeURIComponent(window.location.pathname)}`);
      }, 2000);
      return;
    }
    
    console.log('[CreateRoom] Sending create_room request with token:', authToken.substring(0, 20) + '...');

    $socket.emit('create_room', playerName, authToken, $language, async (response: any) => {
      clearTimeout(timeout);
      
      if (response && response.success) {
        // Store player name and room code for persistence
        if (browser) {
          localStorage.setItem('christmas_playerName', playerName);
          localStorage.setItem('christmas_role', 'host');
          localStorage.setItem('christmas_roomCode', response.roomCode);
          if (selectedAvatar) {
            localStorage.setItem('christmas_preferredAvatar', selectedAvatar);
            localStorage.setItem('christmas_avatarStyle', avatarStyle);
          }
          if (response.hostToken) {
            localStorage.setItem('christmas_hostToken', response.hostToken);
          }
          sessionStorage.setItem('christmas_playerId', $socket?.id || '');
        }
        
        // Store host status - host is not in players list
        if (response.isHost) {
          sessionStorage.setItem(`host_${response.roomCode}`, 'true');
        }
        
        // Immediately reconnect host to ensure room connection is established
        if ($socket && response.hostToken && response.roomCode) {
          console.log('[CreateRoom] Immediately reconnecting host to room:', response.roomCode);
          $socket.emit('reconnect_host', response.roomCode, response.hostToken, $language, (reconnectResponse: any) => {
            loading = false;
            if (reconnectResponse && reconnectResponse.success) {
              console.log('[CreateRoom] ✅ Host successfully connected to room before navigation');
              goto(`/room/${response.roomCode}`);
            } else {
              console.error('[CreateRoom] ⚠️ Failed to reconnect host, but proceeding anyway:', reconnectResponse?.error);
              goto(`/room/${response.roomCode}`);
            }
          });
        } else {
          loading = false;
          console.warn('[CreateRoom] ⚠️ Missing socket or token, navigating anyway');
          goto(`/room/${response.roomCode}`);
        }
      } else {
        loading = false;
        error = response?.error || t('home.errors.failedCreate');
      }
    });
  }

  async function joinRoom() {
    if (!playerName.trim()) {
      error = t('home.errors.enterName');
      return;
    }

    if (!roomCode.trim() || roomCode.length !== 4) {
      error = t('home.errors.validCode');
      return;
    }

    // Check if socket is connected
    if (!$socket || !$connected) {
      error = t('home.errors.notConnected');
      // Try to reconnect
      connectSocket();
      return;
    }

    loading = true;
    error = '';

    // Set a timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      loading = false;
      error = t('home.errors.timeout');
    }, 10000); // 10 second timeout

    $socket.emit('join_room', roomCode.toUpperCase(), playerName, selectedAvatar || undefined, $language, (response: any) => {
      clearTimeout(timeout);
      loading = false;
      
      if (response && response.success) {
        // Store player name and room code for persistence
        if (browser) {
          localStorage.setItem('christmas_playerName', playerName);
          localStorage.setItem('christmas_role', 'player');
          localStorage.setItem('christmas_roomCode', roomCode.toUpperCase());
          if (selectedAvatar) {
            localStorage.setItem('christmas_preferredAvatar', selectedAvatar);
            localStorage.setItem('christmas_avatarStyle', avatarStyle);
          }
          if (response.playerToken) {
            localStorage.setItem('christmas_playerToken', response.playerToken);
          }
          sessionStorage.setItem('christmas_playerId', $socket?.id || '');
        }
        goto(`/play/${roomCode.toUpperCase()}`);
      } else {
        error = response?.error || t('home.errors.failedJoin');
      }
    });
  }
</script>

<svelte:head>
  <title>{t('home.title')} 🎄</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center p-4 relative">
  <div class="absolute top-4 right-4">
    <LanguageSwitcher />
  </div>
  <div class="card max-w-2xl w-full space-y-8">
    <div class="text-center">
      <h1 class="text-5xl font-bold mb-2">🎄</h1>
      <h2 class="text-3xl font-bold text-christmas-gold mb-2">
        {t('home.title')}
      </h2>
      <p class="text-white/80">
        {t('home.subtitle')}
      </p>
    </div>

    <div class="space-y-4">
      {#if !$connected && $socket}
        <div class="bg-yellow-500/20 border border-yellow-500 rounded-lg p-3 text-sm flex items-center gap-2">
          <span>🟡</span>
          <span>{t('home.connection.connecting')}</span>
        </div>
      {:else if $connected}
        <div class="bg-green-500/20 border border-green-500 rounded-lg p-2 text-xs flex items-center justify-center gap-2">
          <span>🟢</span>
          <span>{t('home.connection.connected')}</span>
        </div>
      {/if}

      <input
        type="text"
        placeholder={t('home.namePlaceholder')}
        bind:value={playerName}
        class="input"
        maxlength="20"
        disabled={loading || !$connected}
      />

      <div>
        <div class="block text-sm font-medium mb-2">{t('home.avatarLabel')}</div>
        <div class="flex items-center gap-3">
          <button
            on:click={() => showAvatarPicker = !showAvatarPicker}
            class="text-4xl p-3 bg-white/10 hover:bg-white/20 rounded-lg border-2 border-white/20"
            type="button"
            disabled={loading}
          >
            {selectedAvatar || '🎄'}
          </button>
          <div class="flex-1">
            <select bind:value={avatarStyle} class="input text-sm" disabled={loading}>
              <option value="festive">{t('home.avatarStyles.festive')}</option>
              <option value="emoji">{t('home.avatarStyles.emoji')}</option>
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

      {#if $authLoading}
        <div class="bg-yellow-500/20 border border-yellow-500 rounded-lg p-3 text-sm text-center">
          {t('home.auth.loadingAuth')}
        </div>
      {:else if !$authUser}
        <div class="bg-blue-500/20 border border-blue-500 rounded-lg p-4 text-center space-y-3">
          <p class="text-sm">🔐 {t('home.auth.signInRequired')}</p>
          <div class="flex gap-2 justify-center">
            <a href="/auth/login" class="btn-primary text-sm px-4 py-2">{t('common.button.signIn')}</a>
            <a href="/auth/signup" class="btn-secondary text-sm px-4 py-2">{t('common.button.signUp')}</a>
          </div>
          <p class="text-xs text-white/60">{t('home.auth.playersCanJoin')}</p>
        </div>
      {:else}
        <!-- Host Section -->
        <div class="space-y-3">
          {#if loadingMyRoom}
            <div class="bg-yellow-500/20 border border-yellow-500 rounded-lg p-3 text-sm text-center">
              {t('home.loadingRoom')}
            </div>
          {:else if myRoom}
            <button
              on:click={goToMyRoom}
              disabled={loading || !playerName.trim() || !$connected}
              class="btn-primary w-full text-lg"
            >
              {loading ? t('home.loading') : `🏠 ${t('home.goToRoom')} (${myRoom.code})`}
            </button>
          {:else}
            <button
              on:click={createRoom}
              disabled={loading || !playerName.trim() || !$connected}
              class="btn-primary w-full text-lg"
            >
              {loading ? t('home.createRoom.creating') : !$connected ? t('home.createRoom.connecting') : `🎮 ${t('home.createRoom.button')}`}
            </button>
          {/if}
          <div class="text-center text-xs text-white/50">
            {t('home.auth.signedInAs')} {$authUser.email}
            <button
              on:click={async () => {
                const { signOut } = await import('$lib/supabase');
                await signOut();
                goto('/');
              }}
              class="ml-2 text-christmas-gold hover:underline"
            >
              {t('common.button.signOut')}
            </button>
          </div>
        </div>
      {/if}

      <div class="relative">
        <div class="absolute inset-0 flex items-center">
          <div class="w-full border-t border-white/30"></div>
        </div>
        <div class="relative flex justify-center text-sm">
          <span class="px-4 bg-white/10 text-white/60">OR</span>
        </div>
      </div>

      <div class="space-y-3">
        <input
          type="text"
          placeholder={t('home.joinRoom.codePlaceholder')}
          bind:value={roomCode}
          class="input text-center text-2xl tracking-widest"
          maxlength="4"
          disabled={loading}
          on:input={(e) => {
            roomCode = e.currentTarget.value.toUpperCase();
          }}
        />

        <button
          on:click={joinRoom}
          disabled={loading || !playerName.trim() || roomCode.length !== 4 || !$connected}
          class="btn-secondary w-full text-lg"
        >
          {loading ? t('home.joinRoom.joining') : !$connected ? t('home.createRoom.connecting') : `🚪 ${t('home.joinRoom.button')}`}
        </button>
      </div>
    </div>

    <div class="text-center text-xs text-white/50 pt-4">
      <p>{t('home.footer')}</p>
    </div>
  </div>
</div>
