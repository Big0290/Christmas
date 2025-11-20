<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount, onDestroy } from 'svelte';
  import { socket, connectSocket, gameState, connected, players } from '$lib/socket';
  import { GameType, GameState } from '@christmas/core';
  import ScoreAnimation from '$lib/components/ScoreAnimation.svelte';
  import NotificationToast from '$lib/components/NotificationToast.svelte';
  import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
  import { browser } from '$app/environment';
  import { t } from '$lib/i18n';
  import { language } from '$lib/i18n';
  import { clearDismissedRules } from '$lib/utils/rules-modal-storage';
  
  import TriviaRoyale from '$lib/games/TriviaRoyale.svelte';
  import EmojiCarol from '$lib/games/EmojiCarol.svelte';
  import NaughtyOrNice from '$lib/games/NaughtyOrNice.svelte';
  import PriceIsRight from '$lib/games/PriceIsRight.svelte';
  import Bingo from '$lib/games/Bingo.svelte';
  import SessionLeaderboard from '$lib/components/SessionLeaderboard.svelte';
  import FinalResults from '$lib/components/FinalResults.svelte';

  const roomCode = $page.params.code;

  let isConnecting = true;
  let connectionError = false;
  let previousScore = 0;
  let previousState: GameState | null = null;
  let scoreAnimations: Array<{ id: number; points: number; x: number; y: number }> = [];
  let notifications: Array<{ id: number; message: string; type: 'info' | 'success' | 'warning' | 'error' }> = [];
  let notificationId = 0;
  let animationId = 0;
  let hasAttemptedReconnect = false;
  let isReconnecting = false; // Track if reconnection is in progress
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 3;
  let showFinalLeaderboard = false;
  
  // Store timeout IDs at component level for reactive cleanup
  let freshJoinTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let oldFlowTimeoutId: ReturnType<typeof setTimeout> | null = null;

  // Safe localStorage helper for mobile browsers (handles errors gracefully)
  function getLocalStorageItem(key: string): string | null {
    if (!browser) return null;
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.warn(`[Player] Failed to get localStorage item "${key}":`, error);
      return null;
    }
  }

  function setLocalStorageItem(key: string, value: string): boolean {
    if (!browser) return false;
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      console.warn(`[Player] Failed to set localStorage item "${key}":`, error);
      return false;
    }
  }

  // Safe sessionStorage helper for mobile browsers (handles errors gracefully)
  function getSessionStorageItem(key: string): string | null {
    if (!browser) return null;
    try {
      return sessionStorage.getItem(key);
    } catch (error) {
      console.warn(`[Player] Failed to get sessionStorage item "${key}":`, error);
      return null;
    }
  }

  function removeSessionStorageItem(key: string): boolean {
    if (!browser) return false;
    try {
      sessionStorage.removeItem(key);
      return true;
    } catch (error) {
      console.warn(`[Player] Failed to remove sessionStorage item "${key}":`, error);
      return false;
    }
  }

  function loadLeaderboardRanks() {
    if (!$socket || !browser) return;
    
    const playerName = getLocalStorageItem('christmas_playerName');
    if (!playerName) return;
    
    // Get session leaderboard
    $socket.emit('get_session_leaderboard', roomCode, (response: any) => {
      if (response.success && response.leaderboard) {
        const playerIndex = response.leaderboard.findIndex((p: any) => 
          p.playerName.toLowerCase() === playerName.toLowerCase()
        );
        if (playerIndex >= 0) {
          sessionRank = playerIndex + 1;
          sessionTotalScore = response.leaderboard[playerIndex].totalScore;
        }
      }
    });
    
    // Get global leaderboard
    $socket.emit('get_global_leaderboard', (response: any) => {
      if (response.success && response.leaderboard) {
        const playerIndex = response.leaderboard.findIndex((p: any) => 
          p.player_name.toLowerCase() === playerName.toLowerCase()
        );
        if (playerIndex >= 0) {
          globalRank = playerIndex + 1;
          globalTotalScore = response.leaderboard[playerIndex].total_score;
        }
      }
    });
  }

  function attemptReconnection(roomCodeToReconnect: string, playerToken: string) {
    if (!$socket || isReconnecting || reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      return;
    }

    hasAttemptedReconnect = true;
    isReconnecting = true;
    isConnecting = true;
    reconnectAttempts++;
    
    $socket.emit('reconnect_player', roomCodeToReconnect, playerToken, $language, (response: any) => {
      isReconnecting = false;
      isConnecting = false;
      
      if (response && response.success) {
        // Successfully reconnected
        reconnectAttempts = 0; // Reset attempts on success
        hasAttemptedReconnect = true;
        isReconnecting = false;
        
        // Try to save player ID (may fail on mobile, that's okay)
        try {
          sessionStorage.setItem('christmas_playerId', $socket?.id || '');
        } catch (error) {
          console.warn('[Player] Failed to save player ID to sessionStorage:', error);
        }
        
        // Show reconnection message with score info
        let message = `✅ ${t('notifications.reconnected')}`;
        if (response.restoredScore !== undefined && response.restoredScore >= 0) {
          message += ` ${t('notifications.scoreRestored', { score: response.restoredScore })}`;
          
          // Update score immediately for display
          if ($gameState) {
            const updatedState = { ...$gameState };
            if (updatedState.scores) {
              updatedState.scores[$socket?.id || ''] = response.restoredScore;
            } else {
              updatedState.scores = { [$socket?.id || '']: response.restoredScore };
            }
            gameState.set(updatedState);
            previousScore = response.restoredScore;
          }
        }
        
        // If game_state_update wasn't received but we have room state, set it as fallback
        // This prevents getting stuck on loading screen
        if (!$gameState && response.room?.gameState) {
          console.log('[Player] Setting game state from reconnection response:', response.room.gameState);
          const restoredScoreValue = response.restoredScore !== undefined && response.restoredScore >= 0 
            ? response.restoredScore 
            : (response.player?.score || 0);
          
          gameState.set({
            state: response.room.gameState,
            gameType: response.room.currentGame || null,
            round: 0,
            maxRounds: 0,
            scores: { [$socket?.id || '']: restoredScoreValue },
            scoreboard: [],
            players: (response.room.players || []).map((p: any) => ({
              id: p.id,
              name: p.name,
              score: p.score || 0,
              avatar: p.avatar,
              status: p.status,
            })),
          });
          
          previousScore = restoredScoreValue;
        }
        
        notifications = [
          ...notifications,
          { id: notificationId++, message, type: 'success' },
        ];
        
        // Reload leaderboard ranks after reconnection
        loadLeaderboardRanks();
        
        // Game state will be sent via game_state_update event (or we've set it from response above)
      } else {
        // Reconnection failed
        const errorMsg = response?.error || 'Reconnection failed';
        
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          // Retry after a delay
          notifications = [
            ...notifications,
            { id: notificationId++, message: t('notifications.reconnectionFailed', { attempt: reconnectAttempts }), type: 'warning' },
          ];
          
          setTimeout(() => {
            attemptReconnection(roomCodeToReconnect, playerToken);
          }, 2000 * reconnectAttempts); // Exponential backoff
        } else {
          // Max attempts reached - redirect to join page
          notifications = [
            ...notifications,
            { id: notificationId++, message: t('notifications.reconnectionError', { error: errorMsg }), type: 'error' },
          ];
          
          // Redirect to join page after showing error briefly
          setTimeout(() => {
            goto(`/join?code=${roomCodeToReconnect}`);
          }, 2000);
        }
      }
    });
  }

  onMount(() => {
    // Don't call connectSocket() here - it's already initialized by the layout
    // Only ensure socket is available, don't create a new connection
    if (!$socket) {
      console.warn('[Player] Socket not available, layout should have initialized it');
      connectSocket();
    }
    
    // Setup socket event listeners
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

      // Listen for socket disconnect/reconnect events
      $socket.on('disconnect', () => {
        console.log('[Player] Socket disconnected');
        isConnecting = true;
        connectionError = false;
        // Don't reset reconnection state immediately - wait for reconnect event
        // This allows for automatic reconnection attempts
      });

      $socket.on('reconnect', () => {
        console.log('[Player] Socket reconnected, attempting reconnection...');
        // Attempt reconnection when socket reconnects with exponential backoff
        if (browser) {
          const savedRoomCode = getLocalStorageItem('christmas_roomCode');
          const playerToken = getLocalStorageItem('christmas_playerToken');
          
          if (savedRoomCode === roomCode && playerToken && !isReconnecting) {
            // Reset flags to allow reconnection attempt
            hasAttemptedReconnect = false;
            reconnectAttempts = 0;
            
            // Use a small delay to ensure socket is fully reconnected
            setTimeout(() => {
              if (!$connected || !$socket) {
                // Socket not fully connected yet, retry after delay
                setTimeout(() => {
                  if ($connected && $socket && savedRoomCode === roomCode && playerToken) {
                    attemptReconnection(savedRoomCode, playerToken);
                  }
                }, 1000);
              } else {
                attemptReconnection(savedRoomCode, playerToken);
              }
            }, 500);
          }
        }
      });

      // Listen for player reconnected event from server
      $socket.on('player_reconnected', (data: any) => {
        console.log('[Player] Reconnected event received:', data);
        if (data.newPlayerId === $socket?.id) {
          // This is us - we successfully reconnected
          isReconnecting = false;
          reconnectAttempts = 0;
        }
      });

      // Listen for game state updates - update the store directly
      // This is a backup in case the socket.ts listener doesn't fire
      $socket.on('game_state_update', (data: any) => {
        console.log('[Player] ✅ Game state update received:', {
          state: data?.state,
          gameType: data?.gameType,
          round: data?.round,
          hasQuestion: !!data?.currentQuestion,
          hasItem: !!data?.currentItem,
          hasPrompt: !!data?.currentPrompt,
          hasEmojis: !!data?.availableEmojis,
        });
        // Update the store directly to ensure it's always synced
        console.log('[Player] Setting gameState store with:', data?.state, data?.gameType);
        gameState.set(data);
        console.log('[Player] Store updated, checking if component should render...');
      });
    };

    // Setup listeners immediately or wait for socket
    setupSocketListeners();
    
    // Verify player connection to room
    const verifyPlayerConnection = () => {
      const isConnected = $connected;
      if (!$socket || !isConnected) {
        // Wait for connection
        const unsubscribe = connected.subscribe((isConnectedNow) => {
          if (isConnectedNow && $socket) {
            unsubscribe();
            verifyPlayerConnection();
          }
        });
        return;
      }

      isConnecting = false;
      connectionError = false;

      if (browser && !hasAttemptedReconnect && !isReconnecting) {
        const savedRoomCode = getLocalStorageItem('christmas_roomCode');
        const playerToken = getLocalStorageItem('christmas_playerToken');
        const playerName = getLocalStorageItem('christmas_playerName');
        const justJoinedRoom = getSessionStorageItem('just_joined_room');
        
        // Check if this is a fresh join (just came from join page)
        if (justJoinedRoom === roomCode) {
          console.log(`[Player] Fresh join detected for room ${roomCode}, socket already in room`);
          // Clear the flag
          removeSessionStorageItem('just_joined_room');
          
          // Socket should already be in the room from join_room
          // Wait for room_update or game_state_update events instead of reconnecting
          hasAttemptedReconnect = true;
          
          // CRITICAL: Set isConnecting to false immediately for fresh joins
          // The socket is already connected and in the room, so we should show content
          isConnecting = false;
          console.log(`[Player] ✅ Fresh join - Set isConnecting=false immediately`);
          
          // CRITICAL: If socket is connected, we're fine - don't set timeout at all
          // The view might not have state yet, but if socket is connected, state will arrive
          if ($connected && $socket?.connected) {
            console.log(`[Player] ✅ Fresh join - Socket is connected, no timeout needed`, {
              socketId: $socket.id?.substring(0, 8),
              hasState: $players.length > 0 || $gameState,
              playersCount: $players.length,
              hasGameState: !!$gameState
            });
            // Clear any existing timeout
            if (freshJoinTimeoutId) {
              clearTimeout(freshJoinTimeoutId);
              freshJoinTimeoutId = null;
            }
            // Socket is connected, so we're good - state will arrive via events
            // Just set up event handlers to catch state when it arrives
            if ($socket) {
              const roomUpdateHandler = () => {
                console.log(`[Player] ✅ Received room_update for fresh join`);
                isConnecting = false;
                if ($socket) {
                  $socket.off('room_update', roomUpdateHandler);
                  $socket.off('game_state_update', gameStateHandler);
                }
              };
              const gameStateHandler = () => {
                console.log(`[Player] ✅ Received game_state_update for fresh join`);
                isConnecting = false;
                if ($socket) {
                  $socket.off('room_update', roomUpdateHandler);
                  $socket.off('game_state_update', gameStateHandler);
                }
              };
              $socket.on('room_update', roomUpdateHandler);
              $socket.on('game_state_update', gameStateHandler);
            }
            return; // Exit early - socket is connected, no timeout needed
          }
          
          // If socket is not connected, wait for it to connect first
          // Don't set timeout until socket is actually connected
          console.log(`[Player] ⏳ Fresh join - Socket not connected yet, waiting...`, {
            socketExists: !!$socket,
            socketConnected: $socket?.connected,
            connectedStore: $connected
          });
          
          // Wait for socket to connect, then proceed
          const waitForConnection = () => {
            if ($connected && $socket?.connected) {
              console.log(`[Player] ✅ Socket connected, proceeding without timeout`);
              isConnecting = false;
              // Socket is now connected - state will arrive via events
              // No timeout needed since socket is connected
              return;
            }
            // Check again after a delay
            setTimeout(waitForConnection, 500);
          };
          waitForConnection();
        } else if (playerToken && savedRoomCode === roomCode && $socket?.id) {
          // This is a reconnection attempt (has token but no just_joined flag)
          console.log(`[Player] Reconnection attempt detected for room ${roomCode}`);
          attemptReconnection(savedRoomCode, playerToken);
        } else if (playerName && savedRoomCode === roomCode) {
          // No token - might be first time entering after joining (older flow)
          // Wait a moment to see if we receive room_update or game_state_update events
          hasAttemptedReconnect = true;
          setTimeout(() => {
            // Track if we've received any events
            let receivedEventForOldFlow = false;
            
            // If we don't receive any updates within 3 seconds, redirect to join
            const timeout = setTimeout(() => {
              if (!receivedEventForOldFlow && !connectionError) {
                // Check if we have players or gameState from socket.ts listeners
                if ($players.length > 0 || $gameState) {
                  console.log(`[Player] ✅ Found players or gameState from socket.ts listeners, connection is valid`);
                  receivedEventForOldFlow = true;
                  isConnecting = false;
                  return; // Don't redirect, we have valid state
                }
                
                // Add a micro-delay check for state - catches state that arrives in the brief window
                // between timeout scheduling and execution
                setTimeout(() => {
                  // Final check for state before showing error
                  if ($players.length > 0 || $gameState) {
                    console.log(`[Player] ✅ Final check found state (old flow) - aborting error`);
                    receivedEventForOldFlow = true;
                    isConnecting = false;
                    return; // Don't show error
                  }
                  
                  // Only show error if state still doesn't exist after micro-delay
                  console.warn(`[Player] No room_update or game_state_update received after 3 seconds`);
                  notifications = [
                    ...notifications,
                    { id: notificationId++, message: t('player.errors.notConnected'), type: 'error' },
                  ];
                  // Redirect to join page
                  setTimeout(() => {
                    goto(`/join?code=${roomCode}`);
                  }, 1500);
                }, 50); // Micro-delay to catch late-arriving state
              }
            }, 3000);
            
            // Store timeout ID at component level for reactive cleanup
            oldFlowTimeoutId = timeout;
            
            // Clear timeout if we get room_update or game_state_update
            const roomUpdateHandler = () => {
              receivedEventForOldFlow = true;
              clearTimeout(timeout);
              if ($socket) {
                $socket.off('room_update', roomUpdateHandler);
                $socket.off('game_state_update', gameStateHandler);
              }
            };
            const gameStateHandler = () => {
              receivedEventForOldFlow = true;
              clearTimeout(timeout);
              if ($socket) {
                $socket.off('room_update', roomUpdateHandler);
                $socket.off('game_state_update', gameStateHandler);
              }
            };
            
            // Also check if socket.ts listeners already set the state
            const checkExistingState = () => {
              if ($players.length > 0 || $gameState) {
                console.log(`[Player] ✅ Found existing state from socket.ts listeners (old flow), connection is valid`, {
                  playersCount: $players.length,
                  hasGameState: !!$gameState,
                  gameStateType: $gameState?.gameType,
                  gameStateState: $gameState?.state,
                  socketConnected: $connected,
                  socketId: $socket?.id?.substring(0, 8)
                });
                receivedEventForOldFlow = true;
                clearTimeout(timeout);
                isConnecting = false;
                if ($socket) {
                  $socket.off('room_update', roomUpdateHandler);
                  $socket.off('game_state_update', gameStateHandler);
                }
              } else {
                console.log(`[Player] ⏳ checkExistingState (old flow): No state found yet`, {
                  playersCount: $players.length,
                  hasGameState: !!$gameState,
                  socketConnected: $connected
                });
              }
            };
            
            // Check immediately and after a short delay
            checkExistingState();
            setTimeout(checkExistingState, 500);
            
            if ($socket) {
              $socket.on('room_update', roomUpdateHandler);
              $socket.on('game_state_update', gameStateHandler);
            }
          }, 500);
        } else {
          // No saved credentials - redirect to join page
          notifications = [
            ...notifications,
            { id: notificationId++, message: t('player.errors.pleaseRejoin'), type: 'error' },
          ];
          
          // Redirect to join page after showing error briefly
          setTimeout(() => {
            goto(`/join?code=${roomCode}`);
          }, 2000);
        }
      }
    };

    // Check connection status
    const unsubscribe = connected.subscribe((isConnected) => {
      isConnecting = !isConnected;
      if (!isConnected && $socket) {
        connectionError = false; // Don't show error immediately, wait for reconnect attempt
      } else {
        connectionError = false;
        
        // Start verification when connected
        if (isConnected && $socket) {
          verifyPlayerConnection();
          
          // Load leaderboard ranks when connected
          setTimeout(() => {
            loadLeaderboardRanks();
          }, 500); // Wait a bit for socket to be ready
          
          // If we have state, make sure isConnecting is false
          setTimeout(() => {
            if ($players.length > 0 || $gameState) {
              console.log(`[Player] Setting isConnecting=false - socket connected and state exists`);
              isConnecting = false;
            }
          }, 1500);
        }
      }
    });

    return () => {
      unsubscribe();
      if ($socket) {
        $socket.off('disconnect');
        $socket.off('reconnect');
        $socket.off('player_reconnected');
        $socket.off('game_state_update');
      }
    };
  });

  // Cleanup when player leaves the room - clear dismissed rules
  onDestroy(() => {
    if (roomCode) {
      clearDismissedRules(roomCode);
    }
  });

  // Helper to check if game type is BINGO (handles undefined GameType.BINGO)
  function isBingo(gt: GameType | string | null | undefined): boolean {
    return gt === GameType.BINGO || gt === 'bingo';
  }

  $: currentGame = $gameState?.gameType;
  $: playerScore = $gameState?.scores?.[$socket?.id] || 0;
  $: currentState = $gameState?.state;
  
  // CRITICAL: Auto-set isConnecting to false when we have valid connection and state
  // This prevents getting stuck on loading screen
  $: if ($connected && $socket) {
    // If we have players or gameState, we're connected and should show content
    if (($players.length > 0 || $gameState) && isConnecting) {
      console.log(`[Player Page] ✅ Reactive: Auto-setting isConnecting=false - have connection and state`, {
        playersCount: $players.length,
        hasGameState: !!$gameState,
        currentGame,
        currentState,
        wasConnecting: isConnecting
      });
      isConnecting = false;
      connectionError = false; // Also clear any connection errors
    }
  }
  
  // Separate reactive statement to prevent timeout errors when state exists
  // This runs whenever players or gameState changes
  $: if (($players.length > 0 || $gameState) && $connected && $socket) {
    // If we have state and connection, we're definitely connected - clear any pending errors
    if (connectionError) {
      console.log(`[Player Page] ✅ Clearing connectionError - state exists and socket is connected`);
      connectionError = false;
    }
    if (isConnecting) {
      console.log(`[Player Page] ✅ Clearing isConnecting - state exists and socket is connected`);
      isConnecting = false;
    }
  }
  
  // Reactive statement to remove error notifications when state exists
  // This ensures error notifications are automatically cleared when valid state is detected
  $: if (($players.length > 0 || $gameState) && $connected && $socket) {
    // Remove any "notConnected" or "pleaseRejoin" error notifications
    const errorMessages = [t('player.errors.notConnected'), t('player.errors.pleaseRejoin')];
    const hadErrors = notifications.some(n => n.type === 'error' && errorMessages.includes(n.message));
    if (hadErrors) {
      notifications = notifications.filter(n => 
        !(n.type === 'error' && errorMessages.includes(n.message))
      );
      console.log(`[Player Page] ✅ Removed error notifications - state exists and socket is connected`);
    }
  }
  
  // Reactive statement to clear timeouts when state is detected
  // This prevents timeouts from firing if state arrives after they're scheduled
  // CRITICAL for mobile: This runs immediately when state changes
  // Also clear connection errors when we have valid state
  $: if (($players.length > 0 || $gameState) && $connected && $socket) {
    // Clear fresh join timeout immediately when state is detected
    if (freshJoinTimeoutId) {
      const timeoutToClear = freshJoinTimeoutId;
      console.log(`[Player Page] ✅ Reactive: Clearing freshJoinTimeout - state exists`, {
        playersCount: $players.length,
        hasGameState: !!$gameState,
        gameStateType: $gameState?.gameType,
        gameStateState: $gameState?.state,
        socketConnected: $connected,
        socketId: $socket?.id?.substring(0, 8),
        timeoutId: timeoutToClear
      });
      clearTimeout(timeoutToClear);
      freshJoinTimeoutId = null;
    }
    // Clear old flow timeout immediately when state is detected
    if (oldFlowTimeoutId) {
      const timeoutToClear = oldFlowTimeoutId;
      console.log(`[Player Page] ✅ Reactive: Clearing oldFlowTimeout - state exists`, {
        playersCount: $players.length,
        hasGameState: !!$gameState,
        gameStateType: $gameState?.gameType,
        gameStateState: $gameState?.state,
        socketConnected: $connected,
        socketId: $socket?.id?.substring(0, 8),
        timeoutId: timeoutToClear
      });
      clearTimeout(timeoutToClear);
      oldFlowTimeoutId = null;
    }
    
    // CRITICAL for mobile: Also clear connectionError when we have valid state
    if (connectionError) {
      console.log(`[Player Page] ✅ Reactive: Clearing connectionError - state exists and socket is connected`);
      connectionError = false;
    }
    
    // CRITICAL for mobile: Ensure isConnecting is false when we have state
    if (isConnecting) {
      console.log(`[Player Page] ✅ Reactive: Setting isConnecting=false - state exists and socket is connected`);
      isConnecting = false;
    }
  }
  
  // Debug logging for game component rendering
  $: {
    console.log('[Player Page] Game state check:', {
      currentGame,
      currentGameType: typeof currentGame,
      GameType_TRIVIA_ROYALE: GameType.TRIVIA_ROYALE,
      GameType_BINGO: GameType.BINGO,
      isBingoGame: isBingo(currentGame),
      matchesTrivia: currentGame === GameType.TRIVIA_ROYALE,
      currentState,
      hasGameState: !!$gameState,
      hasPlayerCard: !!$gameState?.playerCard,
      isConnecting,
      connected: $connected,
      playersCount: $players.length
    });
  }
  
  // Check if player has already answered current question/round
  $: hasAlreadyAnswered = $gameState && (
    $gameState.hasAnswered === true ||
    $gameState.hasGuessed === true ||
    $gameState.hasVoted === true ||
    $gameState.hasPicked === true
  );
  
  // Show waiting message if reconnecting during active round and already answered
  $: showWaitingDuringRound = hasAlreadyAnswered && currentState === GameState.PLAYING;

  // Log game state changes for debugging (only log valid state transitions)
  $: if (currentState !== previousState && currentState !== undefined && previousState !== undefined) {
    console.log(`[Player] Game state changed: ${previousState} -> ${currentState}`);
    if (currentState === GameState.PLAYING) {
      console.log('[Player] ✅ Game is now PLAYING', {
        hasQuestion: !!$gameState?.currentQuestion,
        hasItem: !!$gameState?.currentItem,
        hasPrompt: !!$gameState?.currentPrompt,
        hasEmojis: !!$gameState?.availableEmojis,
        round: $gameState?.round
      });
    }
    previousState = currentState;
  } else if (currentState !== undefined) {
    // Initialize previousState if currentState becomes defined
    previousState = currentState;
  }
  
  // Leaderboard ranks (will be populated from socket events)
  let sessionRank = 0;
  let globalRank = 0;
  let sessionTotalScore = 0;
  let globalTotalScore = 0;

  // Track score changes for animations
  $: {
    if (browser && playerScore !== previousScore && previousScore > 0) {
      const scoreChange = playerScore - previousScore;
      if (scoreChange !== 0) {
        // Add score animation
        const headerElement = document.querySelector('.mobile-header');
        if (headerElement) {
          const rect = headerElement.getBoundingClientRect();
          scoreAnimations = [
            ...scoreAnimations,
            {
              id: animationId++,
              points: scoreChange,
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
            },
          ];
          // Remove animation after it completes
          setTimeout(() => {
            scoreAnimations = scoreAnimations.filter((a) => a.id !== animationId - 1);
          }, 2000);
        }
      }
      previousScore = playerScore;
    } else if (previousScore === 0 && playerScore > 0) {
      previousScore = playerScore;
    }
  }

  // Track state changes for notifications
  $: {
    if (currentState && currentState !== previousState) {
      if (currentState === GameState.STARTING) {
        notifications = [
          ...notifications,
          { id: notificationId++, message: `🎮 ${t('notifications.gameStarting')}`, type: 'info' },
        ];
      } else if (currentState === GameState.ROUND_END) {
        const roundNum = $gameState?.round || 0;
        notifications = [
          ...notifications,
          { id: notificationId++, message: `🎉 ${t('notifications.roundComplete', { round: roundNum })}`, type: 'success' },
        ];
      } else if (currentState === GameState.GAME_END) {
        notifications = [
          ...notifications,
          { id: notificationId++, message: `🏆 ${t('notifications.gameOver')}`, type: 'success' },
        ];
        // Refresh leaderboard ranks after game ends
        setTimeout(() => {
          loadLeaderboardRanks();
        }, 1000);
        // Show final leaderboard automatically
        showFinalLeaderboard = true;
      }
      previousState = currentState;
    }
  }

  function removeNotification(id: number) {
    notifications = notifications.filter((n) => n.id !== id);
  }
