<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { socket, connectSocket, gameState, players, connected } from '$lib/socket';
  import { GameState, GameType } from '@christmas/core';
  import { playSound, playSoundOnce } from '$lib/audio';
  import HostConnectionStatus from '$lib/components/host/HostConnectionStatus.svelte';
  import HostConfirmationDialog from '$lib/components/host/HostConfirmationDialog.svelte';
  import HostLobbyScreen from '$lib/components/host/HostLobbyScreen.svelte';
  import HostHeader from '$lib/components/host/HostHeader.svelte';
  import HostBottomScorebar from '$lib/components/host/HostBottomScorebar.svelte';
  import HostControlPanel from '$lib/components/host/HostControlPanel.svelte';
  import HostGameDisplay from '$lib/components/host/HostGameDisplay.svelte';
  import HostLeaderboardDisplay from '$lib/components/host/HostLeaderboardDisplay.svelte';
  import { t, language } from '$lib/i18n';
  import { loadRoomTheme, applyRoomTheme, roomTheme, currentRoomCode } from '$lib/theme';

  const roomCode = ($page.params.code || '').toUpperCase();
  const role = $page.url.searchParams.get('role');
  
  // Route protection: enforce mode selector access
  onMount(() => {
    if (!browser) return;
    
    // Check for host token
    const hostToken = localStorage.getItem('christmas_hostToken');
    const savedRoomCode = localStorage.getItem('christmas_roomCode');
    const hasHostToken = !!(hostToken && savedRoomCode === roomCode);
    
    if (!hasHostToken) {
      console.warn('[Control] No host token found, redirecting to room page');
      goto(`/room/${roomCode}`);
      return;
    }
    
    // Check for role query param
    if (!role || role !== 'host-control') {
      console.warn('[Control] Invalid or missing role query param, redirecting to mode selector');
      goto(`/room/${roomCode}/host`);
      return;
    }
    
    // Check for mode in sessionStorage (must come from mode selector)
    const storedMode = sessionStorage.getItem(`host_mode_${roomCode}`);
    if (!storedMode || storedMode !== 'host-control') {
      console.warn('[Control] Mode not set in sessionStorage, redirecting to mode selector');
      goto(`/room/${roomCode}/host`);
      return;
    }
    
    if (role === 'player') {
      goto(`/play/${roomCode}`);
      return;
    }
  });

  let controlPanelOpen = false;
  let showConfirmDialog = false;
  let confirmMessage = '';
  let isPaused = false;
  let origin = '';
  let leaderboardTab: 'session' | 'global' = 'session';
  let error = '';
  let listenersSetup = false;
  let connectionTimeout: ReturnType<typeof setTimeout> | null = null;
  let connectionSubscription: (() => void) | null = null;

  let currentState: GameState | undefined = undefined;
  let currentGameType: GameType | null = null;
  let scoreboard: any[] = [];
  let round = 0;
  let maxRounds = 0;
  // Store scoreboard from game_ended event to preserve it during sync
  let gameEndedScoreboard: any[] | null = null;
  let gameEndedGameType: GameType | null = null;

  // Live Preview drag and resize state
  const PREVIEW_STORAGE_KEY = `live_preview_${roomCode}`;
  const DEFAULT_WIDTH = 300;
  const DEFAULT_HEIGHT = 400;
  const DEFAULT_X = 20;
  const DEFAULT_Y = 80;
  const MIN_WIDTH = 200;
  const MIN_HEIGHT = 150;
  const MAX_WIDTH = 800;
  const MAX_HEIGHT = 600;

  let previewX = DEFAULT_X;
  let previewY = DEFAULT_Y;
  let previewWidth = DEFAULT_WIDTH;
  let previewHeight = DEFAULT_HEIGHT;
  let isDragging = false;
  let isResizing = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let resizeStartX = 0;
  let resizeStartY = 0;
  let resizeStartWidth = 0;
  let resizeStartHeight = 0;
  let previewElement: HTMLDivElement | null = null;

  function handleManualReconnect() {
    if (!browser) return;
    const hostToken = localStorage.getItem('christmas_hostToken');
    const savedRoomCode = localStorage.getItem('christmas_roomCode');
      if (hostToken && savedRoomCode === roomCode && $socket) {
        const currentLanguage = get(language);
        ($socket as any).emit(
          'reconnect_host',
          roomCode,
          hostToken,
          currentLanguage,
          'host-control', // Pass role to reconnect_host
          (response: any) => {
            if (!response || !response.success) {
              alert(`Failed to reconnect: ${response?.error || 'Unknown error'}. Please go to /room/${roomCode} first.`);
            } else {
              console.log('[Control] Successfully reconnected as host-control via manual reconnect');
            }
          }
        );
      } else {
        goto(`/room/${roomCode}`);
      }
  }

  function showConfirmation(message: string, action: () => void) {
    confirmMessage = message;
    confirmActionRef = action;
    showConfirmDialog = true;
  }

  let confirmActionRef: (() => void) | null = null;

  // Load preview position and size from localStorage
  function loadPreviewSettings() {
    if (!browser) return;
    try {
      const saved = localStorage.getItem(PREVIEW_STORAGE_KEY);
      if (saved) {
        const settings = JSON.parse(saved);
        previewX = settings.x ?? DEFAULT_X;
        previewY = settings.y ?? DEFAULT_Y;
        previewWidth = settings.width ?? DEFAULT_WIDTH;
        previewHeight = settings.height ?? DEFAULT_HEIGHT;
      }
    } catch (e) {
      console.warn('[Control] Failed to load preview settings:', e);
    }
  }

  // Save preview position and size to localStorage
  function savePreviewSettings() {
    if (!browser) return;
    try {
      localStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify({
        x: previewX,
        y: previewY,
        width: previewWidth,
        height: previewHeight
      }));
    } catch (e) {
      console.warn('[Control] Failed to save preview settings:', e);
    }
  }

  // Drag handlers
  function handleDragStart(e: MouseEvent) {
    if (!previewElement) return;
    isDragging = true;
    dragStartX = e.clientX - previewX;
    dragStartY = e.clientY - previewY;
    e.preventDefault();
  }

  function handleDragMove(e: MouseEvent) {
    if (!isDragging || !previewElement) return;
    
    const newX = e.clientX - dragStartX;
    const newY = e.clientY - dragStartY;
    
    // Constrain to viewport bounds
    const maxX = window.innerWidth - previewWidth;
    const maxY = window.innerHeight - previewHeight;
    
    // Prevent preview from overlapping control toggle button area
    // Toggle button is at: top: calc(clamp(60px, 8vh, 70px) + 1rem), right: 1rem, size: 48px
    const headerHeight = Math.max(60, Math.min(window.innerHeight * 0.08, 70));
    const toggleTop = headerHeight + 16; // 1rem = 16px
    const toggleRight = 16; // 1rem = 16px
    const toggleSize = 48;
    const toggleBottom = toggleTop + toggleSize;
    const toggleLeft = window.innerWidth - toggleRight - toggleSize;
    
    // Add padding to prevent overlap
    const padding = 10;
    const minX = 0;
    const minY = 0;
    const maxXConstrained = Math.min(maxX, toggleLeft - previewWidth - padding);
    const maxYConstrained = Math.min(maxY, toggleTop - previewHeight - padding);
    
    // If preview would overlap toggle area, constrain it
    let constrainedX = newX;
    let constrainedY = newY;
    
    if (newX + previewWidth + padding > toggleLeft && newX < toggleLeft + toggleSize + padding) {
      // Would overlap horizontally - constrain to left of toggle
      constrainedX = Math.min(newX, toggleLeft - previewWidth - padding);
    }
    
    if (newY + previewHeight + padding > toggleTop && newY < toggleBottom + padding) {
      // Would overlap vertically - constrain above toggle
      constrainedY = Math.min(newY, toggleTop - previewHeight - padding);
    }
    
    previewX = Math.max(minX, Math.min(constrainedX, maxX));
    previewY = Math.max(minY, Math.min(constrainedY, maxY));
  }

  function handleDragEnd() {
    if (isDragging) {
      isDragging = false;
      savePreviewSettings();
    }
  }

  // Resize handlers
  function handleResizeStart(e: MouseEvent) {
    if (!previewElement) return;
    isResizing = true;
    resizeStartX = e.clientX;
    resizeStartY = e.clientY;
    resizeStartWidth = previewWidth;
    resizeStartHeight = previewHeight;
    e.preventDefault();
    e.stopPropagation();
  }

  function handleResizeMove(e: MouseEvent) {
    if (!isResizing || !previewElement) return;
    
    const deltaX = e.clientX - resizeStartX;
    const deltaY = e.clientY - resizeStartY;
    
    let newWidth = resizeStartWidth + deltaX;
    let newHeight = resizeStartHeight + deltaY;
    
    // Apply constraints
    newWidth = Math.max(MIN_WIDTH, Math.min(newWidth, MAX_WIDTH));
    newHeight = Math.max(MIN_HEIGHT, Math.min(newHeight, MAX_HEIGHT));
    
    // Ensure preview stays within viewport
    const maxX = window.innerWidth - newWidth;
    const maxY = window.innerHeight - newHeight;
    
    if (previewX + newWidth > window.innerWidth) {
      previewX = Math.max(0, maxX);
    }
    if (previewY + newHeight > window.innerHeight) {
      previewY = Math.max(0, maxY);
    }
    
    previewWidth = newWidth;
    previewHeight = newHeight;
  }

  function handleResizeEnd() {
    if (isResizing) {
      isResizing = false;
      savePreviewSettings();
    }
  }

  // Global mouse event handlers
  function handleMouseMove(e: MouseEvent) {
    if (isDragging) {
      handleDragMove(e);
    } else if (isResizing) {
      handleResizeMove(e);
    }
  }

  function handleMouseUp() {
    handleDragEnd();
    handleResizeEnd();
  }

  // Constrain preview position when window is resized
  function handleWindowResize() {
    if (!previewElement) return;
    const maxX = window.innerWidth - previewWidth;
    const maxY = window.innerHeight - previewHeight;
    
    if (previewX > maxX) {
      previewX = Math.max(0, maxX);
    }
    if (previewY > maxY) {
      previewY = Math.max(0, maxY);
    }
    
    // Also constrain size if window is smaller than preview
    if (previewWidth > window.innerWidth) {
      previewWidth = Math.max(MIN_WIDTH, window.innerWidth - 20);
      previewX = Math.max(0, window.innerWidth - previewWidth);
    }
    if (previewHeight > window.innerHeight) {
      previewHeight = Math.max(MIN_HEIGHT, window.innerHeight - 20);
      previewY = Math.max(0, window.innerHeight - previewHeight);
    }
    
    savePreviewSettings();
  }

  onMount(() => {
    // Skip if invalid role or missing sessionStorage mode (already handled above)
    if (!browser) return;
    
    // Load preview settings
    loadPreviewSettings();
    
    // Theme will be loaded after socket connects (see waitForConnection)
    // This prevents trying to load before socket is ready
    
    const hostToken = localStorage.getItem('christmas_hostToken');
    const savedRoomCode = localStorage.getItem('christmas_roomCode');
    const hasHostToken = !!(hostToken && savedRoomCode === roomCode);
    const storedMode = sessionStorage.getItem(`host_mode_${roomCode}`);
    
    if (!hasHostToken || !role || role !== 'host-control' || !storedMode || storedMode !== 'host-control') {
      return;
    }

    // Add global mouse event listeners
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('resize', handleWindowResize);

    if (!$socket) {
      connectSocket().catch((err) => {
        console.error('[Control] Failed to connect socket:', err);
        error = 'Failed to connect to server. Please refresh the page.';
      });
    }

    if (browser) {
      origin = window.location.origin;
    }

    connectionTimeout = setTimeout(() => {
      if (!$connected) {
        error = 'Connection timeout. Please check your internet connection and refresh the page.';
      }
    }, 15000);

    const setupSocketListeners = () => {
      if (!$socket || listenersSetup) return;
      listenersSetup = true;

      const waitForConnection = () => {
        console.log('[Control] 🔄 waitForConnection called', {
          connected: $connected,
          socketConnected: $socket?.connected,
          hasSocket: !!$socket
        });
        
        if (!$connected || !$socket?.connected) {
          console.log('[Control] 🔄 Waiting for socket connection...');
          // Subscribe to both connected store and socket store to catch when both are ready
          let unsubscribeConnected: (() => void) | null = null;
          let unsubscribeSocket: (() => void) | null = null;
          
          const cleanup = () => {
            if (unsubscribeConnected) unsubscribeConnected();
            if (unsubscribeSocket) unsubscribeSocket();
          };
          
          unsubscribeConnected = connected.subscribe((isConnected) => {
            if (isConnected) {
              // Use a small delay to allow socket.connected to update
              setTimeout(() => {
                const $socketNow = get(socket);
                const $connectedNow = get(connected);
                console.log('[Control] 🔄 Connection state changed (delayed check):', {
                  storeConnected: isConnected,
                  socketConnected: $socketNow?.connected,
                  currentStoreConnected: $connectedNow
                });
                if ($socketNow && $socketNow.connected && $connectedNow) {
                  cleanup();
                  if (connectionSubscription) connectionSubscription();
                  connectionSubscription = null;
                  console.log('[Control] 🔄 Socket connected, calling attemptHostReconnect...');
                  attemptHostReconnect();
                }
              }, 200);
            }
          });
          
          // Also subscribe to socket store in case it updates after connected store
          unsubscribeSocket = socket.subscribe((sock) => {
            if (sock) {
              const $connectedNow = get(connected);
              console.log('[Control] 🔄 Socket store updated:', {
                hasSocket: !!sock,
                socketConnected: sock.connected,
                storeConnected: $connectedNow
              });
              if (sock.connected && $connectedNow) {
                cleanup();
                if (connectionSubscription) connectionSubscription();
                connectionSubscription = null;
                console.log('[Control] 🔄 Socket store updated and connected, calling attemptHostReconnect...');
                attemptHostReconnect();
              }
            }
          });
          
          if (connectionSubscription) connectionSubscription();
          connectionSubscription = cleanup;
          
          setTimeout(() => {
            cleanup();
            connectionSubscription = null;
            const $socketNow = get(socket);
            const $connectedNow = get(connected);
            if (!$connectedNow || !$socketNow?.connected) {
              error = 'Failed to connect to server. Please refresh the page.';
            }
          }, 10000);
        } else {
          console.log('[Control] 🔄 Socket already connected, calling attemptHostReconnect immediately...');
          // Socket already connected - don't load theme yet, wait for reconnect response
          attemptHostReconnect();
        }
      };

      function attemptHostReconnect() {
        console.log('[Control] 🔄 attemptHostReconnect called', {
          browser,
          hasSocket: !!$socket,
          connected: $connected,
          socketConnected: $socket?.connected
        });
        
        if (!browser || !$socket || !$connected || !$socket.connected) {
          console.warn('[Control] ⚠️ Cannot reconnect: socket not ready');
          return;
        }

        const savedRoomCode = localStorage.getItem('christmas_roomCode');
        const hostToken = localStorage.getItem('christmas_hostToken');
        const currentLanguage = get(language);

        console.log('[Control] 🔄 Reconnect check', {
          savedRoomCode,
          roomCode,
          hasHostToken: !!hostToken,
          match: savedRoomCode === roomCode
        });

        if (savedRoomCode === roomCode && hostToken) {
          console.log('[Control] 🔄 Calling attemptReconnect...');
          attemptReconnect(hostToken, currentLanguage);
        } else {
          console.warn('[Control] ⚠️ No valid host token, redirecting...');
          setTimeout(() => {
            goto(`/room/${roomCode}`);
          }, 2000);
        }
      }

      function attemptReconnect(token: string, lang: 'en' | 'fr') {
        if (!$socket || !$connected || !$socket.connected) return;

        console.log('[Control] 🔄 Emitting reconnect_host with token:', token ? 'present' : 'missing');
        ($socket as any).emit(
          'reconnect_host',
          roomCode,
          token,
          lang,
          'host-control', // Pass role
          (response: any) => {
            console.log('[Control] 🔄 Reconnect response received:', {
              success: response?.success,
              hasTheme: !!response?.theme,
              theme: response?.theme,
              error: response?.error
            });
            if (response && response.success) {
              console.log('[Control] ✅ Successfully reconnected as host-control');
              // Load theme settings for persistence - reconnect response should have theme
              if (response.theme) {
                console.log('[Control] 🎨 Applying theme from reconnect response:', response.theme);
                applyRoomTheme(response.theme);
                // Also update the store
                roomTheme.set(response.theme);
                currentRoomCode.set(roomCode);
                console.log('[Control] ✅ Theme applied and store updated');
              } else {
                console.warn('[Control] ⚠️ No theme in reconnect response! Response keys:', Object.keys(response || {}));
                // Fallback: load theme from server (but this requires auth, so might fail)
                loadRoomTheme(roomCode).catch((err) => {
                  console.warn('[Control] Failed to load theme:', err);
                });
              }
            } else {
              console.error('[Control] ❌ Reconnect failed:', response?.error || 'Unknown error');
              error = response?.error || 'Failed to reconnect as host';
            }
          }
        );
      }

      waitForConnection();

      $socket.on('game_state_update', (data: any) => {
        if (data && typeof data === 'object' && data.state) {
          // Preserve scoreboard when receiving GAME_END state to prevent sync issues
          if (data.state === GameState.GAME_END) {
            gameState.update((current) => {
              // Use game_ended scoreboard if available (authoritative), otherwise use sync data or current
              const finalScoreboard = gameEndedScoreboard || data.scoreboard || current?.scoreboard || [];
              const finalGameType = gameEndedGameType || data.gameType || current?.gameType || null;
              return {
                ...data,
                scoreboard: finalScoreboard,
                gameType: finalGameType,
              };
            });
          } else {
            gameState.set(data);
            // Clear game_ended data when state changes away from GAME_END
            if (data.state !== GameState.GAME_END) {
              gameEndedScoreboard = null;
              gameEndedGameType = null;
            }
          }
        }
      });

      $socket.on('game_ended', (data: any) => {
        console.log('[Control] game_ended received:', data);
        playSoundOnce('gameEnd', 2000);
        // Store scoreboard and gameType from game_ended event (authoritative)
        gameEndedScoreboard = data?.scoreboard || null;
        gameEndedGameType = data?.gameType || null;
        // Update gameState store to GAME_END state with scoreboard
        gameState.update((currentState) => {
          if (currentState) {
            return {
              ...currentState,
              state: GameState.GAME_END,
              scoreboard: gameEndedScoreboard || currentState.scoreboard || [],
              gameType: gameEndedGameType || currentState.gameType || null,
            };
          } else {
            // If no current state, create a minimal game end state
            return {
              gameType: gameEndedGameType || null,
              state: GameState.GAME_END,
              round: 0,
              maxRounds: 0,
              startedAt: 0,
              scores: {},
              scoreboard: gameEndedScoreboard || [],
            };
          }
        });
      });

      $socket.on('game_started', (gameType: GameType) => {
        console.log('[Control] game_started received, clearing old state:', gameType);
        // Clear game_ended data when new game starts
        gameEndedScoreboard = null;
        gameEndedGameType = null;
        // Clear old game state when a new game starts to prevent old leaderboard from showing
        gameState.set({
          state: GameState.STARTING,
          gameType: gameType,
          round: 0,
          maxRounds: 0,
          startedAt: Date.now(),
          scores: {},
          scoreboard: [],
        });
      });

      // State transition events
      $socket.on('round_started', (data: { round: number; maxRounds: number; gameType: GameType }) => {
        console.log('[Control] round_started received:', data);
        gameState.update((current) => {
          if (current) {
            return {
              ...current,
              round: data.round,
              maxRounds: data.maxRounds,
              state: GameState.PLAYING,
            };
          }
          return current;
        });
      });

      $socket.on('round_ended', (data: { round: number; maxRounds: number; gameType: GameType; scoreboard?: any[] }) => {
        console.log('[Control] round_ended received:', data);
        gameState.update((current) => {
          if (current) {
            return {
              ...current,
              round: data.round,
              maxRounds: data.maxRounds,
              state: GameState.ROUND_END,
              scoreboard: data.scoreboard || current.scoreboard || [],
            };
          }
          return current;
        });
      });

      $socket.on('game_paused', (data: { gameType: GameType; round: number }) => {
        console.log('[Control] game_paused received:', data);
        gameState.update((current) => {
          if (current) {
            return {
              ...current,
              state: GameState.PAUSED,
              round: data.round,
            };
          }
          return current;
        });
      });

      $socket.on('game_resumed', (data: { gameType: GameType; round: number }) => {
        console.log('[Control] game_resumed received:', data);
        gameState.update((current) => {
          if (current) {
            return {
              ...current,
              state: GameState.PLAYING,
              round: data.round,
            };
          }
          return current;
        });
      });

      $socket.on('state_transition', (data: { from: GameState; to: GameState; gameType: GameType; round?: number }) => {
        console.log('[Control] state_transition received:', data);
        gameState.update((current) => {
          if (current) {
            return {
              ...current,
              state: data.to,
              round: data.round !== undefined ? data.round : current.round,
            };
          }
          return current;
        });
      });

      ($socket as any).on('room_update', (data: any) => {
        if (data && Array.isArray(data.players)) {
          players.set(data.players);
        }
      });
    };

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

    const unsubscribeConnected = connected.subscribe((isConnected) => {
      if (isConnected && connectionTimeout) {
        clearTimeout(connectionTimeout);
        connectionTimeout = null;
      }
    });

    return () => {
      unsubscribeConnected();
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('resize', handleWindowResize);
    };
  });

  onDestroy(() => {
    listenersSetup = false;
    if ($socket) {
      $socket.off('game_state_update');
      $socket.off('game_ended');
      $socket.off('game_started');
      ($socket as any).off('room_update');
    }
    if (connectionTimeout) clearTimeout(connectionTimeout);
    if (connectionSubscription) {
      connectionSubscription();
      connectionSubscription = null;
    }
  });

  // Always use $gameState as source of truth for synchronization
  $: currentState = $gameState?.state;
  $: currentGameType = $gameState?.gameType;
  $: scoreboard = $gameState?.scoreboard || [];
  // Round synchronization: always read from gameState to ensure sync with players and display
  $: round = $gameState?.round ?? 0;
  $: maxRounds = $gameState?.maxRounds ?? 0;

  $: {
    // Sync isPaused with currentState
    if (currentState === GameState.PAUSED) {
      isPaused = true;
    } else if (currentState === GameState.PLAYING || currentState === GameState.STARTING || currentState === GameState.ROUND_END) {
      isPaused = false;
    }
    console.log('[Control] State updated:', {
      currentState,
      isPaused,
      gameType: currentGameType
    });
  }

  // Quick controls state - show buttons based on game state, not socket connection
  // Socket check happens in the handler, not in visibility condition
  $: isGameActive = currentState === GameState.PLAYING || currentState === GameState.STARTING || currentState === GameState.ROUND_END;
  $: canPause = isGameActive && !isPaused;
  $: canResume = isPaused || currentState === GameState.PAUSED;
  $: showQuickControls = isGameActive || isPaused || currentState === GameState.PAUSED;
  
  // Debug reactive state
  $: {
    console.log('[Control] Quick controls state:', {
      isGameActive,
      isPaused,
      currentState,
      canPause,
      canResume,
      showQuickControls,
      round,
      maxRounds,
      hasSocket: !!$socket,
      connected: $connected,
      gameStateRound: $gameState?.round
    });
  }

  function quickPauseGame() {
    console.log('[Control] quickPauseGame called, socket:', !!$socket, 'canPause:', canPause);
    if (!$socket || !canPause) {
      console.warn('[Control] Cannot pause: socket=', !!$socket, 'canPause=', canPause);
      return;
    }
    console.log('[Control] Emitting pause_game event');
    $socket.emit('pause_game');
    playSound('click');
  }

  function quickResumeGame() {
    console.log('[Control] quickResumeGame called, socket:', !!$socket, 'canResume:', canResume);
    if (!$socket || !canResume) {
      console.warn('[Control] Cannot resume: socket=', !!$socket, 'canResume=', canResume);
      return;
    }
    console.log('[Control] Emitting resume_game event');
    $socket.emit('resume_game');
    playSound('click');
  }

  function quickEndGame() {
    console.log('[Control] quickEndGame called, socket:', !!$socket);
    if (!$socket) {
      alert(t('host.errors.noConnection') || 'Not connected to server');
      return;
    }
    showConfirmation(t('host.confirmEndGame') || 'Are you sure you want to end the game?', () => {
      console.log('[Control] Confirmed end game, emitting end_game event');
      ($socket as any).emit('end_game', (response: any) => {
        console.log('[Control] end_game response:', response);
        if (response && response.success) {
          playSoundOnce('gameEnd', 1000);
        } else {
          const errorMsg = response?.error || t('host.errors.failedEndGame') || 'Failed to end game';
          alert(errorMsg);
          console.error('[Control] Failed to end game:', response);
        }
      });
    });
  }

  // Fallback: set to LOBBY if no state
  $: {
    if ($connected && !$gameState) {
      setTimeout(() => {
        if (!$gameState && $connected) {
          gameState.set({
            state: GameState.LOBBY,
            gameType: null,
            round: 0,
            maxRounds: 0,
            startedAt: 0,
            scores: {},
            scoreboard: [],
          });
        }
      }, 1500);
    }
  }

  // Calculate scale factor for preview content based on preview width
  // Original: 300px width with 0.3 scale = 1000px effective content width
  // Scale factor = previewWidth / 1000
  $: previewScale = previewWidth / 1000;
  $: previewContentWidth = `${100 / previewScale}%`;
  $: previewContentHeight = `${100 / previewScale}%`;

  // Make controller label reactive to language changes
  $: controllerLabelText = $language && t('host.modeSelector.controllerMode');
  
  // Make page title reactive to language changes
  $: pageTitle = $language && t('host.title', { code: roomCode });
  $: homeTitle = $language && t('home.title');
  $: controllerTitle = $language && t('host.modeSelector.controllerMode');
