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
  import HostGuessingDashboard from '$lib/components/host/HostGuessingDashboard.svelte';
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
  let games: Array<{ type: GameType; name: string; desc: string }> = [];
  let activeRoomTab: 'games' | 'guessing' = 'games';
  
  // Debug logging (dev mode only)
  $: if (import.meta.env.DEV) {
    console.log('[Room] Players store updated:', $players);
    console.log('[Room] Players count:', $players.length);
    console.log('[Room] Socket connected:', $connected);
    console.log('[Room] Is host:', isHost);
    console.log('[Room] GameType.BINGO:', GameType.BINGO);
    console.log('[Room] All GameTypes:', GameType);
  }

  $: {
    // Use GameType.BINGO if available, otherwise fallback to the string literal
    const bingoType = GameType.BINGO || ('bingo' as GameType);
    const bingoName = t('room.games.bingo.name') || 'Christmas Speed Bingo';
    const bingoDesc = t('room.games.bingo.desc') || 'Dynamic bingo with pictures';
    
    console.log('[Room] Creating games array, bingoType:', bingoType, 'GameType.BINGO:', GameType.BINGO, 'bingoName:', bingoName);
    
    const gamesList = [
      { type: GameType.TRIVIA_ROYALE, name: t('room.games.triviaRoyale.name'), desc: t('room.games.triviaRoyale.desc') },
      { type: GameType.EMOJI_CAROL, name: t('room.games.emojiCarol.name'), desc: t('room.games.emojiCarol.desc') },
      { type: GameType.NAUGHTY_OR_NICE, name: t('room.games.naughtyOrNice.name'), desc: t('room.games.naughtyOrNice.desc') },
      { type: GameType.PRICE_IS_RIGHT, name: t('room.games.priceIsRight.name'), desc: t('room.games.priceIsRight.desc') },
      { type: bingoType, name: bingoName, desc: bingoDesc },
    ];
    
    console.log('[Room] Games array created:', gamesList.map(g => ({ type: g.type, name: g.name })));
    
    games = gamesList.filter(game => game.type); // Filter out any games with undefined type
    console.log('[Room] Games array after filter:', games.map(g => ({ type: g.type, name: g.name })));
  }

  // Computed: sorted players by score
  $: sortedPlayers = [...$players].sort((a, b) => (b.score || 0) - (a.score || 0));

  onMount(async () => {
    try {
      // Don't call connectSocket() here - it's already initialized by the layout
      // Only ensure socket is available
      if (!$socket) {
        console.warn('[Room] Socket not available, layout should have initialized it');
        await connectSocket();
      }
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
        const justCreatedRoom = sessionStorage.getItem('just_created_room');

        // If we just created this room, we're already connected - just verify and skip reconnect
        if (justCreatedRoom === roomCode) {
          console.log('[Room] Just created this room - already connected via create_room, skipping reconnect');
          sessionStorage.removeItem('just_created_room'); // Clear flag
          verifyingConnection = false;
          
          // Room was just created, so we're already in the room
          // The create_room handler already joined the socket to the room
          // Just load settings and we're done
          loadRoomSettings();
          return;
        }

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
    console.log('[Room] Selecting game:', gameType);
    selectedGame = gameType;
    console.log('[Room] Selected game set to:', selectedGame);
  }

  function startGame() {
    console.log('[Room] Start game called, selectedGame:', selectedGame, 'isHost:', isHost);
    if (selectedGame && isHost) {
      console.log('[Room] Opening settings modal for:', selectedGame);
      // Show settings modal instead of starting immediately
      selectedGameForSettings = selectedGame;
      showSettingsModal = true;
      console.log('[Room] Settings modal opened:', showSettingsModal);
    } else {
      console.warn('[Room] Cannot start game - selectedGame:', selectedGame, 'isHost:', isHost);
    }
  }
</script>

<svelte:head>
  <title>{t('room.title', { code: roomCode })} | {t('home.title')}</title>
</svelte:head>

<div class="room-page h-screen max-h-screen overflow-hidden p-2 md:p-3 lg:p-4">
  <div class="flex flex-col h-full max-h-full overflow-hidden">
    <!-- Compact Header Row -->
    <div class="header-row flex items-center justify-between gap-2 md:gap-3 mb-2 flex-shrink-0">
      <!-- Left: Room Name -->
      <div class="flex-1 min-w-0">
        <h1 class="text-xl md:text-2xl lg:text-3xl font-bold text-christmas-gold truncate drop-shadow-2xl" title={roomName || t('room.title', { code: roomCode })}>
          {roomName || t('room.title', { code: roomCode })}
        </h1>
        {#if roomDescription}
          <p class="text-xs md:text-sm text-white/70 truncate" title={roomDescription}>{roomDescription}</p>
        {/if}
      </div>
      
      <!-- Center: Connection Status (Compact) -->
      <div class="flex-shrink-0">
        {#if connectionError}
          <div class="status-badge bg-red-500/20 border-red-500 px-2 py-1 rounded text-xs">
            <span class="text-red-200">⚠️</span>
          </div>
        {:else if !$connected || verifyingConnection}
          <div class="status-badge bg-yellow-500/20 border-yellow-500 px-2 py-1 rounded text-xs">
            <span class="text-yellow-200">🟡</span>
          </div>
        {:else if $connected}
          <div class="status-badge bg-green-500/20 border-green-500 px-2 py-1 rounded text-xs">
            <span class="text-green-200">🟢</span>
          </div>
        {/if}
      </div>
      
      <!-- Right: Settings Button -->
      {#if isHost}
        <a href="/room/{roomCode}/settings" class="btn-secondary text-xs md:text-sm px-3 md:px-4 py-1.5 md:py-2 inline-flex items-center gap-1.5 flex-shrink-0">
          ⚙️ <span class="hidden md:inline">{t('room.gameSettings')}</span>
        </a>
      {/if}
    </div>

    <div class="grid lg:grid-cols-3 gap-2 md:gap-3 flex-1 min-h-0 overflow-hidden grid-rows-1" style="gap: clamp(0.5rem, 1vw, 0.75rem);">
      <!-- Left Column: Jukebox & QR Code -->
      <div class="lg:col-span-1 flex flex-col min-h-0 overflow-y-auto space-y-2 md:space-y-3 pr-2">
        <!-- Jukebox (Host Only) - Compact at Top -->
        {#if isHost}
          <Jukebox {roomCode} {isHost} />
        {/if}

        <!-- QR Code Card -->
        <div class="card text-center frosted-glass flex-shrink-0">
          <h2 class="text-base md:text-lg font-bold mb-1.5 md:mb-2">📱 {t('room.scanToJoin')}</h2>
          {#if qrCodeDataUrl}
            <div class="bg-white p-2 rounded-xl inline-block mb-1.5 md:mb-2 shadow-2xl">
              <img src={qrCodeDataUrl} alt="QR Code" class="w-32 md:w-40 h-32 md:h-40" />
            </div>
          {/if}
          <p class="text-xs text-white/80 mb-1">{t('room.orVisit')}</p>
          <p class="text-xs text-christmas-gold font-mono break-all px-2">
            {joinUrl || `${origin}/join?code=${roomCode}`}
          </p>
        </div>

        <!-- Share Room Component -->
        <ShareRoom {roomCode} {joinUrl} />
      </div>

      <!-- Middle Column: Players -->
      <div class="lg:col-span-1 flex flex-col min-h-0">
        <div class="card frosted-glass flex flex-col flex-1 min-h-0">
          <h2 class="text-lg md:text-xl font-bold mb-2 md:mb-3 text-center">
            👥 {t('room.players')}
            <span class="text-christmas-gold">({$players.length})</span>
          </h2>
          
          <div class="space-y-1.5 md:space-y-2 flex-1 overflow-y-auto pr-2 min-h-0 player-list-container">
            {#if !$connected || verifyingConnection}
              <!-- Connection loading state -->
              <div class="text-center py-8">
                <div class="inline-block animate-spin text-3xl md:text-4xl mb-2">⏳</div>
                <p class="text-base md:text-lg text-white/50">{t('common.status.connecting')}</p>
              </div>
            {:else if $players.length === 0}
              <!-- Empty state: no players yet -->
              <div class="text-center py-8">
                <div class="text-5xl md:text-6xl mb-2">👥</div>
                <p class="text-base md:text-lg text-white/50 mb-2">{t('room.waitingPlayers')}</p>
                <p class="text-sm md:text-base text-white/40">{t('room.scanQrCode')}</p>
              </div>
            {:else}
              <!-- Player list - Redesigned for engagement -->
              {#each sortedPlayers as player, index}
                <div 
                  class="player-card flex items-center gap-2 md:gap-3 p-2 md:p-3 bg-gradient-to-r from-white/10 to-white/5 rounded-lg hover:from-white/20 hover:to-white/10 transition-all border border-white/10 hover:border-christmas-gold/30" 
                  class:top-player={index < 3 && (player.score || 0) > 0}
                  class:current-player={player.id === $socket?.id}
                >
                  <!-- Rank/Medal -->
                  <div class="flex-shrink-0 w-8 md:w-10 text-center">
                    {#if index === 0 && (player.score || 0) > 0}
                      <span class="text-xl md:text-2xl">🥇</span>
                    {:else if index === 1 && (player.score || 0) > 0}
                      <span class="text-xl md:text-2xl">🥈</span>
                    {:else if index === 2 && (player.score || 0) > 0}
                      <span class="text-xl md:text-2xl">🥉</span>
                    {:else}
                      <span class="text-sm md:text-base text-white/60 font-bold">#{index + 1}</span>
                    {/if}
                  </div>
                  
                  <!-- Avatar - More prominent -->
                  <span class="text-2xl md:text-3xl flex-shrink-0 transform transition-transform hover:scale-110">{player.avatar || '🎄'}</span>
                  
                  <!-- Name and Score Container -->
                  <div class="flex-1 min-w-0 flex flex-col">
                    <div class="flex items-center gap-2">
                      <span class="text-sm md:text-base font-semibold flex-1 truncate" title={player.name}>
                        {player.name}
                      </span>
                      {#if player.id === $socket?.id}
                        <span class="text-xs bg-christmas-gold text-black px-2 py-0.5 rounded-full font-bold flex-shrink-0 animate-pulse">
                          {t('common.label.you')}
                        </span>
                      {/if}
                    </div>
                    <!-- Score -->
                    <div class="flex items-center gap-1 text-xs md:text-sm">
                      <span class="font-bold text-christmas-gold">
                        {player.score || 0}
                      </span>
                      <span class="text-white/50">{t('common.label.pts')}</span>
                    </div>
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        </div>
      </div>

      <!-- Right Column: Games or Guessing Dashboard -->
      <div class="lg:col-span-1 flex flex-col min-h-0">
        {#if isHost}
          <!-- Tab Navigation for Host -->
          <div class="mb-4 md:mb-6">
            <div class="flex gap-2 md:gap-3 rounded-lg bg-white/10 p-1 backdrop-blur-sm">
              <button
                type="button"
                class="flex-1 px-3 md:px-4 py-2 md:py-3 rounded-md font-bold text-base md:text-lg transition-all {activeRoomTab === 'games' ? 'bg-christmas-red text-white' : 'text-white/70 hover:bg-white/10'}"
                on:click={() => (activeRoomTab = 'games')}
              >
                🎮 {t('room.tabs.games')}
              </button>
              <button
                type="button"
                class="flex-1 px-3 md:px-4 py-2 md:py-3 rounded-md font-bold text-base md:text-lg transition-all {activeRoomTab === 'guessing' ? 'bg-christmas-red text-white' : 'text-white/70 hover:bg-white/10'}"
                on:click={() => (activeRoomTab = 'guessing')}
              >
                🎯 {t('room.tabs.guessing')}
              </button>
            </div>
          </div>
        {/if}

        {#if activeRoomTab === 'guessing' && isHost}
          <!-- Guessing Dashboard -->
          <div class="card frosted-glass flex flex-col flex-1 min-h-0">
            <HostGuessingDashboard {roomCode} {origin} />
          </div>
        {:else}
          <!-- Game Selection -->
          <div class="card frosted-glass flex flex-col flex-1 min-h-0">
            <h2 class="text-lg md:text-xl font-bold mb-2 md:mb-3 text-center">🎮 {t('room.selectGame')}</h2>
            <div class="grid grid-cols-1 gap-2 md:gap-2.5 flex-1 overflow-y-auto min-h-0" style="gap: clamp(0.5rem, 1vw, 0.625rem);">
              {#each games as game}
                {#if game.type}
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
                {/if}
              {/each}
            </div>

            {#if isHost && selectedGame}
              <div class="mt-2 md:mt-3 text-center">
                {#if $players.length < 2}
                  <p class="text-sm md:text-base text-yellow-300 mb-2">
                    ⚠️ {t('room.needPlayers')}
                  </p>
                {/if}
              </div>
            {:else if !isHost}
              <div class="mt-2 md:mt-3 p-3 md:p-4 bg-white/10 rounded-xl text-center">
                <p class="text-sm md:text-base text-white/80">
                  {t('room.waitingHost')}
                </p>
              </div>
            {/if}
          </div>
        {/if}
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
    /* Desktop-optimized: compact, viewport-aware */
    font-size: clamp(0.875rem, 1.2vw, 1rem);
    display: flex;
    flex-direction: column;
  }

  /* Ensure all interactive elements are appropriately sized */
  :global(.room-page button),
  :global(.room-page a.btn-primary),
  :global(.room-page a.btn-secondary) {
    min-height: clamp(40px, 5vh, 50px);
    font-size: clamp(0.875rem, 1.2vw, 1rem);
    padding: clamp(0.5rem, 1vh, 0.75rem) clamp(1rem, 1.5vw, 1.5rem);
  }

  /* High contrast for desktop visibility */
  .room-page {
    color: #ffffff;
  }

  /* Clear visual hierarchy */
  .room-page h1,
  .room-page h2,
  .room-page h3 {
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
  }

  /* Compact header row */
  .header-row {
    border-bottom: 1px solid rgba(255, 215, 0, 0.2);
    padding-bottom: 0.5rem;
  }

  .status-badge {
    border: 1px solid;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Compact card layout */
  :global(.room-page .card) {
    padding: clamp(1rem, 1.5vw, 1.5rem);
  }

  /* Player list container */
  .player-list-container {
    scrollbar-width: thin;
    scrollbar-color: #C41E3A transparent;
  }

  .player-list-container::-webkit-scrollbar {
    width: 8px;
  }

  .player-list-container::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.1);
    border-radius: 4px;
  }

  .player-list-container::-webkit-scrollbar-thumb {
    background: repeating-linear-gradient(
      45deg,
      #C41E3A 0px,
      #C41E3A 4px,
      #ffffff 4px,
      #ffffff 8px
    );
    border-radius: 4px;
  }

  /* Top player styling */
  :global(.top-player) {
    background: linear-gradient(135deg, rgba(255, 215, 0, 0.2), rgba(255, 215, 0, 0.1)) !important;
    border-color: rgba(255, 215, 0, 0.4) !important;
    box-shadow: 0 2px 8px rgba(255, 215, 0, 0.3) !important;
  }

  :global(.top-player:hover) {
    background: linear-gradient(135deg, rgba(255, 215, 0, 0.3), rgba(255, 215, 0, 0.15)) !important;
    border-color: rgba(255, 215, 0, 0.6) !important;
  }

  /* Current player styling */
  :global(.current-player) {
    border-color: rgba(255, 215, 0, 0.5) !important;
    box-shadow: 0 0 10px rgba(255, 215, 0, 0.2) !important;
  }

  /* Player list improvements */
  :global(.room-page .player-card) {
    animation: fadeIn 0.3s ease-in;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateX(-10px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
</style>