</script>

<svelte:head>
  <title>{t('player.title', { code: roomCode })} | {t('home.title')}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
</svelte:head>

<div class="mobile-container">
  <!-- Score Animations -->
  {#each scoreAnimations as anim}
    <ScoreAnimation points={anim.points} x={anim.x} y={anim.y} />
  {/each}

  <!-- Notifications -->
  {#each notifications as notif (notif.id)}
    <NotificationToast
      message={notif.message}
      type={notif.type}
      duration={3000}
      on:close={() => removeNotification(notif.id)}
    />
  {/each}

  <!-- Header -->
  <div class="mobile-header">
    <div class="flex justify-between items-center">
      <div>
        <div class="text-xs text-white/60">{t('player.room', { code: roomCode })}</div>
        <div class="text-2xl font-bold score-display">🎄 {playerScore} {t('common.label.pts')}</div>
        {#if currentState === GameState.GAME_END}
          {#if sessionRank > 0 || globalRank > 0}
            <div class="text-xs text-white/50 mt-1">
              {#if sessionRank > 0}
                {t('player.sessionRank', { rank: sessionRank })}
              {/if}
              {#if globalRank > 0}
                {#if sessionRank > 0} • {/if}{t('player.globalRank', { rank: globalRank })}
              {/if}
            </div>
          {/if}
        {/if}
      </div>
      <div class="flex flex-col items-end gap-2">
        <div class="text-3xl">
          {$socket?.id ? '🟢' : '🔴'}
        </div>
        <LanguageSwitcher />
      </div>
    </div>
  </div>

  <!-- Game Content -->
  <div class="mobile-content">
    {#if connectionError}
      <div class="flex items-center justify-center h-full">
        <div class="text-center">
          <div class="text-6xl mb-4">⚠️</div>
          <h2 class="text-2xl font-bold mb-2">{t('player.connection.lost')}</h2>
          <p class="text-white/70 mb-4">
            {t('player.connection.reconnecting')}
          </p>
          <div class="flex gap-2 justify-center flex-wrap">
            <button on:click={() => { connectSocket(); connectionError = false; }} class="btn-primary">
              {t('player.connection.retry')}
            </button>
            <button on:click={() => {
              if (browser && $socket) {
                const savedRoomCode = getLocalStorageItem('christmas_roomCode');
                const token = getLocalStorageItem('christmas_playerToken');
                if (savedRoomCode === roomCode && token) {
                  // Reset reconnection state and attempt reconnection
                  hasAttemptedReconnect = false;
                  reconnectAttempts = 0;
                  isReconnecting = false;
                  attemptReconnection(savedRoomCode, token);
                } else {
                  // No credentials - redirect to join
                  goto(`/join?code=${roomCode}`);
                }
              }
            }} class="btn-secondary">
              {t('player.connection.reconnectNow')}
            </button>
            <button on:click={() => goto(`/join?code=${roomCode}`)} class="btn-secondary">
              {t('common.button.join')} Again
            </button>
          </div>
        </div>
      </div>
    {:else if isConnecting}
      <div class="flex items-center justify-center h-full" style="min-height: 50vh;">
        <div class="text-center">
          <div class="text-6xl mb-4 animate-spin">⏳</div>
          <h2 class="text-2xl font-bold mb-2">{t('player.connection.connecting')}</h2>
          <p class="text-white/70 mb-4">
            {t('player.connection.pleaseWait')}
          </p>
          <p class="text-white/50 text-sm">
            Room: {roomCode} | Connected: {$connected ? '✅' : '❌'} | Socket: {$socket?.id?.substring(0, 8) || 'none'}
          </p>
          <p class="text-white/50 text-xs mt-2">
            Players: {$players.length} | GameState: {$gameState ? '✅' : '❌'} | isConnecting: {isConnecting}
          </p>
        </div>
      </div>
    {:else if !currentGame}
      <div class="flex items-center justify-center h-full">
        <div class="text-center">
          <div class="text-6xl mb-4">🎄</div>
          <h2 class="text-2xl font-bold mb-2">{t('player.connection.waitingStart')}</h2>
          <p class="text-white/70 mb-4">
            {t('player.connection.hostWillStart')}
          </p>
          <p class="text-white/50 text-sm">
            Room: {roomCode} | Players: {$players.length}
          </p>
          <p class="text-white/50 text-xs mt-2">
            Connected: {$connected ? '✅' : '❌'} | Socket: {$socket?.id?.substring(0, 8) || 'none'}
          </p>
        </div>
      </div>
    {:else if showWaitingDuringRound}
      <!-- Show waiting message when reconnecting during active round if already answered -->
      <div class="flex items-center justify-center h-full">
        <div class="text-center">
          <div class="text-6xl mb-4">⏳</div>
          <h2 class="text-2xl font-bold mb-2">{t('player.connection.waitingNextRound')}</h2>
          <p class="text-white/70">
            {t('player.connection.alreadyAnswered')}
          </p>
          <p class="text-white/50 text-sm mt-2">
            {t('player.connection.roundContinues')}
          </p>
        </div>
      </div>
    {:else if currentGame === GameType.TRIVIA_ROYALE}
      {@const _ = console.log('[Player Page] Rendering TriviaRoyale component')}
      <TriviaRoyale />
    {:else if currentGame === GameType.EMOJI_CAROL}
      {@const _ = console.log('[Player Page] Rendering EmojiCarol component')}
      <EmojiCarol />
    {:else if currentGame === GameType.NAUGHTY_OR_NICE}
      {@const _ = console.log('[Player Page] Rendering NaughtyOrNice component')}
      <NaughtyOrNice />
    {:else if currentGame === GameType.PRICE_IS_RIGHT}
      {@const _ = console.log('[Player Page] Rendering PriceIsRight component')}
      <PriceIsRight />
    {:else if isBingo(currentGame)}
      {@const _ = console.log('[Player Page] Rendering Bingo component, currentGame:', currentGame)}
      <Bingo />
    {/if}
  </div>

  {#if currentState === GameState.GAME_END}
    <FinalResults {roomCode} scoreboard={$gameState?.scoreboard || []} gameType={$gameState?.gameType} isHost={false} />
  {/if}
</div>

<style>
  .mobile-container {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: linear-gradient(135deg, #0a1a2e 0%, #1a2a4e 30%, #2a3a6e 60%, #1a2a4e 100%);
    background-image: 
      radial-gradient(circle at 20% 30%, rgba(255, 255, 255, 0.1) 0%, transparent 50%),
      radial-gradient(circle at 80% 70%, rgba(173, 216, 230, 0.15) 0%, transparent 50%),
      radial-gradient(circle at 50% 50%, rgba(176, 224, 230, 0.1) 0%, transparent 50%);
    color: white;
    padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
    position: relative;
    overflow: hidden;
  }

  /* Snowflake animation background */
  .mobile-container::before {
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
    z-index: 0;
  }

  @keyframes snow-drift {
    0% { transform: translateY(0) translateX(0); }
    100% { transform: translateY(100vh) translateX(50px); }
  }

  .mobile-header {
    padding: 1rem;
    background: rgba(0, 0, 0, 0.2);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border-bottom: 2px solid rgba(255, 255, 255, 0.2);
    position: relative;
    z-index: 1;
  }

  .score-display {
    transition: transform 0.2s;
    text-shadow: 0 0 10px rgba(255, 255, 255, 0.5), 0 0 20px rgba(173, 216, 230, 0.5);
    filter: drop-shadow(0 0 5px rgba(255, 255, 255, 0.3));
  }

  .score-display:global(.score-updated) {
    animation: scorePulse 0.5s ease-out;
  }

  @keyframes scorePulse {
    0%, 100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.1);
    }
  }

  .mobile-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 1rem;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-y;
    width: 100%;
    position: relative;
    z-index: 1;
  }

  /* Disable text selection for better mobile UX */
  :global(.mobile-container *) {
    -webkit-user-select: none;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  /* Allow selection on inputs */
  :global(.mobile-container input, .mobile-container textarea) {
    -webkit-user-select: text;
    user-select: text;
  }

  /* Leaderboard Modal */
  .leaderboard-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
  }

  .leaderboard-modal {
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    border: 3px solid #ffd700;
    border-radius: 1rem;
    padding: 2rem;
    max-width: 500px;
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
  }

  .leaderboard-modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
  }

  .close-modal-btn {
    background: rgba(255, 255, 255, 0.1);
    border: none;
    color: white;
    font-size: 1.5rem;
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
  }

  .close-modal-btn:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .leaderboard-modal-content {
    margin-bottom: 1.5rem;
  }
</style>