</script>

<svelte:head>
  <title>{pageTitle} - {controllerTitle} | {homeTitle}</title>
</svelte:head>

{#if role === 'host-control'}
  <div class="host-screen controller-mode" class:panel-open={controlPanelOpen}>
    <!-- Controller Mode Label -->
    <div class="controller-label">
      {controllerLabelText}
    </div>
    
    <!-- Control Panel -->
    <HostControlPanel
      bind:controlPanelOpen
      {roomCode}
      {origin}
      {currentState}
      bind:isPaused
      {round}
      {maxRounds}
      bind:leaderboardTab
      {showConfirmation}
    />

    <!-- Confirmation Dialog -->
    <HostConfirmationDialog
      bind:showConfirmDialog
      {confirmMessage}
      confirmAction={confirmActionRef}
    />

    <!-- Top Bar -->
    <HostHeader {roomCode} {isPaused} {round} {maxRounds} onReconnect={handleManualReconnect} />

    <!-- Quick Controls Bar (Always Visible) -->
    {#if showQuickControls || isGameActive || isPaused || currentState === GameState.PAUSED}
      <div class="quick-controls-bar">
        {#if canPause}
          <button on:click|stopPropagation={quickPauseGame} class="quick-control-btn pause-btn" title={t('host.pause') || 'Pause Game'} type="button">
            ⏸️ {t('host.pause') || 'Pause'}
          </button>
        {:else if canResume}
          <button on:click|stopPropagation={quickResumeGame} class="quick-control-btn resume-btn" title={t('host.resume') || 'Resume Game'} type="button">
            ▶️ {t('host.resume') || 'Resume'}
          </button>
        {/if}
        {#if isGameActive || currentState === GameState.PAUSED || currentState === GameState.PLAYING || currentState === GameState.STARTING || currentState === GameState.ROUND_END}
          <button on:click|stopPropagation={quickEndGame} class="quick-control-btn stop-btn" title={t('host.endGame') || 'End Game'} type="button">
            ⏹️ {t('host.endGame') || 'Stop'}
          </button>
        {/if}
      </div>
    {/if}

    <!-- Main Content Area -->
    <div class="host-content">
      <HostConnectionStatus {error} {currentState} />
      {#if !error && $connected && currentState !== undefined && currentState !== null}
        {#if currentState === GameState.LOBBY}
          <HostLobbyScreen {roomCode} {origin} />
        {:else if currentState === GameState.STARTING || currentState === GameState.PLAYING || currentState === GameState.ROUND_END}
          <div class="controller-game-active">
            <div class="controller-status">
              <h1 class="status-title">🎮 Game Active</h1>
              <p class="status-subtitle">
                {#if currentState === GameState.STARTING}
                  Game is starting...
                {:else if currentState === GameState.PLAYING}
                  Round {round} of {maxRounds}
                {:else if currentState === GameState.ROUND_END}
                  Round {round} ended
                {/if}
              </p>
              <p class="status-description">
                Use the control panel to manage the game. The display view shows the full game screen.
              </p>
              <div class="game-info">
                <div class="info-item">
                  <span class="info-label">Game Type:</span>
                  <span class="info-value">{currentGameType || 'N/A'}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Players:</span>
                  <span class="info-value">{$players.length}</span>
                </div>
              </div>
            </div>
          </div>
        {:else if currentState === GameState.GAME_END}
          <div class="controller-game-end">
            <h1 class="status-title">🏆 Game Ended</h1>
            <p class="status-subtitle">The game has finished</p>
            <p class="status-description">
              Check the display view for final results, or start a new game from the control panel.
            </p>
          </div>
        {:else if currentState === GameState.PAUSED}
          <div class="paused-screen">
            <h1 class="mega-title">⏸️ Game Paused</h1>
            <p class="instruction-text">The game is currently paused</p>
            <button on:click={() => { if ($socket) $socket.emit('resume_game'); }} class="btn-primary-large">
              ▶️ Resume Game
            </button>
          </div>
        {/if}
      {/if}
    </div>

    <!-- Bottom Scoreboard -->
    {#if currentState === GameState.PLAYING || currentState === GameState.ROUND_END || currentState === GameState.STARTING}
      <HostBottomScorebar {scoreboard} />
    {/if}

    <!-- Live Preview Box (Small thumbnail) -->
    <div 
      class="live-preview"
      class:dragging={isDragging}
      class:resizing={isResizing}
      bind:this={previewElement}
      style="left: {previewX}px; top: {previewY}px; width: {previewWidth}px; height: {previewHeight}px;"
    >
      <div 
        class="preview-header"
        on:mousedown={handleDragStart}
      >
        📺 Live Preview
      </div>
      <div 
        class="preview-content" 
        style="max-height: {previewHeight - 40}px; transform: scale({previewScale}); width: {previewContentWidth}; height: {previewContentHeight};"
      >
        {#if currentState === GameState.GAME_END}
          <HostLeaderboardDisplay {roomCode} {scoreboard} gameType={currentGameType} />
        {:else if currentState && currentState !== GameState.LOBBY}
          <HostGameDisplay {currentGameType} {currentState} {round} {maxRounds} {scoreboard} />
        {:else}
          <div class="preview-placeholder">Waiting for game to start...</div>
        {/if}
      </div>
      <div 
        class="resize-handle"
        on:mousedown={handleResizeStart}
      ></div>
    </div>
  </div>
{/if}

<style>
  .host-screen {
    height: 100vh;
    max-height: 100vh;
    display: flex;
    flex-direction: column;
    background: linear-gradient(135deg, #0a1a2e 0%, #1a2a4e 30%, #2a3a6e 60%, #1a2a4e 100%);
    background-image: 
      radial-gradient(circle at 20% 30%, rgba(255, 255, 255, 0.1) 0%, transparent 50%),
      radial-gradient(circle at 80% 70%, rgba(173, 216, 230, 0.15) 0%, transparent 50%);
    color: white;
    overflow: hidden;
    position: relative;
  }

  .controller-label {
    position: fixed;
    top: calc(clamp(60px, 8vh, 70px) + 1rem);
    right: calc(1rem + 48px + 1rem);
    background: rgba(15, 134, 68, 0.9);
    color: #ffd700;
    padding: 0.4rem 0.75rem;
    border-radius: 6px;
    font-weight: bold;
    font-size: clamp(0.7rem, 1vw, 0.8rem);
    z-index: 999;
    border: 2px solid #ffd700;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
    pointer-events: none;
    opacity: 0.8;
  }
  
  /* Hide label on smaller screens to avoid clutter */
  @media (max-width: 1024px) {
    .controller-label {
      display: none;
    }
  }

  .host-content {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: clamp(0.5rem, 1vw, 1rem);
    transition: margin-right 0.3s ease-in-out;
    position: relative;
    z-index: 1;
    overflow-y: auto;
    overflow-x: hidden;
    height: calc(100vh - clamp(60px, 8vh, 70px) - clamp(60px, 7vh, 70px));
    max-height: calc(100vh - clamp(60px, 8vh, 70px) - clamp(60px, 7vh, 70px));
  }

  .host-screen.panel-open .host-content {
    margin-right: clamp(300px, 25vw, 400px);
  }

  .controller-game-active,
  .controller-game-end,
  .paused-screen {
    width: 100%;
    max-width: min(98vw, calc(100vw - clamp(2rem, 4vw, 4rem)));
    min-height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: clamp(0.5rem, 1vw, 1rem);
  }

  .controller-status {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    padding: 2rem;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 16px;
    border: 2px solid rgba(255, 215, 0, 0.3);
    max-width: 600px;
  }

  .status-title {
    font-size: clamp(2rem, 4vw, 3rem);
    font-weight: bold;
    color: #ffd700;
    text-shadow: 0 0 20px rgba(255, 215, 0, 0.8), 4px 4px 8px rgba(0, 0, 0, 0.5);
    margin: 0;
  }

  .status-subtitle {
    font-size: clamp(1.25rem, 2vw, 1.75rem);
    color: rgba(255, 255, 255, 0.9);
    margin: 0;
    font-weight: 600;
  }

  .status-description {
    font-size: clamp(0.875rem, 1.5vw, 1.125rem);
    color: rgba(255, 255, 255, 0.7);
    margin: 0;
    line-height: 1.6;
  }

  .game-info {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: 100%;
    margin-top: 1rem;
    padding-top: 1.5rem;
    border-top: 1px solid rgba(255, 215, 0, 0.2);
  }

  .info-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
  }

  .info-label {
    font-size: clamp(0.875rem, 1.5vw, 1rem);
    color: rgba(255, 255, 255, 0.7);
  }

  .info-value {
    font-size: clamp(1rem, 1.5vw, 1.125rem);
    color: #ffd700;
    font-weight: bold;
  }

  .mega-title {
    font-size: clamp(2.5rem, 5vw, 4rem);
    font-weight: bold;
    margin-bottom: clamp(1rem, 2vh, 1.5rem);
    color: #e0f2fe;
    text-shadow: 0 0 15px rgba(224, 242, 254, 0.8), 4px 4px 8px rgba(0, 0, 0, 0.5);
  }

  .instruction-text {
    font-size: clamp(0.875rem, 1.5vw, 1.125rem);
    color: rgba(224, 242, 254, 0.8);
    margin-bottom: clamp(1rem, 2vh, 1.5rem);
  }

  .btn-primary-large {
    padding: 1.5rem 3rem;
    font-size: clamp(1.125rem, 2vw, 1.5rem);
    font-weight: bold;
    background: linear-gradient(135deg, #c41e3a 0%, #8b1538 100%);
    color: white;
    border-radius: 1rem;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 4px 15px rgba(196, 30, 58, 0.4);
  }

  .btn-primary-large:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(196, 30, 58, 0.6);
  }

  /* Live Preview Box */
  .live-preview {
    position: fixed;
    background: rgba(0, 0, 0, 0.9);
    border: 2px solid #ffd700;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5), 0 0 30px rgba(255, 215, 0, 0.3);
    z-index: 999;
    overflow: hidden;
    backdrop-filter: blur(10px);
    display: flex;
    flex-direction: column;
    user-select: none;
    pointer-events: auto;
  }

  .live-preview.dragging {
    cursor: grabbing;
  }

  .live-preview.resizing {
    cursor: nwse-resize;
  }

  .preview-header {
    background: linear-gradient(135deg, rgba(15, 134, 68, 0.9), rgba(10, 93, 46, 0.9));
    padding: 0.5rem 1rem;
    font-weight: bold;
    color: #ffd700;
    text-align: center;
    border-bottom: 2px solid #ffd700;
    font-size: 0.9rem;
    cursor: grab;
    flex-shrink: 0;
  }

  .live-preview.dragging .preview-header {
    cursor: grabbing;
  }

  .preview-content {
    overflow-y: auto;
    overflow-x: hidden;
    padding: 0.5rem;
    flex: 1;
    transform-origin: top left;
  }

  .resize-handle {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 20px;
    height: 20px;
    cursor: nwse-resize;
    background: linear-gradient(135deg, transparent 0%, transparent 40%, rgba(255, 215, 0, 0.5) 40%, rgba(255, 215, 0, 0.5) 60%, transparent 60%);
    z-index: 1000;
  }

  .resize-handle:hover {
    background: linear-gradient(135deg, transparent 0%, transparent 40%, rgba(255, 215, 0, 0.8) 40%, rgba(255, 215, 0, 0.8) 60%, transparent 60%);
  }

  .preview-placeholder {
    padding: 2rem;
    text-align: center;
    color: rgba(255, 255, 255, 0.6);
    font-size: 0.9rem;
  }

  /* Quick Controls Bar */
  .quick-controls-bar {
    position: fixed;
    bottom: clamp(70px, 8vh, 80px);
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 1rem;
    z-index: 998;
    padding: 0.75rem 1.5rem;
    background: rgba(0, 0, 0, 0.85);
    border: 2px solid #ffd700;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5), 0 0 30px rgba(255, 215, 0, 0.3);
    backdrop-filter: blur(10px);
    pointer-events: auto !important;
  }

  .quick-control-btn {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 8px;
    font-size: clamp(0.875rem, 1.2vw, 1rem);
    font-weight: bold;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    pointer-events: auto !important;
    position: relative;
    z-index: 1;
  }

  .pause-btn {
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    color: white;
    box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
  }

  .pause-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(245, 158, 11, 0.6);
  }

  .resume-btn {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
  }

  .resume-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(16, 185, 129, 0.6);
  }

  .stop-btn {
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
    color: white;
    box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);
  }

  .stop-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(220, 38, 38, 0.6);
  }

  @media (max-width: 768px) {
    .live-preview {
      display: none;
    }

    .host-screen.panel-open .host-content {
      margin-right: 0;
    }

    .quick-controls-bar {
      bottom: 10px;
      left: 10px;
      right: 10px;
      transform: none;
      flex-direction: column;
      gap: 0.5rem;
    }

    .quick-control-btn {
      width: 100%;
      justify-content: center;
    }
  }
</style>

