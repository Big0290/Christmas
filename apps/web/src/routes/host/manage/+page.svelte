<script lang="ts">
  import { goto } from '$app/navigation';
  import { socket, connectSocket, connected } from '$lib/socket';
  import { authUser, authLoading, getAccessToken } from '$lib/supabase';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { t, language } from '$lib/i18n';
  import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';

  let loading = false;
  let error = '';
  let myRoom: { code: string; hostToken: string; roomName?: string; description?: string; playerCount: number; isActive: boolean } | null = null;
  let loadingMyRoom = false;
  let playerName = '';
  let showCreateForm = false;

  // Make translations reactive by subscribing to language changes
  let titleText = '';
  let homeTitleText = '';
  let signedInAsText = '';
  let connectingText = '';
  let connectedText = '';
  let loadingRoomText = '';
  let existingRoomText = '';
  let roomCodeLabelText = '';
  let playersLabelText = '';
  let resumingText = '';
  let resumeRoomText = '';
  let createNewText = '';
  let createDescriptionText = '';
  let createButtonText = '';
  let hostNameLabelText = '';
  let hostNamePlaceholderText = '';
  let hostNameHintText = '';
  let creatingText = '';
  let backToHomeText = '';
  let cancelText = '';

  // Reactive block that updates all translations when language changes
  $: {
    const currentLang = $language;
    if (currentLang) {
      titleText = t('host.manage.title');
      homeTitleText = t('home.title');
      signedInAsText = t('host.manage.signedInAs');
      connectingText = t('home.connection.connecting');
      connectedText = t('home.connection.connected');
      loadingRoomText = t('host.manage.loadingRoom');
      existingRoomText = t('host.manage.existingRoom');
      roomCodeLabelText = t('common.label.roomCode');
      playersLabelText = t('common.label.players');
      resumingText = t('host.manage.resuming');
      resumeRoomText = t('host.manage.resumeRoom');
      createNewText = t('host.manage.createNew');
      createDescriptionText = t('host.manage.createDescription');
      createButtonText = t('host.manage.createButton');
      hostNameLabelText = t('host.manage.hostNameLabel');
      hostNamePlaceholderText = t('host.manage.hostNamePlaceholder');
      hostNameHintText = t('host.manage.hostNameHint');
      creatingText = t('host.manage.creating');
      backToHomeText = t('host.manage.backToHome');
      cancelText = t('common.button.cancel');
    }
  }

  onMount(() => {
    // Check authentication
    if (!$authUser && !$authLoading) {
      // Not authenticated, redirect to login with return URL
      goto('/auth/login?redirect=' + encodeURIComponent('/host/manage'));
      return;
    }

    // Socket is initialized by layout, but ensure it's connected
    if (!$socket) {
      connectSocket();
    }

    // Load saved player name if available
    if (browser) {
      const savedName = localStorage.getItem('christmas_playerName');
      if (savedName) {
        playerName = String(savedName);
      }
    }

    // Check for existing room when authenticated and connected
    // Wait a bit for socket to be ready
    if ($authUser) {
      setTimeout(() => {
        if ($socket && $connected) {
          checkMyRoom();
        }
      }, 500);
    }
  });

  // Watch for auth and connection changes
  let hasCheckedRoom = false;
  $: {
    if ($authUser && $socket && $connected && !loadingMyRoom && !myRoom && !hasCheckedRoom) {
      hasCheckedRoom = true;
      checkMyRoom().finally(() => {
        // Reset flag after a delay to allow re-checking if needed
        setTimeout(() => {
          hasCheckedRoom = false;
        }, 2000);
      });
    } else if (!$authUser && !$authLoading) {
      // User logged out, redirect to login
      hasCheckedRoom = false;
      goto('/auth/login?redirect=' + encodeURIComponent('/host/manage'));
    }
  }

  async function checkMyRoom(): Promise<void> {
    if (!$authUser) {
      myRoom = null;
      return Promise.resolve();
    }

    // Get auth token first
    const authToken = await getAccessToken();
    if (!authToken) {
      console.error('[Host Manage] No auth token available');
      loadingMyRoom = false;
      myRoom = null;
      error = t('host.manage.errors.mustSignIn');
      return Promise.resolve();
    }

    // Ensure socket is connected with auth token
    // Force reconnect to ensure socket has the latest auth token
    if (!$socket || !$connected) {
      console.log('[Host Manage] Socket not connected, connecting...');
      await connectSocket();
    } else {
      // Socket exists but might not have auth token - reconnect to ensure it does
      console.log('[Host Manage] Reconnecting socket to ensure auth token is included...');
      await connectSocket(undefined, true); // Force reconnect
    }
    
    // Wait for connection
    let attempts = 0;
    while ((!$socket || !$connected) && attempts < 10) {
      await new Promise(resolve => setTimeout(resolve, 200));
      attempts++;
    }
    if (!$socket || !$connected) {
      console.error('[Host Manage] Failed to connect socket after', attempts, 'attempts');
      loadingMyRoom = false;
      myRoom = null;
      error = t('host.manage.errors.notConnected');
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      loadingMyRoom = true;
      error = '';
      console.log('[Host Manage] Checking for existing room...');
      
      // Set a timeout
      const timeout = setTimeout(() => {
        loadingMyRoom = false;
        error = t('host.manage.errors.timeout');
        console.error('[Host Manage] get_my_room timeout');
        resolve();
      }, 10000);

      if (!$socket) {
        clearTimeout(timeout);
        loadingMyRoom = false;
        error = t('host.manage.errors.notConnected');
        resolve();
        return;
      }

      $socket.emit('get_my_room', async (response: any) => {
        clearTimeout(timeout);
        loadingMyRoom = false;
        console.log('[Host Manage] get_my_room response:', response);
        
        if (response && response.success) {
          if (response.room && response.room.isActive) {
            myRoom = {
              code: response.room.code,
              hostToken: response.room.hostToken,
              roomName: response.room.roomName,
              description: response.room.description,
              playerCount: response.room.playerCount || 0,
              isActive: response.room.isActive,
            };
            console.log('[Host Manage] ✅ Found existing room:', myRoom.code);
          } else {
            myRoom = null;
            console.log('[Host Manage] No active room found');
          }
        } else {
          console.error('[Host Manage] ❌ Failed to get room:', response?.error);
          myRoom = null;
          if (response?.error) {
            error = response.error;
            // If auth error, might need to reconnect socket
            if (response.error.includes('Authentication') || response.error.includes('auth')) {
              console.log('[Host Manage] Auth error detected, reconnecting socket...');
              await connectSocket();
            }
          }
        }
        resolve();
      });
    });
  }

  async function resumeRoom() {
    if (!myRoom) return;

    if (!$socket || !$connected) {
      error = t('host.manage.errors.notConnected');
      connectSocket();
      return;
    }

    loading = true;
    error = '';

    // Get auth token
    const authToken = await getAccessToken();
    if (!authToken) {
      loading = false;
      error = t('host.manage.errors.mustSignIn');
      return;
    }

    // Reconnect host to room
    $socket.emit('reconnect_host', myRoom.code, myRoom.hostToken, $language, (response: any) => {
      loading = false;
      if (response && response.success) {
        if (browser) {
          localStorage.setItem('christmas_roomCode', myRoom.code);
          localStorage.setItem('christmas_hostToken', myRoom.hostToken);
          if (playerName) {
            localStorage.setItem('christmas_playerName', playerName);
          }
          sessionStorage.setItem('christmas_playerId', $socket?.id || '');
          sessionStorage.setItem(`host_${myRoom.code}`, 'true');
        }
        console.log('[Host Manage] ✅ Successfully reconnected to room, redirecting:', myRoom.code);
        goto(`/room/${myRoom.code}/host`);
      } else {
        error = response?.error || t('host.manage.errors.failedReconnect');
        console.error('[Host Manage] ⚠️ Failed to reconnect:', response?.error);
      }
    });
  }

  async function createRoom() {
    if (!playerName.trim()) {
      error = t('host.manage.errors.enterName');
      return;
    }

    // Check if socket is connected
    if (!$socket || !$connected) {
      error = t('host.manage.errors.notConnected');
      connectSocket();
      return;
    }

    loading = true;
    error = '';

    // Set a timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      loading = false;
      error = t('host.manage.errors.timeout');
    }, 10000); // 10 second timeout

    // Get auth token for room creation
    const authToken = await getAccessToken();
    if (!authToken) {
      clearTimeout(timeout);
      loading = false;
      error = t('host.manage.errors.mustSignIn');
      return;
    }

    console.log('[Host Manage] Creating room with name:', playerName);

    $socket.emit(
      'create_room',
      playerName.trim(),
      authToken,
      $language,
      async (response: any) => {
        clearTimeout(timeout);

        if (response && response.success) {
          // Store player name and room code for persistence
          if (browser) {
            localStorage.setItem('christmas_playerName', playerName.trim());
            localStorage.setItem('christmas_role', 'host');
            localStorage.setItem('christmas_roomCode', response.roomCode);
            if (response.hostToken) {
              localStorage.setItem('christmas_hostToken', response.hostToken);
            }
            sessionStorage.setItem('christmas_playerId', $socket?.id || '');
          }

          // Store host status
          if (response.isHost) {
            sessionStorage.setItem(`host_${response.roomCode}`, 'true');
          }

          // Mark that we just created this room
          if (browser) {
            sessionStorage.setItem('just_created_room', response.roomCode);
          }

          // Navigate to mode selector
          loading = false;
          console.log('[Host Manage] ✅ Room created, navigating to mode selector:', response.roomCode);
          goto(`/room/${response.roomCode}/host`);
        } else {
          loading = false;
          error = response?.error || t('host.manage.errors.failedCreate');
        }
      }
    );
  }

  function toggleCreateForm() {
    showCreateForm = !showCreateForm;
    if (showCreateForm && !playerName && browser) {
      // Load saved name if available
      const savedName = localStorage.getItem('christmas_playerName');
      if (savedName) {
        playerName = String(savedName);
      }
    }
  }
