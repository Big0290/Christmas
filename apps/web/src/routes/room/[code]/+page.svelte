<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import { onMount, onDestroy } from 'svelte';
  import { socket, connectSocket, players, connected, gameState, startKeepAlive, stopKeepAlive, getLastKeepAliveSuccess } from '$lib/socket';
  import QRCode from 'qrcode';
  import { GameType, GameState } from '@christmas/core';
  import { playSoundOnce } from '$lib/audio';
  import { loadRoomTheme, applyRoomTheme, roomTheme } from '$lib/theme';
  import ShareRoom from '$lib/components/room/ShareRoom.svelte';
  import PlayerLobbyAnimation from '$lib/components/PlayerLobbyAnimation.svelte';
  import PlayerList from '$lib/components/PlayerList.svelte';
  import { t, language } from '$lib/i18n';
  import { get } from 'svelte/store';

  const roomCode = $page.params.code;
  let qrCodeDataUrl = '';
  let isHost = false;
  let origin = '';
  let joinUrl = '';
  let verifyingConnection = false;
  let connectionError = '';
  let roomName = '';
  let roomDescription = '';
  let connectionTimeout: ReturnType<typeof setTimeout> | null = null;
  
  // Debug logging (dev mode only)
  $: if (import.meta.env.DEV) {
    console.log('[Room] Players store updated:', $players);
    console.log('[Room] Players count:', $players.length);
    console.log('[Room] Socket connected:', $connected);
    console.log('[Room] Is host:', isHost);
  }


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

    // Check if we're the host and redirect to mode selector
    if (browser) {
      const hostToken = localStorage.getItem('christmas_hostToken');
      const savedRoomCode = localStorage.getItem('christmas_roomCode');
      const hasHostToken = !!(hostToken && savedRoomCode === roomCode);
      
      if (hasHostToken) {
        // Host detected - redirect to mode selector
        console.log('[Room] Host detected, redirecting to mode selector');
        goto(`/room/${roomCode}/host`);
        return;
      }
      
      // Not a host - check sessionStorage for backward compatibility
      const storedIsHost = sessionStorage.getItem(`host_${roomCode}`);
      if (storedIsHost === 'true') {
        isHost = true;
      } else {
        isHost = false; // Not a host - this is a player view
      }
    } else {
      isHost = false;
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

        // If we just created this room, redirect to mode selector
        if (justCreatedRoom === roomCode) {
          console.log('[Room] Just created this room - redirecting to mode selector');
          sessionStorage.removeItem('just_created_room'); // Clear flag
          verifyingConnection = false;
          goto(`/room/${roomCode}/host`);
          return;
        }

        // If host token exists, redirect to mode selector (hosts shouldn't stay on room page)
        if (hostToken && savedRoomCode === roomCode) {
          console.log('[Room] Host detected, redirecting to mode selector');
          verifyingConnection = false;
          goto(`/room/${roomCode}/host`);
          return;
        }
        
        // Not a host - continue as normal player
        verifyingConnection = false;
        console.log('[Room] Not a host, continuing as player');
      }
    };

    // Setup socket event listeners - wait for socket to be available
    const setupSocketListeners = () => {
      if (!$socket) return;

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
        console.log('[Room] 🎮 game_started received:', gameType);
        playSoundOnce('gameStart', 1000);
        // Stop keep-alive when game starts (not needed during active gameplay)
        stopKeepAlive();
        // Hosts should already be in controller/display view, but redirect just in case
        if (isHost) {
          goto(`/room/${roomCode}/host`);
        } else {
          // Redirect players to game page when game starts
          console.log('[Room] 🎮 Redirecting player to game page');
          goto(`/play/${roomCode}`);
        }
      });

      // Listen for game end
      $socket.on('game_ended', (data: any) => {
        console.log('[Room] 🏁 game_ended received:', data);
        playSoundOnce('gameEnd', 2000);
        // Restart keep-alive when game ends (back in lobby)
        const currentState = get(gameState);
        if (!currentState || currentState.state === GameState.LOBBY || currentState.state === GameState.GAME_END) {
          if ($connected && !isHost) {
            startKeepAlive(roomCode);
          }
        }
      });

      // Listen for room settings updates
      $socket.on('room_settings_updated', (settings: any) => {
        if (settings.roomName !== undefined) roomName = settings.roomName || '';
        if (settings.description !== undefined) roomDescription = settings.description || '';
        
        // Update theme if theme settings changed
        if (
          settings.sparkles !== undefined ||
          settings.icicles !== undefined ||
          settings.frostPattern !== undefined ||
          settings.colorScheme !== undefined ||
          settings.backgroundMusic !== undefined ||
          settings.snowEffect !== undefined ||
          settings.language !== undefined
        ) {
          roomTheme.update((theme) => {
            if (!theme) {
              // If no theme exists, create one from settings
              const newTheme = {
                snowEffect: settings.snowEffect ?? true,
                backgroundMusic: settings.backgroundMusic ?? true,
                sparkles: settings.sparkles ?? true,
                icicles: settings.icicles ?? false,
                frostPattern: settings.frostPattern ?? true,
                colorScheme: settings.colorScheme ?? 'mixed',
                language: settings.language,
              };
              applyRoomTheme(newTheme);
              return newTheme;
            }
            // Update existing theme
            const updated = { ...theme };
            if (settings.backgroundMusic !== undefined) updated.backgroundMusic = settings.backgroundMusic;
            if (settings.snowEffect !== undefined) updated.snowEffect = settings.snowEffect;
            if (settings.sparkles !== undefined) updated.sparkles = settings.sparkles;
            if (settings.icicles !== undefined) updated.icicles = settings.icicles;
            if (settings.frostPattern !== undefined) updated.frostPattern = settings.frostPattern;
            if (settings.colorScheme !== undefined) updated.colorScheme = settings.colorScheme;
            if (settings.language !== undefined) {
              updated.language = settings.language;
              language.set(settings.language);
            }
            applyRoomTheme(updated);
            return updated;
          });
        }
      });
    };

    // Setup listeners immediately or wait for socket
    if ($socket) {
      setupSocketListeners();
    } else {
      const unsubscribe = socket.subscribe((sock) => {
        if (sock) {
          unsubscribe();
          setupSocketListeners();
        }
      });
    }

    // Watch for connection success to clear timeout and start keep-alive
    // Note: Hosts are redirected immediately, so verifyHostConnection is only for players
    const unsubscribeConnected = connected.subscribe((isConnected) => {
      if (isConnected && connectionTimeout) {
        clearTimeout(connectionTimeout);
        connectionTimeout = null;
      }
      // Only verify host connection if not a host (hosts are redirected immediately)
      if (isConnected && $socket && !isHost) {
        verifyHostConnection();
        
        // Reconnect player if they're already in the room
        // Note: If reconnection fails, that's okay - they can still view the lobby and join via QR code
        if (browser) {
          const playerToken = localStorage.getItem('christmas_playerToken');
          const savedRoomCode = localStorage.getItem('christmas_roomCode');
          const playerName = localStorage.getItem('christmas_playerName');
          
          if (playerToken && savedRoomCode === roomCode && playerName) {
            // Player is already in this room - try to reconnect to get player list
            // Only try once - if it fails, they can still view the lobby
            console.log('[Room] 🔄 Socket connected, attempting to reconnect player to sync player list...');
            const currentLang = get(language) || 'en';
            $socket.emit('reconnect_player', roomCode, playerToken, currentLang, (response: any) => {
              if (response && response.success) {
                console.log('[Room] ✅ Successfully reconnected to room, player list should sync');
                // Player list will be synced via room_update event from server
              } else {
                // Reconnection failed - this is okay for lobby page
                // Player might not be in room anymore, or room might have been reset
                // They can still view the lobby and join via QR code
                console.log('[Room] ℹ️ Reconnect failed (player may not be in room):', response?.error);
                console.log('[Room] ℹ️ Player can still view lobby and join via QR code');
              }
            });
          } else {
            console.log('[Room] ℹ️ Player not yet in room - they can join via QR code');
          }
        }
        
        // Start keep-alive for players in lobby
        startKeepAlive(roomCode);
        // Ensure theme is loaded when connected
        loadRoomSettings();
      } else if (!isConnected) {
        // Stop keep-alive when disconnected
        stopKeepAlive();
      }
    });

    // Initial check - if already connected and not a host, verify immediately
    if ($socket && $connected && !isHost) {
      verifyHostConnection();
      
      // Check if player is already in the room (has playerToken) and reconnect if needed
      // Note: If reconnection fails, that's okay - they can still view the lobby and join via QR code
      if (browser) {
        const playerToken = localStorage.getItem('christmas_playerToken');
        const savedRoomCode = localStorage.getItem('christmas_roomCode');
        const playerName = localStorage.getItem('christmas_playerName');
        
        if (playerToken && savedRoomCode === roomCode && playerName) {
          // Player is already in this room - try to reconnect to get player list
          // Only try once - if it fails, they can still view the lobby
          console.log('[Room] 🔄 Player already in room, attempting to reconnect to sync player list...');
          const currentLang = get(language) || 'en';
          $socket.emit('reconnect_player', roomCode, playerToken, currentLang, (response: any) => {
            if (response && response.success) {
              console.log('[Room] ✅ Successfully reconnected to room, player list should sync');
              // Player list will be synced via room_update event from server
            } else {
              // Reconnection failed - this is okay for lobby page
              // Player might not be in room anymore, or room might have been reset
              // They can still view the lobby and join via QR code
              console.log('[Room] ℹ️ Reconnect failed (player may not be in room):', response?.error);
              console.log('[Room] ℹ️ Player can still view lobby and join via QR code');
            }
          });
        } else {
          console.log('[Room] ℹ️ Player not yet in room - they can join via QR code');
        }
      }
      
      // Start keep-alive if already connected
      startKeepAlive(roomCode);
      
      // Check if game is already active - redirect if so
      const currentGameState = get(gameState);
      if (currentGameState && currentGameState.state !== GameState.LOBBY && currentGameState.state !== GameState.GAME_END) {
        console.log('[Room] 🎮 Game already active, redirecting to game page');
        goto(`/play/${roomCode}`);
      }
    }

    // Load room settings
    loadRoomSettings();

    // Cleanup subscriptions on destroy
    return () => {
      unsubscribeConnected();
      unsubscribeGameState();
      // Stop keep-alive on component destroy
      stopKeepAlive();
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
      $socket.off('game_ended');
      $socket.off('room_settings_updated');
    }
  });


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
      <div class="flex-shrink-0 flex items-center gap-2">
        {#if connectionError}
          <div class="status-badge bg-red-500/20 border-red-500 px-2 py-1 rounded text-xs" title="Connection Error">
            <span class="text-red-200">⚠️</span>
          </div>
        {:else if !$connected || verifyingConnection}
          <div class="status-badge bg-yellow-500/20 border-yellow-500 px-2 py-1 rounded text-xs" title="Connecting...">
            <span class="text-yellow-200">🟡</span>
          </div>
        {:else if $connected}
          <div class="status-badge bg-green-500/20 border-green-500 px-2 py-1 rounded text-xs" title="Connected">
            <span class="text-green-200">🟢</span>
          </div>
        {/if}
        {#if $connected && !isHost}
          {@const lastKeepAlive = getLastKeepAliveSuccess()}
          {#if lastKeepAlive}
            {@const timeSinceKeepAlive = Date.now() - lastKeepAlive}
            {#if timeSinceKeepAlive < 60000}
              <div class="status-badge bg-green-500/20 border-green-500 px-2 py-1 rounded text-xs" title="Keep-alive active">
                <span class="text-green-200">💚</span>
              </div>
            {:else if timeSinceKeepAlive < 90000}
              <div class="status-badge bg-yellow-500/20 border-yellow-500 px-2 py-1 rounded text-xs" title="Keep-alive delayed">
                <span class="text-yellow-200">💛</span>
              </div>
            {:else}
              <div class="status-badge bg-red-500/20 border-red-500 px-2 py-1 rounded text-xs" title="Keep-alive failed">
                <span class="text-red-200">❤️</span>
              </div>
            {/if}
          {/if}
        {/if}
      </div>
      
      <!-- Right: Settings (if needed for players) -->
    </div>

    <div class="grid lg:grid-cols-3 gap-2 md:gap-3 flex-1 min-h-0 overflow-hidden grid-rows-1" style="gap: clamp(0.5rem, 1vw, 0.75rem);">
      <!-- Left Column: Jukebox & QR Code -->
      <div class="lg:col-span-1 flex flex-col min-h-0 overflow-y-auto space-y-2 md:space-y-3 pr-2">
        <!-- Jukebox removed - hosts are redirected to mode selector -->

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
          
          <div class="flex-1 overflow-y-auto pr-2 min-h-0">
            {#if !$connected || verifyingConnection}
              <!-- Connection loading state -->
              <div class="text-center py-8">
                <div class="inline-block animate-spin text-3xl md:text-4xl mb-2">⏳</div>
                <p class="text-base md:text-lg text-white/50">{t('common.status.connecting')}</p>
              </div>
            {:else}
              <!-- Live Player List with animations -->
              <PlayerList players={$players} showScores={true} showRanking={true} />
            {/if}
          </div>
        </div>
      </div>

      <!-- Right Column: Waiting Message with Christmas Animation -->
      <div class="lg:col-span-1 flex flex-col min-h-0">
        <div class="card frosted-glass flex flex-col flex-1 min-h-0 p-0 overflow-hidden">
          <PlayerLobbyAnimation 
            waitingText={t('room.waitingHost') || 'Waiting for Game'}
            subtitleText={t('room.waitingHostDescription') || 'The host will start a game soon...'}
          />
        </div>
      </div>
    </div>
  </div>

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

</style>
