<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import { onMount, onDestroy } from 'svelte';
  import { socket, connectSocket, players, connected } from '$lib/socket';
  import QRCode from 'qrcode';
  import { GameType } from '@christmas/core';
  import { playSoundOnce } from '$lib/audio';
  import { loadRoomTheme } from '$lib/theme';
  import GameTile from '$lib/components/room/GameTile.svelte';
  import ShareRoom from '$lib/components/room/ShareRoom.svelte';
  import Jukebox from '$lib/components/room/Jukebox.svelte';
  import GameSettingsModal from '$lib/components/room/GameSettingsModal.svelte';
  import { t, language } from '$lib/i18n';
  import { get } from 'svelte/store';

  const roomCode = $page.params.code;
  let qrCodeDataUrl = '';
  let isHost = false;
  let selectedGame: GameType | null = null;
  let origin = '';
  let joinUrl = '';
  let verifyingConnection = false;
  let connectionError = '';
  let roomName = '';
  let roomDescription = '';
  let connectionTimeout: ReturnType<typeof setTimeout> | null = null;
  let showSettingsModal = false;
  let selectedGameForSettings: GameType | null = null;
  
  // Debug logging (dev mode only)
  $: if (import.meta.env.DEV) {
    console.log('[Room] Players store updated:', $players);
    console.log('[Room] Players count:', $players.length);
    console.log('[Room] Socket connected:', $connected);
    console.log('[Room] Is host:', isHost);
  }

  $: games = [
    { type: GameType.TRIVIA_ROYALE, name: t('room.games.triviaRoyale.name'), desc: t('room.games.triviaRoyale.desc') },
    { type: GameType.EMOJI_CAROL, name: t('room.games.emojiCarol.name'), desc: t('room.games.emojiCarol.desc') },
    { type: GameType.NAUGHTY_OR_NICE, name: t('room.games.naughtyOrNice.name'), desc: t('room.games.naughtyOrNice.desc') },
    { type: GameType.PRICE_IS_RIGHT, name: t('room.games.priceIsRight.name'), desc: t('room.games.priceIsRight.desc') },
  ];

  // Computed: sorted players by score
  $: sortedPlayers = [...$players].sort((a, b) => (b.score || 0) - (a.score || 0));

  onMount(async () => {
    try {
      await connectSocket();
    } catch (err) {
      console.error('[Room] Failed to connect socket:', err);
      connectionError = 'Failed to connect to server. Please refresh the page.';
    }

    // Add a fallback timeout to show error if connection takes too long
    connectionTimeout = setTimeout(() => {
      if (!$connected) {
        console.error('[Room] Connection timeout after 15 seconds');
        connectionError = 'Connection timeout. Please check your internet connection and refresh the page.';
      }
    }, 15000);

    // Set origin and join URL
    if (browser) {
      origin = window.location.origin;
      joinUrl = `${origin}/join?code=${roomCode}`;
    }

    // Generate QR code for joining - larger for projector display
    if (browser) {
      qrCodeDataUrl = await QRCode.toDataURL(joinUrl, {
        width: 400,
        margin: 3,
        color: { dark: '#c41e3a', light: '#ffffff' },
      });
    }

    // Check if we're the host
    if (browser) {
      const storedIsHost = sessionStorage.getItem(`host_${roomCode}`);
      if (storedIsHost === 'true') {
        isHost = true;
      } else {
        isHost = true; // Assume host for room page
      }
    } else {
      isHost = true;
    }

    // Verify host connection to room with retry logic
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 3;
    const RECONNECT_DELAY = 1000; // 1 second

    const verifyHostConnection = (attempt: number = 0) => {
      if (!$socket || !$connected) {
        console.log('[Room] Cannot verify host connection: socket not ready', {
          hasSocket: !!$socket,
          isConnected: $connected,
        });
        // Retry after a short delay if socket becomes available
        if (attempt < MAX_RECONNECT_ATTEMPTS) {
          setTimeout(() => {
            if ($socket && $connected) {
              verifyHostConnection(attempt + 1);
            }
          }, RECONNECT_DELAY);
        }
        return;
      }

      verifyingConnection = true;
      connectionError = '';

      if (browser) {
        const hostToken = localStorage.getItem('christmas_hostToken');
        const savedRoomCode = localStorage.getItem('christmas_roomCode');

        if (hostToken && savedRoomCode === roomCode) {
          console.log(`[Room] Verifying host connection (attempt ${attempt + 1}/${MAX_RECONNECT_ATTEMPTS})`);
          const currentLanguage = get(language);
          $socket.emit('reconnect_host', roomCode, hostToken, currentLanguage, (response: any) => {
            verifyingConnection = false;
            if (response && response.success) {
              console.log('[Room] ✅ Host successfully connected to room');
              console.log('[Room] Response players:', response.room?.players || []);
              reconnectAttempts = 0; // Reset attempts on success
              
              // Manually update players store from response if room_update hasn't arrived yet
              if (response.room?.players && Array.isArray(response.room.players)) {
                console.log(`[Room] Manually setting players from reconnect response: ${response.room.players.length} player(s)`);
                players.set(response.room.players);
              }
              
              loadRoomSettings();
            } else {
              const errorMsg = response?.error || 'Failed to reconnect as host';
              console.error(`[Room] ❌ Host reconnection failed (attempt ${attempt + 1}):`, errorMsg);
              
              // Retry if we haven't exceeded max attempts
              if (attempt < MAX_RECONNECT_ATTEMPTS - 1) {
                console.log(`[Room] Retrying host reconnection in ${RECONNECT_DELAY}ms...`);
                setTimeout(() => {
                  verifyHostConnection(attempt + 1);
                }, RECONNECT_DELAY);
              } else {
                connectionError = errorMsg;
                console.error('[Room] ❌ Max reconnection attempts reached');
              }
            }
          });
        } else {
          verifyingConnection = false;
          console.warn('[Room] ⚠️ Missing host token or room code mismatch', {
            hasToken: !!hostToken,
            savedRoomCode,
            currentRoomCode: roomCode,
          });
        }
      }
    };

    // Setup socket event listeners - wait for socket to be available
    const setupSocketListeners = () => {
      if (!$socket) {
        // Wait for socket to be available
        const unsubscribe = socket.subscribe((sock) => {
          if (sock) {
            unsubscribe();
            setupSocketListeners();
          }
        });
        return;
      }

      // Listen for room_update as a backup to ensure players store updates
      // Even though socket.ts handles this, having a backup listener ensures
      // the UI always updates when players join/leave
      $socket.on('room_update', (data: any) => {
        console.log('[Room] 🔵 Backup room_update listener received:', data);
        if (data && Array.isArray(data.players)) {
          console.log(`[Room] 🔵 Backup: Setting players list with ${data.players.length} player(s)`);
          // Update players store directly as backup
          players.set(data.players);
          console.log('[Room] 🔵 Backup: Players store updated via backup listener');
        }
      });

      // Also listen for player_joined/player_left as immediate feedback
      $socket.on('player_joined', (player: any) => {
        console.log('[Room] 🔵 Player joined event (backup listener):', player);
        // This provides immediate feedback, but room_update is authoritative
        players.update((p) => {
          const exists = p.some((existing) => existing.id === player.id);
          if (!exists) {
            return [...p, player];
          }
          return p;
        });
      });

      $socket.on('player_left', (data: any) => {
        console.log('[Room] 🔵 Player left event (backup listener):', data);
        const playerId = typeof data === 'string' ? data : data?.playerId || data;
        players.update((p) => p.filter((player) => player.id !== playerId));
      });

      // Listen for game start (use playSoundOnce to prevent duplicates with server events)
      $socket.on('game_started', (gameType: GameType) => {
        playSoundOnce('gameStart', 1000);
        goto(`/host/${roomCode}`);
      });

      // Listen for room settings updates
      $socket.on('room_settings_updated', (settings: any) => {
        if (settings.roomName !== undefined) roomName = settings.roomName || '';
        if (settings.description !== undefined) roomDescription = settings.description || '';
      });
    };

    // Setup listeners immediately or wait for socket
    setupSocketListeners();

    // Watch for connection success to clear timeout and verify host connection
    const unsubscribeConnected = connected.subscribe((isConnected) => {
      if (isConnected && connectionTimeout) {
        clearTimeout(connectionTimeout);
        connectionTimeout = null;
      }
      // When connected, verify host connection
      if (isConnected && $socket) {
        verifyHostConnection();
      }
    });

    // Initial check - if already connected, verify immediately
    if ($socket && $connected) {
      verifyHostConnection();
    }

    // Load room settings
    loadRoomSettings();

    // Cleanup subscription on destroy
    return () => {
      unsubscribeConnected();
    };
  });

  function loadRoomSettings() {
    loadRoomTheme(roomCode);
    roomName = '';
    roomDescription = '';
  }

  onDestroy(() => {
    if (connectionTimeout) {
      clearTimeout(connectionTimeout);
    }
    if ($socket) {
      // Remove backup listeners we added
      $socket.off('room_update');
      $socket.off('player_joined');
      $socket.off('player_left');
      // Remove other listeners
      $socket.off('game_started');
      $socket.off('room_settings_updated');
    }
  });

  function startGame() {
    if (selectedGame && isHost) {
      // Show settings modal instead of starting immediately
      selectedGameForSettings = selectedGame;
      showSettingsModal = true;
    }
  }

  function handleStartWithSettings(settings: any) {
    if (selectedGameForSettings && isHost && $socket) {
      $socket.emit('start_game', selectedGameForSettings, settings);
      showSettingsModal = false;
      selectedGameForSettings = null;
    }
  }

  function handleCloseModal() {
    showSettingsModal = false;
    selectedGameForSettings = null;
  }

  function selectGame(gameType: GameType) {
    selectedGame = gameType;
  }