</script>

<svelte:head>
  <title>{titleText} | {homeTitleText}</title>
</svelte:head>

<div class="manage-page min-h-screen flex items-center justify-center p-4 relative">
  <div class="absolute top-4 right-4 z-10">
    <LanguageSwitcher />
  </div>

  <div class="manage-container max-w-2xl w-full z-10 relative">
    <!-- Header -->
    <div class="text-center mb-8">
      <h1 class="text-5xl font-bold mb-2">🎮</h1>
      <h2 class="text-3xl font-bold text-christmas-gold mb-2">
        {titleText}
      </h2>
      {#if $authUser}
        <p class="text-white/70 text-sm">
          {signedInAsText} {$authUser.email}
        </p>
      {/if}
    </div>

    <!-- Connection Status -->
    {#if !$connected && $socket}
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

    <!-- Error Display -->
    {#if error}
      <div class="bg-red-500/20 border border-red-500 rounded-lg p-3 text-sm mb-6">
        {error}
      </div>
    {/if}

    <!-- Existing Room Card -->
    {#if loadingMyRoom}
      <div class="card mb-6 text-center">
        <div class="text-2xl mb-2">⏳</div>
        <p>{loadingRoomText}</p>
      </div>
    {:else if myRoom && myRoom.isActive}
      <div class="card mb-6">
        <div class="text-center mb-4">
          <div class="text-4xl mb-2">🏠</div>
          <h3 class="text-2xl font-bold text-christmas-gold mb-2">
            {myRoom.roomName || existingRoomText}
          </h3>
          {#if myRoom.description}
            <p class="text-white/70 text-sm mb-2">{myRoom.description}</p>
          {/if}
          <div class="flex items-center justify-center gap-4 text-sm text-white/60">
            <span>
              <strong class="text-christmas-gold">{roomCodeLabelText}:</strong> {myRoom.code}
            </span>
            <span>
              <strong class="text-christmas-gold">{playersLabelText}:</strong> {myRoom.playerCount}
            </span>
          </div>
        </div>
        <button
          on:click={resumeRoom}
          disabled={loading || !$connected}
          class="btn-primary w-full text-lg py-3"
        >
          {loading ? resumingText : `▶️ ${resumeRoomText}`}
        </button>
      </div>
    {/if}

    <!-- Create New Room Section -->
    <div class="card">
      {#if !showCreateForm}
        <div class="text-center">
          <h3 class="text-xl font-bold text-christmas-gold mb-2">
            {createNewText}
          </h3>
          <p class="text-white/70 text-sm mb-4">
            {createDescriptionText}
          </p>
          <button
            on:click={toggleCreateForm}
            disabled={loading || !$connected}
            class="btn-secondary w-full text-lg py-3"
          >
            ✨ {createButtonText}
          </button>
        </div>
      {:else}
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-2">
              {hostNameLabelText}
            </label>
            <input
              type="text"
              placeholder={hostNamePlaceholderText}
              bind:value={playerName}
              class="input"
              maxlength="20"
              disabled={loading}
              on:keydown={(e) => e.key === 'Enter' && createRoom()}
            />
            <p class="text-xs text-white/50 mt-1">
              {hostNameHintText}
            </p>
          </div>

          <div class="flex gap-3">
            <button
              on:click={toggleCreateForm}
              disabled={loading}
              class="btn-secondary flex-1"
            >
              {cancelText}
            </button>
            <button
              on:click={createRoom}
              disabled={loading || !playerName.trim() || !$connected}
              class="btn-primary flex-1"
            >
              {loading ? creatingText : `🎮 ${createButtonText}`}
            </button>
          </div>
        </div>
      {/if}
    </div>

    <!-- Back to Home -->
    <div class="text-center mt-6">
      <a href="/" class="text-christmas-gold hover:underline text-sm">
        ← {backToHomeText}
      </a>
    </div>
  </div>
</div>

<style>
  .manage-page {
    background: linear-gradient(135deg, #0a1a2e 0%, #1a2a4e 30%, #2a3a6e 60%, #1a2a4e 100%);
    background-image: 
      radial-gradient(circle at 20% 30%, rgba(255, 255, 255, 0.1) 0%, transparent 50%),
      radial-gradient(circle at 80% 70%, rgba(173, 216, 230, 0.15) 0%, transparent 50%),
      radial-gradient(circle at 50% 50%, rgba(176, 224, 230, 0.1) 0%, transparent 50%);
    position: relative;
    overflow: hidden;
  }

  .manage-container {
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
</style>

