<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { socket, connectSocket, gameState, players, connected } from '$lib/socket';
  import { GameState, GameType, PlayerStatus } from '@christmas/core';
  import { playSound, playSoundOnce } from '$lib/audio';
  import GlobalLeaderboard from '$lib/components/GlobalLeaderboard.svelte';
  import SessionLeaderboard from '$lib/components/SessionLeaderboard.svelte';
  import HostChristmasAnimation from '$lib/components/host/HostChristmasAnimation.svelte';
  import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
  import HostConnectionStatus from '$lib/components/host/HostConnectionStatus.svelte';
  import HostConfirmationDialog from '$lib/components/host/HostConfirmationDialog.svelte';
  import HostLobbyScreen from '$lib/components/host/HostLobbyScreen.svelte';
  import HostHeader from '$lib/components/host/HostHeader.svelte';
  import HostBottomScorebar from '$lib/components/host/HostBottomScorebar.svelte';
  import HostInstructionsOverlay from '$lib/components/host/HostInstructionsOverlay.svelte';
  import HostCountdownOverlay from '$lib/components/host/HostCountdownOverlay.svelte';
  import HostControlPanel from '$lib/components/host/HostControlPanel.svelte';
  import HostGameDisplay from '$lib/components/host/HostGameDisplay.svelte';
  import { t, language } from '$lib/i18n';

  // Normalize room code to uppercase (server expects uppercase)
  const roomCode = ($page.params.code || '').toUpperCase();
  let controlPanelOpen = false;
  let showConfirmDialog = false;
  let confirmMessage = '';
  let isPaused = false;
  let origin = '';
  let leaderboardTab: 'session' | 'global' = 'session';
  let error = ''; // Error message for connection issues

  // Declare timeouts and subscriptions before onMount
  let stateInitTimeout: ReturnType<typeof setTimeout> | null = null;
  let connectionSubscription: (() => void) | null = null; // Store subscription for cleanup
  let connectionTimeout: ReturnType<typeof setTimeout> | null = null; // Store connection timeout
  let countdownInterval: ReturnType<typeof setInterval> | null = null;
  let listenersSetup = false; // Flag to prevent duplicate listener registration

  // Countdown timer variables - declared before reactive statements to avoid TDZ errors
  let countdownValue = 3;
  let countdownStartTime = 0;
  let showInstructions = true; // Show instructions first, then countdown
  let instructionStartTime = 0;
  let previousState: GameState | undefined = undefined;
  const INSTRUCTION_DURATION = 5000; // 5 seconds for instructions

  // Declare derived variables before reactive statements to avoid TDZ errors
  let currentState: GameState | undefined = undefined;
  let currentGameType: GameType | null = null;
  let scoreboard: any[] = [];
  let round = 0;
  let maxRounds = 0;
  let startedAt = 0;
  let isGameActive = false;
  let canPause = false;
  let canResume = false;
  let confirmActionRef: (() => void) | null = null;

  function handleManualReconnect() {
    if (!browser) return;
    const hostToken = localStorage.getItem('christmas_hostToken');
    const savedRoomCode = localStorage.getItem('christmas_roomCode');
    console.log('[Host] Manual reconnect attempt:', {
      hostToken: !!hostToken,
      savedRoomCode,
      roomCode,
    });
    if (hostToken && savedRoomCode === roomCode && $socket) {
      const currentLanguage = get(language);
      ($socket as any).emit(
        'reconnect_host',
        roomCode,
        hostToken,
        currentLanguage,
        (response: any) => {
          console.log('[Host] Manual reconnect response:', response);
          if (!response || !response.success) {
            alert(
              `Failed to reconnect: ${response?.error || 'Unknown error'}. Please go to /room/${roomCode} first.`
            );
          }
        }
      );
    } else {
      console.log('[Host] No valid credentials, redirecting to room page...');
      goto(`/room/${roomCode}`);
    }
  }

  const games = [
    { type: GameType.TRIVIA_ROYALE, name: '🎄 Christmas Trivia Royale', desc: 'Fast-paced quiz' },
    { type: GameType.EMOJI_CAROL, name: '🎶 Emoji Carol Battle', desc: 'Strategic voting' },
    { type: GameType.NAUGHTY_OR_NICE, name: '😇 Naughty or Nice', desc: 'Social voting' },
    { type: GameType.PRICE_IS_RIGHT, name: '💰 Price Is Right', desc: 'Guess the price' },
  ];

  onMount(() => {
    console.log('[Host] Component mounted, connecting socket...');
    connectSocket().catch((err) => {
      console.error('[Host] Failed to connect socket:', err);
      error = 'Failed to connect to server. Please refresh the page.';
    });

    if (browser) {
      origin = window.location.origin;
    }

    // Add a fallback timeout to show error if connection takes too long
    connectionTimeout = setTimeout(() => {
      if (!$connected) {
        console.error('[Host] Connection timeout after 15 seconds');
        error = 'Connection timeout. Please check your internet connection and refresh the page.';
      }
    }, 15000);

    // Clear timeout when connection succeeds
    // Declare unsubscribe function variable first to avoid TDZ error
    let unsubscribeConnected: (() => void) | null = null;
    unsubscribeConnected = connected.subscribe((isConnected) => {
      if (isConnected && connectionTimeout) {
        clearTimeout(connectionTimeout);
        connectionTimeout = null;
        if (unsubscribeConnected) {
          unsubscribeConnected();
        }
      }
    });

    // Wait for socket to be ready AND connected before setting up listeners
    const setupSocketListeners = () => {
      if (!$socket) {
        console.log('[Host] setupSocketListeners: Socket not available yet');
        return;
      }

      // Prevent duplicate listener registration
      if (listenersSetup) {
        console.log('[Host] setupSocketListeners: Listeners already set up, skipping');
        return;
      }

      console.log(
        '[Host] setupSocketListeners: Socket available, connected:',
        $socket.connected,
        'store connected:',
        $connected
      );
      listenersSetup = true;

      // Wait for socket to be connected before attempting reconnect
      const waitForConnection = () => {
        if (!$connected || !$socket?.connected) {
          console.log('[Host] Waiting for socket connection...');
          let waitTimeout: ReturnType<typeof setTimeout> | null = null;
          // Wait for connection
          const unsubscribe = connected.subscribe((isConnected) => {
            if (isConnected && $socket?.connected) {
              if (waitTimeout) clearTimeout(waitTimeout);
              unsubscribe();
              // Clear stored subscription before setting new one
              if (connectionSubscription) {
                connectionSubscription();
              }
              connectionSubscription = null;
              console.log('[Host] Socket connected, attempting host reconnect...');
              attemptHostReconnect();
            }
          });
          // Store subscription for cleanup (cleanup old one first)
          if (connectionSubscription) {
            connectionSubscription();
          }
          connectionSubscription = unsubscribe;
          // Timeout after 10 seconds
          waitTimeout = setTimeout(() => {
            unsubscribe();
            connectionSubscription = null; // Clear stored subscription
            if (!$connected || !$socket?.connected) {
              console.error('[Host] Socket connection timeout');
              error = 'Failed to connect to server. Please refresh the page.';
            }
          }, 10000);
        } else {
          attemptHostReconnect();
        }
      };

      // Auto reconnect host if token present
      function attemptHostReconnect() {
        if (!browser || !$socket || !$connected || !$socket.connected) {
          console.warn('[Host] Cannot reconnect: socket not connected');
          return;
        }

        const savedRoomCode = localStorage.getItem('christmas_roomCode');
        let hostToken = localStorage.getItem('christmas_hostToken');
        console.log('[Host] Checking host credentials:', {
          savedRoomCode,
          roomCode,
          hasToken: !!hostToken,
        });

        // If no token but we have auth, try to regenerate it
        if (savedRoomCode === roomCode && !hostToken) {
          console.log('[Host] No token found, attempting to regenerate...');
          // Try to regenerate token from server
          import('$lib/supabase').then(({ getAccessToken }) => {
            getAccessToken().then(async (authToken) => {
              if (authToken && $socket && $connected && $socket.connected) {
                ($socket as any).emit('regenerate_host_token', roomCode, (response: any) => {
                  if (response && response.success && response.token) {
                    console.log('[Host] ✅ Token regenerated successfully');
                    localStorage.setItem('christmas_hostToken', response.token);
                    hostToken = response.token;
                    // Now try reconnecting with new token
                    if (hostToken) {
                      attemptReconnect(hostToken);
                    }
                  } else {
                    console.error('[Host] ❌ Failed to regenerate token:', response?.error);
                    // Fallback to room page
                    setTimeout(() => {
                      goto(`/room/${roomCode}`);
                    }, 2000);
                  }
                });
              } else {
                // No auth token, redirect to room page
                setTimeout(() => {
                  goto(`/room/${roomCode}`);
                }, 2000);
              }
            });
          });
        } else if (savedRoomCode === roomCode && hostToken) {
          // Ensure hostToken is not null before attempting reconnect
          if (hostToken) {
            attemptReconnect(hostToken);
          } else {
            console.warn('[Host] Host token is null, cannot reconnect');
            setTimeout(() => {
              goto(`/room/${roomCode}`);
            }, 2000);
          }
        } else {
          // No token - set to LOBBY state so page can render immediately
          console.warn(
            '[Host] ⚠️ No valid host token found. Saved room:',
            savedRoomCode,
            'Current room:',
            roomCode,
            'Has token:',
            !!hostToken
          );
          console.warn('[Host] Redirecting to room page to get host credentials...');
          // Redirect to room page to get proper host credentials
          setTimeout(() => {
            goto(`/room/${roomCode}`);
          }, 2000);
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
      }

      function attemptReconnect(token: string) {
        if (!$socket || !$connected || !$socket.connected) {
          console.error('[Host] Cannot reconnect: socket not connected');
          return;
        }

        console.log('[Host] Attempting to reconnect as host with room code:', roomCode);
        const currentLanguage = get(language);
        // Ensure room code is uppercase for consistency with server
        const normalizedRoomCode = roomCode.toUpperCase();
        ($socket as any).emit(
          'reconnect_host',
          normalizedRoomCode,
          token,
          currentLanguage,
          (response: any) => {
            console.log('[Host] Reconnect response:', response);
            if (response && response.success && response.room) {
              console.log('[Host] ✅ Successfully reconnected as host');

              // Set players immediately from response
              if (response.room.players && Array.isArray(response.room.players)) {
                players.set(response.room.players);
                console.log(
                  `[Host] Set ${response.room.players.length} player(s) from reconnect response`
                );
                // The server emits room_update after reconnect (line 333-336 in handlers.ts)
                // which will sync the players list, but we set it here for immediate display
                // The room_update event will arrive shortly and ensure we have the latest state
              } else {
                console.warn('[Host] Reconnect response missing players array');
                // Set empty array to prevent undefined state
                players.set([]);
              }

              // Verify we're in the room by checking socket rooms (for debugging)
              // Note: socket.io doesn't expose rooms on client side, but server logs will show
              console.log(
                '[Host] Host reconnected, waiting for room_update event to sync players...'
              );

              // response.room.gameState is just the enum value (e.g., 'lobby'), not a full object
              // Don't set minimal state here - wait for game_state_update event which will provide full state
              // Only set minimal state if we're in LOBBY and have no state at all
              const stateValue = response.room.gameState || GameState.LOBBY;
              console.log('[Host] Reconnect returned gameState:', stateValue);

              // Only set minimal state if we're in LOBBY and have no state
              // For other states (STARTING, PLAYING, etc.), wait for game_state_update to provide full state
              if (!$gameState && stateValue === GameState.LOBBY) {
                console.log('[Host] No existing game state and in LOBBY, setting minimal state');
                gameState.set({
                  state: stateValue,
                  gameType: response.room.currentGame || null,
                  round: 0,
                  maxRounds: 0,
                  startedAt: 0,
                  scores: {},
                  scoreboard: [],
                });
              } else if (!$gameState && stateValue !== GameState.LOBBY) {
                console.log(
                  '[Host] Game is active, waiting for game_state_update to provide full state'
                );
                // Don't set minimal state - wait for game_state_update
              } else if ($gameState) {
                console.log(
                  '[Host] Already have game state, waiting for game_state_update to sync if needed'
                );
              }

              // Request game state after a short delay if we're in a game and don't have full state
              // This ensures we get the full state if game_state_update doesn't arrive
              if (stateValue !== GameState.LOBBY && stateValue !== GameState.GAME_END) {
                setTimeout(() => {
                  // If we still don't have full game content, request it
                  const currentState = $gameState;
                  if (
                    !currentState?.currentQuestion &&
                    !currentState?.currentItem &&
                    !currentState?.currentPrompt &&
                    !currentState?.availableEmojis &&
                    $socket
                  ) {
                    console.log('[Host] Requesting game state after reconnect...');
                    requestGameStateIfMissing();
                  }
                }, 1000); // Increased delay to give game_state_update time to arrive
              }
            } else {
              // Reconnection failed - try regenerating token if we have auth
              const errorMsg = response?.error || 'Unknown error';
              console.error('[Host] ❌ Reconnect failed:', errorMsg);

              // Try regenerating token as fallback
              import('$lib/supabase').then(({ getAccessToken }) => {
                getAccessToken().then(async (authToken) => {
                  if (authToken && $socket && $connected && $socket.connected) {
                    ($socket as any).emit(
                      'regenerate_host_token',
                      roomCode,
                      (regenerateResponse: any) => {
                        if (
                          regenerateResponse &&
                          regenerateResponse.success &&
                          regenerateResponse.token
                        ) {
                          console.log('[Host] ✅ Token regenerated, retrying reconnect...');
                          localStorage.setItem('christmas_hostToken', regenerateResponse.token);
                          attemptReconnect(regenerateResponse.token);
                        } else {
                          alert(
                            `Failed to reconnect as host: ${errorMsg}. Please go back to the room page and try again.`
                          );
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
                      }
                    );
                  } else {
                    alert(
                      `Failed to reconnect as host: ${errorMsg}. Please go back to the room page and try again.`
                    );
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
                });
              });
            }
          }
        );
      }

      // Start the reconnect process
      waitForConnection();

      // Listen for game state changes (use playSoundOnce to prevent duplicates with server events)
      $socket.on('game_ended', (data: any) => {
        playSoundOnce('gameEnd', 2000);
        // Game state will be updated via gameState store
      });

      // Listen for pause/resume events and game state updates
      // Note: The socket store (socket.ts) should also listen to this event and update gameState store
      // But we also update it here as a backup to ensure the store is always updated
      $socket.on('game_state_update', (data: any) => {
        console.log('[Host] ✅ Game state update received:', {
          state: data?.state,
          gameType: data?.gameType,
          round: data?.round,
          hasQuestion: !!data?.currentQuestion,
          hasItem: !!data?.currentItem,
          hasPrompt: !!data?.currentPrompt,
          hasEmojis: !!data?.availableEmojis,
          socketId: $socket?.id,
        });

        // Update the store directly to ensure it's always synced
        // This is a backup in case the socket.ts listener doesn't fire
        if (data && typeof data === 'object' && data.state) {
          gameState.set(data);

          // Verify the store was updated
          const updatedState = $gameState;
          console.log(
            '[Host] ✅ Store updated, current state:',
            updatedState?.state,
            'gameType:',
            updatedState?.gameType
          );
        } else {
          console.warn('[Host] ⚠️ Invalid game_state_update data received:', data);
        }

        // Handle host-specific state (pause/resume)
        if (data?.state === 'paused' || data?.state === GameState.PAUSED) {
          isPaused = true;
        } else if (data?.state === 'playing' || data?.state === GameState.PLAYING) {
          isPaused = false;
        }

        // Log state changes for debugging
        if (data && typeof data === 'object' && data.state) {
          const previousState = $gameState?.state;
          if (!$gameState || $gameState.state !== data.state) {
            console.log(`[Host] 🔄 State changed from ${previousState} to ${data.state}`);
            // Force reactivity update by triggering a reactive statement
            // This ensures the UI updates immediately when state changes
            if (data.state === GameState.STARTING || data.state === 'starting') {
              console.log('[Host] 🎮 Game starting! UI should update now.');
            }
          }
        }
      });

      // Request game state if we don't receive one within 2 seconds after reconnection
      let gameStateTimeout: ReturnType<typeof setTimeout> | null = null;
      const requestGameStateIfMissing = () => {
        if (gameStateTimeout) clearTimeout(gameStateTimeout);
        if (!$connected || !$socket) return;

        gameStateTimeout = setTimeout(() => {
          // Check if we have game state but it's missing content
          const currentState = $gameState;
          const needsState =
            !currentState ||
            (currentState.state !== GameState.LOBBY &&
              currentState.state !== GameState.GAME_END &&
              !currentState.currentQuestion &&
              !currentState.currentItem &&
              !currentState.currentPrompt &&
              !currentState.availableEmojis);

          if (needsState && $connected && $socket) {
            console.log(
              '[Host] ⚠️ No full game state received, requesting via get_room_details...'
            );
            // Try to get game state from room
            ($socket as any).emit('get_room_details', roomCode, (response: any) => {
              if (response && response.success) {
                // get_room_details might not return full game state, but it's worth trying
                console.log('[Host] get_room_details response:', response);
                if (response.gameState) {
                  console.log('[Host] ✅ Received game state from get_room_details');
                  gameState.set(response.gameState);
                }
              } else {
                console.warn('[Host] ⚠️ Could not retrieve game state from get_room_details');
              }
            });
          }
        }, 2000);
      };

      // Trigger state request after successful reconnection
      // The reconnect_host callback will call this if needed

      // Listen for room updates (players joining/leaving)
      // Note: The socket store handles player updates automatically via room_update events
      // We just need to ensure game state is initialized
      ($socket as any).on('room_update', (data: any) => {
        console.log('[Host] Room update received:', data);
        if (data && Array.isArray(data.players)) {
          console.log(`[Host] Room update: ${data.players.length} player(s) in room`);
          // Verify players store was updated (should happen automatically via socket.ts)
          // Use a small delay to check after store update
          setTimeout(() => {
            console.log(
              `[Host] Players store now has ${$players.length} player(s) after room_update`
            );
            if ($players.length !== data.players.length) {
              console.warn(
                `[Host] ⚠️ Players count mismatch! Store: ${$players.length}, Event: ${data.players.length}`
              );
            }
          }, 100);
        }
        // Ensure we have game state if we don't have one yet
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
      });

      // Listen for socket reconnection - host needs to rejoin room
      // Socket.io automatically rejoins rooms, but we need to re-authenticate as host
      ($socket as any).on('reconnect', () => {
        console.log('[Host] Socket reconnected, checking if we need to reconnect as host...');
        if (browser) {
          const savedRoomCode = localStorage.getItem('christmas_roomCode');
          const hostToken = localStorage.getItem('christmas_hostToken');
          if (
            savedRoomCode === roomCode &&
            hostToken &&
            $socket &&
            $connected &&
            $socket.connected
          ) {
            console.log('[Host] Socket reconnected, attempting to reconnect as host...');
            // Small delay to ensure socket is fully connected
            setTimeout(() => {
              if (hostToken) {
                attemptReconnect(hostToken);
              } else {
                console.warn('[Host] Host token is null, cannot reconnect');
              }
            }, 500);
          }
        }
      });

      // Listen for player join/leave events for logging (players store handles updates)
      $socket.on('player_joined', (player: any) => {
        console.log('[Host] Player joined event:', player);
        // Players store will be updated automatically via room_update
      });

      $socket.on('player_left', (data: any) => {
        console.log('[Host] Player left event:', data);
        // Players store will be updated automatically via room_update
      });

      // Also listen for player_disconnected events
      ($socket as any).on('player_disconnected', (playerId: any) => {
        console.log('[Host] Player disconnected:', playerId);
        // Players store will be updated automatically via room_update
      });
    };

    // Try to setup immediately, or wait for socket
    if ($socket) {
      setupSocketListeners();
    } else {
      // Wait for socket to be available
      const unsubscribe = socket.subscribe((sock) => {
        if (sock) {
          unsubscribe();
          setupSocketListeners();
        }
      });
      // Store subscription for cleanup (cleanup old one first)
      if (connectionSubscription) {
        connectionSubscription();
      }
      connectionSubscription = unsubscribe;
    }

    // Also ensure we're listening for connection state changes even if socket exists but isn't connected
    // This handles the case where socket exists but connection hasn't been established yet
    if ($socket && !$connected) {
      console.log('[Host] Socket exists but not connected, waiting for connection...');
      const unsubscribe = connected.subscribe((isConnected) => {
        if (isConnected && $socket?.connected) {
          unsubscribe();
          // Clear stored subscription before setting new one
          if (connectionSubscription) {
            connectionSubscription();
          }
          connectionSubscription = null;
          // Socket is now connected, ensure listeners are set up and reconnect attempt happens
          console.log('[Host] Socket connected, triggering reconnect attempt...');
          // Call setupSocketListeners again to ensure everything is set up
          setupSocketListeners();
        }
      });
      // Store subscription for cleanup (cleanup old one first)
      if (connectionSubscription) {
        connectionSubscription();
      }
      connectionSubscription = unsubscribe;
    }

    // Return cleanup function for onMount
    return () => {
      // Clean up connection timeout subscription
      if (unsubscribeConnected) {
        unsubscribeConnected();
      }
      // Clean up connection timeout
      if (connectionTimeout) {
        clearTimeout(connectionTimeout);
        connectionTimeout = null;
      }
    };
  });

  onDestroy(() => {
    // Reset listeners flag
    listenersSetup = false;

    // Clean up socket event listeners
    if ($socket) {
      $socket.off('game_ended');
      $socket.off('game_state_update');
      ($socket as any).off('room_update');
      ($socket as any).off('player_joined');
      ($socket as any).off('player_left');
      ($socket as any).off('player_disconnected');
      ($socket as any).off('reconnect');
    }
    // Clean up timeouts/intervals
    if (stateInitTimeout) {
      clearTimeout(stateInitTimeout);
    }
    if (countdownInterval) {
      clearInterval(countdownInterval);
    }
    // Clean up any active subscriptions
    if (connectionSubscription) {
      connectionSubscription();
      connectionSubscription = null;
    }
    // Clean up connection timeout
    if (connectionTimeout) {
      clearTimeout(connectionTimeout);
      connectionTimeout = null;
    }
    // Note: We don't clear players store here because:
    // 1. It's a global store shared across pages
    // 2. The room_update event is authoritative and will replace the list when joining a new room
    // 3. Clearing it here could cause flickering if navigating between rooms
  });

  $: currentState = $gameState?.state;
  $: currentGameType = $gameState?.gameType;
  $: scoreboard = $gameState?.scoreboard || [];
  $: round = $gameState?.round || 0;
  $: maxRounds = $gameState?.maxRounds || 0;
  $: startedAt = $gameState?.startedAt || 0;

  // Reactive logging for debugging
  $: if ($gameState && import.meta.env.DEV) {
    console.log('[Host] $gameState reactive update:', {
      state: $gameState.state,
      gameType: $gameState.gameType,
      round: $gameState.round,
      hasQuestion: !!$gameState.currentQuestion,
      questionText: $gameState.currentQuestion?.question || 'N/A',
      answersCount: $gameState.currentQuestion?.answers?.length || 0,
    });
  }
  $: isGameActive =
    currentState === GameState.PLAYING ||
    currentState === GameState.ROUND_END ||
    currentState === GameState.STARTING;
  $: canPause = currentState === GameState.PLAYING && !isPaused;
  $: canResume = currentState === GameState.PAUSED || isPaused;

  // Update isPaused based on game state
  $: {
    if (currentState === GameState.PAUSED) {
      isPaused = true;
    } else if (currentState === GameState.PLAYING) {
      isPaused = false;
    }
  }

  // Handle STARTING state - show instructions first, then countdown
  $: {
    // Guard against undefined currentState to avoid initialization errors
    const state = $gameState?.state;
    // Detect state change to STARTING
    if (state === GameState.STARTING && previousState !== GameState.STARTING) {
      // Just entered STARTING state - show instructions first
      showInstructions = true;
      instructionStartTime = Date.now();
      countdownValue = 3;

      // Don't request game state - rely on game_state_update events from server
      // The server sends game_state_update immediately when question is ready
      // This ensures synchronization with player screens

      // After instruction duration, hide instructions and start countdown
      setTimeout(() => {
        showInstructions = false;
        countdownStartTime = Date.now();

        // Clear any existing interval
        if (countdownInterval) {
          clearInterval(countdownInterval);
        }

        // Start countdown timer
        countdownInterval = setInterval(() => {
          const elapsed = Date.now() - countdownStartTime;
          const remaining = Math.max(0, Math.ceil((3000 - elapsed) / 1000));
          countdownValue = remaining;

          if (remaining <= 0) {
            if (countdownInterval) {
              clearInterval(countdownInterval);
              countdownInterval = null;
            }
            // State should transition to PLAYING via server
            console.log('[Host] Countdown finished, waiting for PLAYING state');
          }
        }, 100);
      }, INSTRUCTION_DURATION);
    } else if (state !== GameState.STARTING && previousState === GameState.STARTING) {
      // Just left STARTING state - cleanup
      showInstructions = false;
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
      countdownStartTime = 0;
      instructionStartTime = 0;
      countdownValue = 3;
    }

    // Update previous state
    previousState = state;
  }

  // Fallback: If connected but no game state after a delay, set to LOBBY
  $: {
    // Check $gameState directly instead of currentState to avoid initialization order issues
    if ($connected && !$gameState) {
      if (stateInitTimeout) clearTimeout(stateInitTimeout);
      console.log('[Host] Connected but no game state, setting timeout');
      stateInitTimeout = setTimeout(() => {
        if (!$gameState && $connected) {
          console.log('[Host] Timeout reached, setting to LOBBY');
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
      }, 1500); // Reduced to 1.5 seconds
    } else if ($gameState) {
      if (stateInitTimeout) {
        clearTimeout(stateInitTimeout);
        stateInitTimeout = null;
      }
    }
  }

  function showConfirmation(message: string, action: () => void) {
    confirmMessage = message;
    confirmActionRef = action;
    showConfirmDialog = true;
  }

  function resumeGame() {
    if (!$socket || !isPaused) return;
    $socket.emit('resume_game');
    isPaused = false;
    playSound('click');
  }
</script>

<svelte:head>
  <title>{t('host.title', { code: roomCode })} | {t('home.title')}</title>
</svelte:head>

<div class="host-screen" class:panel-open={controlPanelOpen}>
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

  <!-- Main Content Area -->
  <div class="host-content">
    <HostConnectionStatus {error} {currentState} />
    {#if !error && $connected && currentState !== undefined && currentState !== null}
      {#if currentState === GameState.LOBBY}
        <HostLobbyScreen {roomCode} />
      {:else if currentState === GameState.STARTING}
        <!-- STARTING state: Show question immediately if available, with instructions/countdown overlay -->
        {#if $gameState?.currentQuestion || $gameState?.currentItem || $gameState?.currentPrompt || $gameState?.availableEmojis}
          <!-- Game content is available - show it immediately with overlay -->
          <div class="playing-screen starting-with-content">
            <!-- Instructions Overlay (if showing) -->
            <HostInstructionsOverlay gameType={currentGameType} {showInstructions} />

            <!-- Countdown Overlay (when not showing instructions) -->
            <HostCountdownOverlay {countdownValue} show={!showInstructions} />

            <!-- Game Content (visible immediately when available) -->
            <HostGameDisplay {currentGameType} {currentState} {round} {maxRounds} {scoreboard} />
          </div>
        {:else}
          <!-- No game content yet - show countdown only -->
          <div class="countdown-screen">
            <h1 class="countdown-text">Get Ready!</h1>
            <div class="countdown-number" class:pulse={countdownValue <= 1}>
              {countdownValue > 0 ? countdownValue : 'GO!'}
            </div>
            <p class="countdown-subtitle">Game starting soon...</p>
          </div>
        {/if}
      {:else if currentState === GameState.PLAYING}
        <div class="playing-screen">
          <!-- Game Display - should fill available space -->
          <div class="game-display-container">
            <HostGameDisplay {currentGameType} {currentState} {round} {maxRounds} {scoreboard} />
          </div>
        </div>
      {:else if currentState === GameState.ROUND_END}
        <!-- Round End: Show full game content with reveals and leaderboard -->
        <div class="playing-screen">
          <div class="game-display-container">
            <HostGameDisplay {currentGameType} {currentState} {round} {maxRounds} {scoreboard} />
          </div>
        </div>
      {:else if currentState === GameState.GAME_END}
        <HostChristmasAnimation {roomCode} {scoreboard} gameType={currentGameType} />
      {:else if currentState === GameState.PAUSED}
        <div class="paused-screen">
          <h1 class="mega-title">⏸️ Game Paused</h1>
          <p class="instruction-text">The game is currently paused</p>
          <button on:click={resumeGame} class="btn-primary-large"> ▶️ Resume Game </button>
        </div>
      {/if}
    {/if}
  </div>

  <!-- Bottom Scoreboard (only during game, not at end) -->
  {#if currentState === GameState.PLAYING || currentState === GameState.ROUND_END || currentState === GameState.STARTING}
    <HostBottomScorebar {scoreboard} />
  {/if}
</div>

<style>
  .host-screen {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: linear-gradient(135deg, #0a1a2e 0%, #1a2a4e 30%, #2a3a6e 60%, #1a2a4e 100%);
    background-image: 
      radial-gradient(circle at 20% 30%, rgba(255, 255, 255, 0.1) 0%, transparent 50%),
      radial-gradient(circle at 80% 70%, rgba(173, 216, 230, 0.15) 0%, transparent 50%),
      radial-gradient(circle at 50% 50%, rgba(176, 224, 230, 0.1) 0%, transparent 50%);
    color: white;
    overflow: hidden;
    position: relative;
  }

  /* Snowflake animation background */
  .host-screen::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-image: 
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Cpath d='M50 0 L55 20 L75 15 L60 30 L80 40 L50 35 L50 50 L35 50 L40 30 L20 40 L30 25 L15 20 L35 15 Z' fill='rgba(255,255,255,0.03)'/%3E%3C/svg%3E");
    background-size: 200px 200px;
    animation: snow-drift 20s linear infinite;
    pointer-events: none;
    opacity: 0.6;
  }

  @keyframes snow-drift {
    0% { transform: translateY(0) translateX(0); }
    100% { transform: translateY(100vh) translateX(50px); }
  }

  .host-content {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    padding-bottom: calc(1.5rem + 80px); /* Account for bottom scorebar */
    transition: margin-right 0.3s ease-in-out;
    position: relative;
    z-index: 1;
  }

  .host-screen.panel-open .host-content {
    margin-right: 400px;
  }

  @media (max-width: 768px) {
    .host-screen.panel-open .host-content {
      margin-right: 0;
    }
  }

  .countdown-screen,
  .playing-screen,
  .paused-screen {
    width: 100%;
    max-width: 1600px;
    min-height: fit-content;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    text-align: center;
    padding: 1rem;
    box-sizing: border-box;
    position: relative;
  }

  .starting-with-content {
    position: relative;
    width: 100%;
    min-height: fit-content;
  }

  .game-display-container {
    width: 100%;
    flex: 1;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    overflow: auto;
    padding: 0.5rem;
    box-sizing: border-box;
    position: relative;
  }

  .countdown-text {
    font-size: 3rem;
    margin-bottom: 1.5rem;
    color: #e0f2fe;
    text-shadow: 
      0 0 10px rgba(224, 242, 254, 0.8),
      0 0 20px rgba(173, 216, 230, 0.6),
      2px 2px 4px rgba(0, 0, 0, 0.5);
  }

  .countdown-number {
    font-size: 12rem;
    font-weight: bold;
    color: #ffd700;
    text-shadow: 
      0 0 20px rgba(255, 215, 0, 0.8),
      0 0 40px rgba(255, 215, 0, 0.6),
      0 0 60px rgba(255, 215, 0, 0.4),
      2px 2px 8px rgba(0, 0, 0, 0.5);
    transition: transform 0.3s ease;
    filter: drop-shadow(0 0 10px rgba(255, 215, 0, 0.5));
  }

  .countdown-number.pulse {
    animation: pulse 0.5s ease-in-out infinite;
  }

  .countdown-subtitle {
    font-size: 1.5rem;
    color: rgba(224, 242, 254, 0.8);
    margin-top: 1.5rem;
    text-shadow: 
      0 0 10px rgba(224, 242, 254, 0.5),
      1px 1px 3px rgba(0, 0, 0, 0.5);
  }

  .mega-title {
    font-size: 4rem;
    font-weight: bold;
    margin-bottom: 1.5rem;
    color: #e0f2fe;
    text-shadow: 
      0 0 15px rgba(224, 242, 254, 0.8),
      0 0 30px rgba(173, 216, 230, 0.6),
      4px 4px 8px rgba(0, 0, 0, 0.5);
    filter: drop-shadow(0 0 10px rgba(224, 242, 254, 0.4));
  }

  .instruction-text {
    font-size: 1.125rem;
    color: rgba(224, 242, 254, 0.8);
    margin-bottom: 1.5rem;
    text-shadow: 
      0 0 8px rgba(224, 242, 254, 0.4),
      1px 1px 3px rgba(0, 0, 0, 0.5);
  }

  .btn-primary-large {
    padding: 1.5rem 3rem;
    font-size: 1.5rem;
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

  @keyframes pulse {
    0%,
    100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.1);
    }
  }
</style>