</script>

<svelte:head>
  <title>{t('room.title', { code: roomCode })} | {t('home.title')}</title>
</svelte:head>

<div class="room-page min-h-screen p-4 md:p-6 lg:p-8">
  <div class="max-w-7xl mx-auto">
    <!-- Header -->
    <div class="text-center mb-8 md:mb-12">
      <h1 class="text-5xl md:text-7xl lg:text-8xl font-bold text-christmas-gold mb-4 drop-shadow-2xl">
        {roomName || t('room.title', { code: roomCode })}
      </h1>
      {#if roomDescription}
        <p class="text-2xl md:text-3xl text-white/80 mb-6">{roomDescription}</p>
      {/if}
      {#if isHost}
        <a href="/room/{roomCode}/settings" class="btn-secondary text-xl md:text-2xl px-6 md:px-8 py-3 md:py-4 inline-flex items-center gap-2">
          ⚙️ {t('room.gameSettings')}
        </a>
      {/if}
    </div>

    <!-- Connection Status -->
    {#if connectionError}
      <div class="card bg-red-500/20 border-red-500 mb-6 text-center">
        <p class="text-xl text-red-200 mb-2">⚠️ {t('room.connection.error')}</p>
        <p class="text-lg text-white/80">{connectionError}</p>
      </div>
    {:else if !$connected || verifyingConnection}
      <div class="card bg-yellow-500/20 border-yellow-500 mb-6 text-center">
        <p class="text-xl text-yellow-200">🟡 {t('room.connection.connecting')}</p>
      </div>
    {:else if $connected}
      <div class="card bg-green-500/20 border-green-500 mb-6 text-center">
        <p class="text-xl text-green-200">🟢 {t('room.connection.connected')}</p>
      </div>
    {/if}

    <div class="grid lg:grid-cols-3 gap-4 md:gap-6">
      <!-- Left Column: Jukebox & QR Code -->
      <div class="lg:col-span-1 space-y-4 md:space-y-5">
        <!-- Jukebox (Host Only) - Compact at Top -->
        {#if isHost}
          <Jukebox {roomCode} {isHost} />
        {/if}

        <!-- QR Code Card -->
        <div class="card text-center frosted-glass">
          <h2 class="text-2xl md:text-3xl font-bold mb-4 md:mb-5">📱 {t('room.scanToJoin')}</h2>
          {#if qrCodeDataUrl}
            <div class="bg-white p-3 md:p-5 rounded-xl inline-block mb-4 md:mb-5 shadow-2xl">
              <img src={qrCodeDataUrl} alt="QR Code" class="w-56 md:w-72 h-56 md:h-72" />
            </div>
          {/if}
          <p class="text-lg md:text-xl text-white/80 mb-2">{t('room.orVisit')}</p>
          <p class="text-base md:text-lg text-christmas-gold font-mono break-all px-3 md:px-4">
            {joinUrl || `${origin}/join?code=${roomCode}`}
          </p>
        </div>

        <!-- Share Room Component -->
        <ShareRoom {roomCode} {joinUrl} />
      </div>

      <!-- Middle Column: Players -->
      <div class="lg:col-span-1">
        <div class="card frosted-glass">
          <h2 class="text-2xl md:text-3xl font-bold mb-4 md:mb-5 text-center">
            👥 {t('room.players')}
            <span class="text-christmas-gold">({$players.length})</span>
          </h2>
          
          <div class="space-y-2 md:space-y-3 max-h-[500px] md:max-h-[600px] overflow-y-auto pr-2">
            {#if !$connected || verifyingConnection}
              <!-- Connection loading state -->
              <div class="text-center py-12">
                <div class="inline-block animate-spin text-4xl md:text-5xl mb-4">⏳</div>
                <p class="text-2xl md:text-3xl text-white/50">{t('common.status.connecting')}</p>
              </div>
            {:else if $players.length === 0}
              <!-- Empty state: no players yet -->
              <div class="text-center py-12">
                <div class="text-6xl md:text-7xl mb-4">👥</div>
                <p class="text-2xl md:text-3xl text-white/50 mb-4">{t('room.waitingPlayers')}</p>
                <p class="text-xl md:text-2xl text-white/40">{t('room.scanQrCode')}</p>
              </div>
            {:else}
              <!-- Player list -->
              {#each sortedPlayers as player, index}
                <div 
                  class="player-card flex items-center gap-3 md:gap-4 p-3 md:p-4 bg-white/10 rounded-lg md:rounded-xl hover:bg-white/15 transition-all" 
                  class:top-player={index < 3 && (player.score || 0) > 0}
                >
                  <!-- Rank/Medal -->
                  <div class="flex-shrink-0 w-10 md:w-12 text-center">
                    {#if index === 0 && (player.score || 0) > 0}
                      <span class="text-2xl md:text-3xl">🥇</span>
                    {:else if index === 1 && (player.score || 0) > 0}
                      <span class="text-2xl md:text-3xl">🥈</span>
                    {:else if index === 2 && (player.score || 0) > 0}
                      <span class="text-2xl md:text-3xl">🥉</span>
                    {:else}
                      <span class="text-base md:text-lg text-white/60 font-bold">#{index + 1}</span>
                    {/if}
                  </div>
                  
                  <!-- Avatar -->
                  <span class="text-3xl md:text-4xl flex-shrink-0">{player.avatar || '🎄'}</span>
                  
                  <!-- Name -->
                  <span class="text-lg md:text-xl font-medium flex-1 truncate" title={player.name}>
                    {player.name}
                  </span>
                  
                  <!-- Score -->
                  <div class="flex items-center gap-1 md:gap-2 flex-shrink-0">
                    <span class="text-base md:text-lg font-bold text-christmas-gold">
                      {player.score || 0}
                    </span>
                    <span class="text-xs md:text-sm text-white/60">{t('common.label.pts')}</span>
                  </div>
                  
                  <!-- You indicator -->
                  {#if player.id === $socket?.id}
                    <span class="text-xs md:text-sm bg-christmas-gold text-black px-2 md:px-3 py-1 rounded-full font-bold flex-shrink-0">
                      {t('common.label.you')}
                    </span>
                  {/if}
                </div>
              {/each}
            {/if}
          </div>
        </div>
      </div>

      <!-- Right Column: Game Selection -->
      <div class="lg:col-span-1">
        <div class="card frosted-glass">
          <h2 class="text-2xl md:text-3xl font-bold mb-4 md:mb-5 text-center">🎮 {t('room.selectGame')}</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-3 md:gap-4">
            {#each games as game}
              <GameTile
                gameType={game.type}
                name={game.name}
                description={game.desc}
                playerCount={$players.length}
                isHost={isHost}
                selected={selectedGame === game.type}
                onSelect={() => selectGame(game.type)}
                onStart={startGame}
              />
            {/each}
          </div>

          {#if isHost && selectedGame}
            <div class="mt-6 text-center">
              {#if $players.length < 2}
                <p class="text-xl md:text-2xl text-yellow-300 mb-4">
                  ⚠️ {t('room.needPlayers')}
                </p>
              {/if}
            </div>
          {:else if !isHost}
            <div class="mt-6 p-6 bg-white/10 rounded-xl text-center">
              <p class="text-xl md:text-2xl text-white/80">
                {t('room.waitingHost')}
              </p>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>

  <!-- Game Settings Modal -->
  {#if selectedGameForSettings}
    <GameSettingsModal
      gameType={selectedGameForSettings}
      open={showSettingsModal}
      onClose={handleCloseModal}
      onStart={handleStartWithSettings}
    />
  {/if}
</div>

<style>
  .room-page {
    /* Projector-friendly: large text, high contrast, spacious */
    font-size: 1.25rem; /* Base 20px */
  }

  @media (min-width: 768px) {
    .room-page {
      font-size: 1.5rem; /* Base 24px on larger screens */
    }
  }

  @media (min-width: 1024px) {
    .room-page {
      font-size: 1.75rem; /* Base 28px on projector screens */
    }
  }

  /* Ensure all interactive elements are large enough */
  :global(.room-page button),
  :global(.room-page a.btn-primary),
  :global(.room-page a.btn-secondary) {
    min-height: 60px;
    font-size: 1.25rem;
    padding: 1rem 2rem;
  }

  @media (min-width: 768px) {
    :global(.room-page button),
    :global(.room-page a.btn-primary),
    :global(.room-page a.btn-secondary) {
      min-height: 70px;
      font-size: 1.5rem;
      padding: 1.25rem 2.5rem;
    }
  }

  /* High contrast for projector visibility */
  .room-page {
    color: #ffffff;
  }

  /* Clear visual hierarchy */
  .room-page h1,
  .room-page h2,
  .room-page h3 {
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
  }

  /* Large QR code for projector */
  :global(.room-page .card img) {
    max-width: 100%;
    height: auto;
  }

  /* Spacious layout for projector */
  :global(.room-page .card) {
    padding: 2rem;
  }

  @media (min-width: 768px) {
    :global(.room-page .card) {
      padding: 2.5rem;
    }
  }

  @media (min-width: 1024px) {
    :global(.room-page .card) {
      padding: 3rem;
    }
  }

  /* Top player styling */
  :global(.top-player) {
    background: linear-gradient(135deg, rgba(255, 215, 0, 0.15), rgba(255, 215, 0, 0.05));
    border: 2px solid rgba(255, 215, 0, 0.3);
    box-shadow: 0 4px 12px rgba(255, 215, 0, 0.2);
  }

  :global(.top-player:hover) {
    background: linear-gradient(135deg, rgba(255, 215, 0, 0.25), rgba(255, 215, 0, 0.1));
    border-color: rgba(255, 215, 0, 0.5);
  }

  /* Player list improvements */
  :global(.room-page .player-card) {
    animation: fadeIn 0.3s ease-in;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Smooth scrollbar styling - Candy Cane */
  :global(.room-page .card > div[class*="overflow-y-auto"]) {
    scrollbar-width: thin;
    scrollbar-color: #C41E3A transparent;
  }

  :global(.room-page .card > div[class*="overflow-y-auto"]::-webkit-scrollbar) {
    width: 10px;
  }

  :global(.room-page .card > div[class*="overflow-y-auto"]::-webkit-scrollbar-track) {
    background: rgba(0, 0, 0, 0.1);
    border-radius: 5px;
  }

  :global(.room-page .card > div[class*="overflow-y-auto"]::-webkit-scrollbar-thumb) {
    background: repeating-linear-gradient(
      45deg,
      #C41E3A 0px,
      #C41E3A 6px,
      #ffffff 6px,
      #ffffff 12px
    );
    border-radius: 5px;
    border: 1px solid rgba(255, 255, 255, 0.3);
    box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.2);
  }

  :global(.room-page .card > div[class*="overflow-y-auto"]::-webkit-scrollbar-thumb:hover) {
    background: repeating-linear-gradient(
      45deg,
      #ff0000 0px,
      #ff0000 6px,
      #ffffff 6px,
      #ffffff 12px
    );
    box-shadow: 
      inset 0 1px 2px rgba(255, 255, 255, 0.3),
      0 0 8px rgba(196, 30, 58, 0.4);
  }
</style>
