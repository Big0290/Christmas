<script lang="ts">
  import { goto } from '$app/navigation';
  import { socket, connectSocket, connected } from '$lib/socket';
  import { authUser, authLoading, getAccessToken } from '$lib/supabase';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { t, language } from '$lib/i18n';
  import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
  import LanguageSelectionModal from '$lib/components/LanguageSelectionModal.svelte';

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
  let showLanguageModal = false;
  let pendingJoinResponse: any = null;
  let isRedirecting = false; // Prevent multiple redirect attempts

  const festiveAvatars = [
    '🎅',
    '🤶',
    '🎄',
    '⛄',
    '🦌',
    '🎁',
    '🔔',
    '⭐',
    '🕯️',
    '🎿',
    '🧝',
    '🧙',
    '👼',
    '🎺',
    '🎻',
    '🎸',
    '🥁',
    '🎷',
    '🎉',
    '🎊',
  ];

  const emojiAvatars = [
    '😀',
    '😁',
    '😂',
    '🤣',
    '😃',
    '😄',
    '😅',
    '😆',
    '😉',
    '😊',
    '😋',
    '😎',
    '😍',
    '😘',
    '🥰',
    '😗',
    '😙',
    '😚',
    '🙂',
    '🤗',
  ];

  // Helper functions to safely check if values are valid non-empty strings
  function isValidPlayerName(name: any): boolean {
    try {
      if (name == null) return false; // null or undefined
      if (typeof name !== 'string') return false;
      const trimmed = name.trim();
      return trimmed.length > 0;
    } catch {
      return false;
    }
  }

  function isValidRoomCode(code: any): boolean {
    try {
      if (code == null) return false; // null or undefined
      if (typeof code !== 'string') return false;
      const trimmed = code.trim();
      return trimmed.length === 4;
    } catch {
      return false;
    }
  }

  async function checkMyRoom(autoRedirect: boolean = true): Promise<void> {
    if (!$authUser || !$socket || !$connected) {
      myRoom = null;
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      loadingMyRoom = true;
      $socket.emit('get_my_room', async (response: any) => {
        loadingMyRoom = false;
        if (response && response.success && response.room) {
          myRoom = {
            code: response.room.code,
            hostToken: response.room.hostToken,
          };

          // Auto-redirect to existing room to prevent multiple room creation
          if (autoRedirect && response.room.isActive && !isRedirecting) {
            isRedirecting = true; // Prevent multiple redirect attempts
            console.log('[Landing] Found existing active room, redirecting:', response.room.code);
            await reconnectAndRedirect(response.room.code, response.room.hostToken);
          }
        } else {
          myRoom = null;
        }
        resolve();
      });
    });
  }

  async function reconnectAndRedirect(roomCode: string, hostToken: string) {
    if (!isValidPlayerName(playerName) && browser) {
      // Try to load saved name
      const savedName = localStorage.getItem('christmas_playerName');
      if (savedName) {
        playerName = String(savedName);
      }
    }

    // Ensure we have a player name
    if (!isValidPlayerName(playerName)) {
      console.warn('[Landing] No player name set, cannot auto-redirect');
      return;
    }

    if (!$socket || !$connected) {
      console.warn('[Landing] Socket not connected, waiting...');
      // Wait a bit for connection
      setTimeout(() => {
        if ($socket && $connected) {
          reconnectAndRedirect(roomCode, hostToken);
        }
      }, 1000);
      return;
    }

    loading = true;
    error = '';

    // Get auth token
    const authToken = await getAccessToken();
    if (!authToken) {
      loading = false;
      error = t('home.errors.mustSignIn');
      return;
    }

    // Reconnect host to room
    $socket.emit('reconnect_host', roomCode, hostToken, $language, (response: any) => {
      loading = false;
      if (response && response.success) {
        if (browser) {
          localStorage.setItem('christmas_playerName', playerName);
          localStorage.setItem('christmas_role', 'host');
          localStorage.setItem('christmas_roomCode', roomCode);
          localStorage.setItem('christmas_hostToken', hostToken);
          if (selectedAvatar) {
            localStorage.setItem('christmas_preferredAvatar', selectedAvatar);
            localStorage.setItem('christmas_avatarStyle', avatarStyle);
          }
          sessionStorage.setItem('christmas_playerId', $socket?.id || '');
          sessionStorage.setItem(`host_${roomCode}`, 'true');
        }
        console.log('[Landing] ✅ Successfully reconnected to room, redirecting:', roomCode);
        goto(`/room/${roomCode}`);
      } else {
        error = response?.error || t('home.errors.failedReconnect');
        console.error('[Landing] ⚠️ Failed to reconnect:', response?.error);
      }
    });
  }

  onMount(() => {
    connectSocket();

    // Load saved player name and avatar from localStorage
    if (browser) {
      const savedName = localStorage.getItem('christmas_playerName');
      if (savedName) {
        playerName = String(savedName);
      }
      const savedAvatar = localStorage.getItem('christmas_preferredAvatar');
      const savedStyle = localStorage.getItem('christmas_avatarStyle');
      if (savedAvatar) {
        selectedAvatar = String(savedAvatar);
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
        // Note: Room check will be handled by the reactive statement to avoid duplicate checks
      }
    });

    return () => unsubscribe();
  });

  // Check for room when auth state changes (with auto-redirect)
  // Only check once to avoid multiple redirect attempts
  let lastCheckedUserId: string | null = null;
  let isCheckingRoom = false;
  $: {
    if (
      $authUser &&
      $connected &&
      $socket &&
      $authUser.id !== lastCheckedUserId &&
      !isCheckingRoom
    ) {
      lastCheckedUserId = $authUser.id;
      isCheckingRoom = true;
      checkMyRoom(true)
        .then(() => {
          // Reset flag after a delay to allow for potential redirects
          setTimeout(() => {
            isCheckingRoom = false;
          }, 1000);
        })
        .catch(() => {
          isCheckingRoom = false;
        }); // Auto-redirect to existing room
    } else if (!$authUser || !$connected) {
      myRoom = null;
      lastCheckedUserId = null;
      isRedirecting = false;
      isCheckingRoom = false;
    }
  }

  async function goToMyRoom() {
    if (!myRoom) return;

    // Use the reconnectAndRedirect function to avoid duplication
    await reconnectAndRedirect(myRoom.code, myRoom.hostToken);
  }

  async function createRoom() {
    // Prevent creating a new room if user already has an active room
    if (myRoom) {
      console.warn('[Landing] User already has a room, redirecting instead of creating new one');
      await reconnectAndRedirect(myRoom.code, myRoom.hostToken);
      return;
    }

    if (!isValidPlayerName(playerName)) {
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
        const {
          data: { session },
          error,
        } = await client.auth.getSession();
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

    console.log(
      '[CreateRoom] Sending create_room request with token:',
      authToken.substring(0, 20) + '...'
    );

    $socket.emit(
      'create_room',
      typeof playerName === 'string' ? playerName : String(playerName || ''),
      authToken,
      $language,
      async (response: any) => {
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

          // Mark that we just created this room so the room page knows we're already connected
          if (browser) {
            sessionStorage.setItem('just_created_room', response.roomCode);
          }

          // Navigate directly - the room was just created so we're already connected
          loading = false;
          console.log('[CreateRoom] ✅ Room created, navigating to room page:', response.roomCode);
          goto(`/room/${response.roomCode}`);
        } else {
          loading = false;
          error = response?.error || t('home.errors.failedCreate');
        }
      }
    );
  }

  function handleLanguageSelected(lang: 'en' | 'fr') {
    if (!pendingJoinResponse) return;

    // Update language if it changed
    if ($language !== lang) {
      language.set(lang);
    }

    if (browser) {
      // Store player name and room code for persistence
      localStorage.setItem('christmas_playerName', playerName);
      localStorage.setItem('christmas_role', 'player');
      localStorage.setItem(
        'christmas_roomCode',
        pendingJoinResponse.roomCode ||
          (typeof roomCode === 'string'
            ? roomCode.toUpperCase()
            : String(roomCode || '').toUpperCase())
      );
      if (selectedAvatar) {
        localStorage.setItem('christmas_preferredAvatar', selectedAvatar);
        localStorage.setItem('christmas_avatarStyle', avatarStyle);
      }
      if (pendingJoinResponse.playerToken) {
        localStorage.setItem('christmas_playerToken', pendingJoinResponse.playerToken);
      }
      sessionStorage.setItem('christmas_playerId', $socket?.id || '');
    }

    // Close modal and navigate to play page
    showLanguageModal = false;
    const normalizedCode =
      pendingJoinResponse.roomCode ||
      (typeof roomCode === 'string'
        ? roomCode.toUpperCase()
        : String(roomCode || '').toUpperCase());
    goto(`/play/${normalizedCode}`);

    // Clear pending response
    pendingJoinResponse = null;
  }

  async function joinRoom() {
    if (!isValidPlayerName(playerName)) {
      error = t('home.errors.enterName');
      return;
    }

    if (!isValidRoomCode(roomCode)) {
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

    $socket.emit(
      'join_room',
      typeof roomCode === 'string' ? roomCode.toUpperCase() : String(roomCode || '').toUpperCase(),
      typeof playerName === 'string' ? playerName : String(playerName || ''),
      selectedAvatar || undefined,
      $language,
      (response: any) => {
        clearTimeout(timeout);
        loading = false;

        if (response && response.success) {
          // Store the response temporarily
          pendingJoinResponse = response;

          // Show language selection modal
          showLanguageModal = true;
        } else {
          error = response?.error || t('home.errors.failedJoin');
        }
      }
    );
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
        <div
          class="bg-yellow-500/20 border border-yellow-500 rounded-lg p-3 text-sm flex items-center gap-2"
        >
          <span>🟡</span>
          <span>{t('home.connection.connecting')}</span>
        </div>
      {:else if $connected}
        <div
          class="bg-green-500/20 border border-green-500 rounded-lg p-2 text-xs flex items-center justify-center gap-2"
        >
          <span>🟢</span>
          <span>{t('home.connection.connected')}</span>
        </div>
      {/if}

      <input
        type="text"
        placeholder={t('home.namePlaceholder')}
        value={playerName || ''}
        on:input={(e) => {
          const target = e.currentTarget;
          if (!target) return;
          const value = target.value;
          // Always ensure playerName is a string, never null/undefined
          playerName = value != null && typeof value === 'string' ? value : '';
        }}
        class="input"
        maxlength="20"
        disabled={loading || !$connected}
      />

      <div>
        <div class="block text-sm font-medium mb-2">{t('home.avatarLabel')}</div>
        <div class="flex items-center gap-3">
          <button
            on:click={() => (showAvatarPicker = !showAvatarPicker)}
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
          <div
            class="mt-2 grid grid-cols-10 gap-2 max-h-48 overflow-y-auto p-2 bg-white/5 rounded-lg"
          >
            {#each avatarStyle === 'festive' ? festiveAvatars : emojiAvatars as avatar}
              <button
                on:click={() => {
                  selectedAvatar = avatar;
                  showAvatarPicker = false;
                }}
                class="text-2xl p-2 rounded {selectedAvatar === avatar
                  ? 'bg-christmas-gold ring-2 ring-christmas-red'
                  : 'bg-white/5 hover:bg-white/10'}"
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
            <a href="/auth/login" class="btn-primary text-sm px-4 py-2"
              >{t('common.button.signIn')}</a
            >
            <a href="/auth/signup" class="btn-secondary text-sm px-4 py-2"
              >{t('common.button.signUp')}</a
            >
          </div>
          <p class="text-xs text-white/60">{t('home.auth.playersCanJoin')}</p>
        </div>
      {:else}
        <!-- Host Section -->
        <div class="space-y-3">
          {#if loadingMyRoom}
            <div
              class="bg-yellow-500/20 border border-yellow-500 rounded-lg p-3 text-sm text-center"
            >
              {t('home.loadingRoom')}
            </div>
          {:else if myRoom}
            <button
              on:click={goToMyRoom}
              disabled={loading || !isValidPlayerName(playerName) || !$connected}
              class="btn-primary w-full text-lg"
            >
              {loading ? t('home.loading') : `🏠 ${t('home.goToRoom')} (${myRoom.code})`}
            </button>
          {:else}
            <button
              on:click={createRoom}
              disabled={loading || !isValidPlayerName(playerName) || !$connected}
              class="btn-primary w-full text-lg"
            >
              {loading
                ? t('home.createRoom.creating')
                : !$connected
                  ? t('home.createRoom.connecting')
                  : `🎮 ${t('home.createRoom.button')}`}
            </button>
          {/if}
          <div class="text-center text-xs text-white/50">
            {t('home.auth.signedInAs')}
            {$authUser.email}
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
          value={roomCode || ''}
          class="input text-center text-2xl tracking-widest"
          maxlength="4"
          disabled={loading}
          on:input={(e) => {
            const value = e.currentTarget?.value;
            roomCode =
              value != null && typeof value === 'string'
                ? value.toUpperCase()
                : String(value || '').toUpperCase();
          }}
        />

        <button
          on:click={joinRoom}
          disabled={loading ||
            !isValidPlayerName(playerName) ||
            !isValidRoomCode(roomCode) ||
            !$connected}
          class="btn-secondary w-full text-lg"
        >
          {loading
            ? t('home.joinRoom.joining')
            : !$connected
              ? t('home.createRoom.connecting')
              : `🚪 ${t('home.joinRoom.button')}`}
        </button>
      </div>
    </div>

    <div class="text-center text-xs text-white/50 pt-4">
      <p>{t('home.footer')}</p>
    </div>
  </div>

  <!-- Language Selection Modal -->
  <LanguageSelectionModal show={showLanguageModal} onLanguageSelected={handleLanguageSelected} />
</div>
