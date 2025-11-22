<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { socket, connectSocket, gameState, players, connected } from '$lib/socket';
  import { GameState, GameType } from '@christmas/core';
  import { normalizeGameState, normalizeGameType } from '$lib/utils/game-state';
  import HostGameDisplay from '$lib/components/host/HostGameDisplay.svelte';
  import HostBottomScorebar from '$lib/components/host/HostBottomScorebar.svelte';
  import HostLeaderboardDisplay from '$lib/components/host/HostLeaderboardDisplay.svelte';
  import HostLobbyDisplay from '$lib/components/host/HostLobbyDisplay.svelte';
  import GuessingRevealModal from '$lib/components/guessing/GuessingRevealModal.svelte';
  import { t, language } from '$lib/i18n';
  import ChristmasLoading from '$lib/components/ChristmasLoading.svelte';
  import { loadRoomTheme, applyRoomTheme, roomTheme, currentRoomCode } from '$lib/theme';
  import type { GuessingChallenge, GuessingSubmission } from '@christmas/core';

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
      console.warn('[Display] No host token found, redirecting to room page');
      goto(`/room/${roomCode}`);
      return;
    }
    
    // Check for role query param
    if (!role || role !== 'host-display') {
      console.warn('[Display] Invalid or missing role query param, redirecting to mode selector');
      goto(`/room/${roomCode}/host`);
      return;
    }
    
    // Check for mode in sessionStorage (must come from mode selector)
    const storedMode = sessionStorage.getItem(`host_mode_${roomCode}`);
    if (!storedMode || storedMode !== 'host-display') {
      console.warn('[Display] Mode not set in sessionStorage, redirecting to mode selector');
      goto(`/room/${roomCode}/host`);
      return;
    }
    
    if (role === 'player') {
      goto(`/play/${roomCode}`);
      return;
    }
  });

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
  let joinUrl = '';
  let origin = '';
  
  // Guessing challenge reveal modal state
  let revealModalOpen = false;
  let revealChallengeData: GuessingChallenge | null = null;
  let revealSubmissions: GuessingSubmission[] = [];

  onMount(() => {
    // Skip if invalid role or missing sessionStorage mode (already handled above)
    if (!browser) return;
    
    // Theme will be loaded after socket connects (see waitForConnection)
    // This prevents trying to load before socket is ready
    
    // Set origin and join URL
    origin = window.location.origin;
    joinUrl = `${origin}/join?code=${roomCode}`;
    
    const hostToken = localStorage.getItem('christmas_hostToken');
    const savedRoomCode = localStorage.getItem('christmas_roomCode');
    const hasHostToken = !!(hostToken && savedRoomCode === roomCode);
    const storedMode = sessionStorage.getItem(`host_mode_${roomCode}`);
    
    if (!hasHostToken || !role || role !== 'host-display' || !storedMode || storedMode !== 'host-display') {
      return;
    }

    if (!$socket) {
      connectSocket().catch((err) => {
        console.error('[Display] Failed to connect socket:', err);
      });
    }

    connectionTimeout = setTimeout(() => {
      if (!$connected) {
        console.error('[Display] Connection timeout');
      }
    }, 15000);

    const setupSocketListeners = () => {
      console.log('[Display] 🔵 setupSocketListeners called', {
        hasSocket: !!$socket,
        listenersSetup,
        connected: $connected,
        socketConnected: $socket?.connected,
      });
      
      if (!$socket || listenersSetup) {
        console.log('[Display] ⚠️ Skipping setupSocketListeners', {
          hasSocket: !!$socket,
          listenersSetup,
        });
        return;
      }
      listenersSetup = true;
      console.log('[Display] ✅ Setting up socket listeners...');

      const waitForConnection = () => {
        console.log('[Display] 🔵 waitForConnection called', {
          connected: $connected,
          socketConnected: $socket?.connected,
          hasSocket: !!$socket,
        });
        
        if (!$connected || !$socket?.connected) {
          console.log('[Display] 🔵 Waiting for socket connection...');
          const unsubscribe = connected.subscribe((isConnected) => {
            console.log('[Display] 🔵 Connection state changed:', isConnected, 'socket connected:', $socket?.connected);
            if (isConnected && $socket?.connected) {
              unsubscribe();
              if (connectionSubscription) connectionSubscription();
              connectionSubscription = null;
              console.log('[Display] 🔵 Socket connected, calling attemptHostReconnect...');
              // Don't load theme here - wait for reconnect response which includes theme
              attemptHostReconnect();
            }
          });
          if (connectionSubscription) connectionSubscription();
          connectionSubscription = unsubscribe;
          setTimeout(() => {
            unsubscribe();
            connectionSubscription = null;
          }, 10000);
        } else {
          console.log('[Display] 🔵 Socket already connected, calling attemptHostReconnect immediately...');
          // Don't load theme yet - wait for reconnect response which includes theme
          attemptHostReconnect();
        }
      };

      function attemptHostReconnect() {
        console.log('[Display] 🔵 attemptHostReconnect called', {
          browser,
          hasSocket: !!$socket,
          connected: $connected,
          socketConnected: $socket?.connected,
        });
        
        if (!browser || !$socket || !$connected || !$socket.connected) {
          console.warn('[Display] ⚠️ Cannot reconnect: socket not ready', {
            browser,
            hasSocket: !!$socket,
            connected: $connected,
            socketConnected: $socket?.connected,
          });
          return;
        }

        const savedRoomCode = localStorage.getItem('christmas_roomCode');
        const hostToken = localStorage.getItem('christmas_hostToken');
        const currentLanguage = get(language);

        console.log('[Display] 🔵 Reconnect check', {
          savedRoomCode,
          roomCode,
          hasHostToken: !!hostToken,
          currentLanguage,
        });

        if (savedRoomCode === roomCode && hostToken) {
          console.log('[Display] 🔵 Calling attemptReconnect...');
          attemptReconnect(hostToken, currentLanguage);
        } else {
          console.warn('[Display] ⚠️ No valid host token, redirecting...', {
            savedRoomCode,
            roomCode,
            match: savedRoomCode === roomCode,
            hasHostToken: !!hostToken,
          });
          setTimeout(() => {
            goto(`/room/${roomCode}`);
          }, 2000);
        }
      }

      function attemptReconnect(token: string, lang: 'en' | 'fr') {
        console.log('[Display] 🔵 attemptReconnect called', {
          hasSocket: !!$socket,
          connected: $connected,
          socketConnected: $socket?.connected,
          roomCode,
          tokenLength: token?.length || 0,
          lang,
        });
        
        if (!$socket || !$connected || !$socket.connected) {
          console.error('[Display] ❌ Cannot reconnect: socket not connected', {
            hasSocket: !!$socket,
            connected: $connected,
            socketConnected: $socket?.connected,
          });
          return;
        }

        console.log('[Display] 🔵 Emitting reconnect_host event to room:', roomCode);
        ($socket as any).emit(
          'reconnect_host',
          roomCode,
          token,
          lang,
          'host-display', // Pass role
          (response: any) => {
            console.log('[Display] 🔵 Reconnect response received:', response);
            if (response && response.success) {
              console.log('[Display] ✅ Successfully reconnected as host-display', response);
              
              // Ensure challenge_revealed listener is still registered after reconnect
              // (it should be, but verify it's not lost during reconnect)
              if ($socket) {
                console.log('[Display] 🔵 Verifying challenge_revealed listener is still registered after reconnect');
                // The listener should already be set up earlier, but we can verify
              }
              
              // Load theme settings for persistence - reconnect response should have theme
              if (response.theme) {
                console.log('[Display] Applying theme from reconnect response:', response.theme);
                applyRoomTheme(response.theme);
                // Also update the store
                roomTheme.set(response.theme);
                currentRoomCode.set(roomCode);
              } else {
                console.warn('[Display] No theme in reconnect response, loading from server...');
                // Fallback: load theme from server (but this requires auth, so might fail)
                loadRoomTheme(roomCode).catch((err) => {
                  console.warn('[Display] Failed to load theme:', err);
                });
              }
              
              // Use players from reconnect response if available
              // NOTE: This is a temporary snapshot - room_update event will follow with authoritative list
              if (response.room && Array.isArray(response.room.players)) {
                // Validate player objects have required properties
                const validPlayers = response.room.players.filter((p: any) => {
                  const hasName = p && typeof p.name === 'string' && p.name.trim().length > 0;
                  if (!hasName) {
                    console.warn('[Display] ⚠️ Invalid player object missing name:', p);
                  }
                  return hasName;
                });
                
                console.log(`[Display] ✅ Setting players from reconnect response: ${validPlayers.length} valid player(s) out of ${response.room.players.length} total`, validPlayers);
                console.log('[Display] ✅ Player names:', validPlayers.map((p: any) => p.name).join(', '));
                
                // Set players immediately for display, but room_update event will sync authoritative list
                players.set(validPlayers);
                // Verify the update worked
                const updatedPlayers = get(players);
                console.log(`[Display] ✅ Players store after update: ${updatedPlayers.length} player(s)`, updatedPlayers);
                console.log('[Display] ✅ Updated player names:', updatedPlayers.map((p: any) => p.name).join(', '));
                console.log('[Display] 📡 Waiting for room_update event to sync authoritative player list...');
              } else {
                console.warn('[Display] ⚠️ Reconnect response missing players array:', response);
                // Set empty array to prevent undefined state - room_update will populate it
                players.set([]);
                // Try to get players from room object even if not in expected format
                if (response.room && response.room.playerCount !== undefined) {
                  console.warn(`[Display] ⚠️ Room has ${response.room.playerCount} players but players array missing - waiting for room_update event`);
                }
              }
            } else {
              console.error('[Display] ❌ Reconnect failed:', response?.error || 'Unknown error');
            }
          }
        );
      }

      // NOTE: room_update events are handled by socket.ts (line 422-450)
      // which updates the players store. We don't need a duplicate listener here.
      // The $players store will automatically update when socket.ts receives room_update.

      // Set up challenge_revealed listener FIRST, before reconnect
      // This ensures we don't miss any reveal events that happen during reconnect
      console.log('[Display] 🔵 Setting up challenge_revealed listener (early)');
      ($socket as any).on('challenge_revealed', (data: { challenge: GuessingChallenge; submissions: GuessingSubmission[] }) => {
        console.log('[Display] 🎯 challenge_revealed event received:', {
          hasChallenge: !!data?.challenge,
          hasSubmissions: !!data?.submissions,
          submissionsCount: data?.submissions?.length || 0,
          challengeTitle: data?.challenge?.title,
          fullData: data
        });
        if (data && data.challenge) {
          revealChallengeData = data.challenge;
          revealSubmissions = data.submissions || [];
          revealModalOpen = true;
          console.log('[Display] 🎯 ✅ Opening reveal modal on display screen with challenge:', data.challenge.title, 'submissions:', revealSubmissions.length);
        } else {
          console.warn('[Display] ⚠️ challenge_revealed event received but data is invalid:', data);
        }
      });
      console.log('[Display] ✅ challenge_revealed listener registered (early)');

      waitForConnection();

      // Listen to display_sync_state event (primary)
      // NOTE: socket.ts also has a listener that emits ACKs, but we need to ensure ACKs are sent
      ($socket as any).on('display_sync_state', (data: any) => {
        console.log('[Display] 📺 display_sync_state received:', {
          state: data?.state,
          gameType: data?.gameType,
          round: data?.round,
          hasQuestion: !!data?.currentQuestion,
          hasItem: !!data?.currentItem,
          hasPrompt: !!data?.currentPrompt,
          hasEmojis: !!data?.availableEmojis,
          hasCard: !!(data?.playerCard || data?.currentCard),
          scoreboardLength: data?.scoreboard?.length || 0,
          version: data?.version
        });
        
        // Emit ACK for display_sync_state (socket.ts listener should also do this, but ensure it happens)
        if (data?.version !== undefined && data?.version !== null && $socket) {
          $socket.emit('state_ack', {
            version: data.version,
            messageType: 'state',
            timestamp: data.timestamp || Date.now()
          });
          console.log(`[Display] 📺 ✅ Emitted ACK for display_sync_state version ${data.version}`);
        }
        
        if (data && typeof data === 'object' && data.state) {
          // Log game-specific data to verify it's included
          const gameDataPresent = !!(data.currentQuestion || data.currentItem || 
                                    data.currentPrompt || data.availableEmojis ||
                                    data.playerCard || data.currentCard || 
                                    data.calledItems || data.playerCards);
          if (gameDataPresent) {
            console.log('[Display] ✅ Game-specific data present in display_sync_state:', {
              hasQuestion: !!data.currentQuestion,
              hasItem: !!data.currentItem,
              hasPrompt: !!data.currentPrompt,
              hasEmojis: !!data.availableEmojis,
              hasCard: !!(data.playerCard || data.currentCard)
            });
          } else if (data.state === GameState.PLAYING || data.state === GameState.STARTING || data.state === GameState.ROUND_END) {
            console.warn('[Display] ⚠️ Game state active but no game-specific data in display_sync_state');
            // If we're in STARTING state and no game data yet, that's okay - it might come later
            if (data.state === GameState.STARTING) {
              console.log('[Display] ℹ️ STARTING state without game data - game may still be initializing');
            }
          }
          
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
            // CRITICAL: Normalize state and gameType before setting
            // This ensures enum values are used instead of strings
            const normalizedData = {
              ...data,
              state: normalizeGameState(data.state) ?? data.state,
              gameType: normalizeGameType(data.gameType) ?? data.gameType
            };
            // Use set() to completely replace state with new data
            // This ensures game-specific data from display_sync_state overwrites any minimal state from game_started
            gameState.set(normalizedData);
            console.log('[Display] ✅ Updated gameState store with display_sync_state (complete state replacement, normalized):', {
              state: normalizedData.state,
              gameType: normalizedData.gameType,
              hasQuestion: !!normalizedData.currentQuestion
            });
            
            // Verify the update worked
            const updatedState = get(gameState);
            console.log('[Display] ✅ Verified gameState update:', {
              state: updatedState?.state,
              gameType: updatedState?.gameType,
              hasQuestion: !!updatedState?.currentQuestion,
              hasItem: !!updatedState?.currentItem,
              hasPrompt: !!updatedState?.currentPrompt,
              hasEmojis: !!updatedState?.availableEmojis
            });
            
            // Clear game_ended data when state changes away from GAME_END
            if (data.state !== GameState.GAME_END) {
              gameEndedScoreboard = null;
              gameEndedGameType = null;
            }
          }
        } else {
          console.warn('[Display] ⚠️ Invalid display_sync_state data received:', data);
        }
      });

      // Also listen to game_state_update as fallback (for consistency)
      $socket.on('game_state_update', (data: any) => {
        console.log('[Display] 📺 game_state_update received (fallback):', {
          state: data?.state,
          gameType: data?.gameType,
          hasQuestion: !!data?.currentQuestion,
          hasItem: !!data?.currentItem,
          hasPrompt: !!data?.currentPrompt,
          hasEmojis: !!data?.availableEmojis
        });
        
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
            // Normalize state and gameType before setting
            const normalizedData = {
              ...data,
              state: normalizeGameState(data.state) ?? data.state,
              gameType: normalizeGameType(data.gameType) ?? data.gameType
            };
            // Update gameState store with all data (including game-specific fields)
            gameState.set(normalizedData);
            console.log('[Display] ✅ Updated gameState store with game_state_update (fallback, normalized):', {
              state: normalizedData.state,
              gameType: normalizedData.gameType
            });
            
            // Clear game_ended data when state changes away from GAME_END
            if (data.state !== GameState.GAME_END) {
              gameEndedScoreboard = null;
              gameEndedGameType = null;
            }
          }
        } else {
          console.warn('[Display] ⚠️ Invalid game_state_update data received:', data);
        }
      });

      $socket.on('game_ended', (data: any) => {
        console.log('[Display] game_ended received:', data);
        // Store scoreboard and gameType from game_ended event (authoritative)
        gameEndedScoreboard = data?.scoreboard || null;
        gameEndedGameType = data?.gameType || null;
        // Update state to GAME_END with scoreboard and gameType
        gameState.update((current) => {
          if (current) {
            return {
              ...current,
              state: GameState.GAME_END,
              scoreboard: gameEndedScoreboard || current.scoreboard || [],
              gameType: gameEndedGameType || current.gameType || null,
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
        console.log('[Display] 🎮 game_started received:', gameType);
        // Clear game_ended data when new game starts
        gameEndedScoreboard = null;
        gameEndedGameType = null;
        // Set initial state - but DON'T clear gameState completely
        // Instead, update it so display_sync_state can merge game-specific data
        // The display_sync_state event will follow immediately with full game data
        gameState.update((current) => {
          return {
            ...current,
            state: GameState.STARTING,
            gameType: gameType,
            round: current?.round || 0,
            maxRounds: current?.maxRounds || 0,
            startedAt: Date.now(),
            scores: current?.scores || {},
            scoreboard: [],
            // Preserve any existing game-specific data until display_sync_state updates it
            currentQuestion: current?.currentQuestion,
            currentItem: current?.currentItem,
            currentPrompt: current?.currentPrompt,
            availableEmojis: current?.availableEmojis,
          };
        });
        console.log('[Display] 🎮 Updated gameState to STARTING, waiting for display_sync_state with game data...');
      });

      // State transition events
      $socket.on('round_started', (data: { round: number; maxRounds: number; gameType: GameType }) => {
        console.log('[Display] round_started received:', data);
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
        console.log('[Display] round_ended received:', data);
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
        console.log('[Display] ⏸️ game_paused received:', data);
        gameState.update((current) => {
          if (current) {
            const updated = {
              ...current,
              state: GameState.PAUSED,
              round: data.round,
            };
            console.log('[Display] ✅ Updated gameState to PAUSED:', updated);
            return updated;
          }
          console.warn('[Display] ⚠️ No current gameState to update when pausing');
          return current;
        });
      });

      $socket.on('game_resumed', (data: { gameType: GameType; round: number }) => {
        console.log('[Display] ▶️ game_resumed received:', data);
        gameState.update((current) => {
          if (current) {
            const updated = {
              ...current,
              state: GameState.PLAYING,
              round: data.round,
            };
            console.log('[Display] ✅ Updated gameState to PLAYING:', updated);
            return updated;
          }
          console.warn('[Display] ⚠️ No current gameState to update when resuming');
          return current;
        });
      });

      $socket.on('state_transition', (data: { from: GameState; to: GameState; gameType: GameType; round?: number }) => {
        console.log('[Display] state_transition received:', data);
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

      // Note: challenge_revealed listener is set up earlier (before waitForConnection)
      // to ensure we don't miss events during reconnect

      // Note: room_update listener is set up earlier, before reconnect
    };

    console.log('[Display] 🔵 Setting up socket listeners', {
      hasSocket: !!$socket,
      connected: $connected,
      socketConnected: $socket?.connected,
    });
    
    if ($socket) {
      console.log('[Display] 🔵 Socket available, calling setupSocketListeners...');
      setupSocketListeners();
    } else {
      console.log('[Display] 🔵 Socket not available, subscribing to socket store...');
      const unsubscribe = socket.subscribe((sock) => {
        if (sock) {
          console.log('[Display] 🔵 Socket became available, calling setupSocketListeners...');
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
    };
  });

  onDestroy(() => {
    listenersSetup = false;
    if ($socket) {
      console.log('[Display] 🔴 Cleaning up socket listeners');
      ($socket as any).off('display_sync_state');
      $socket.off('game_state_update');
      $socket.off('game_ended');
      $socket.off('game_started');
      ($socket as any).off('challenge_revealed');
      console.log('[Display] ✅ Socket listeners cleaned up');
      // NOTE: room_update listener is handled by socket.ts, no need to clean up here
    }
    if (connectionTimeout) clearTimeout(connectionTimeout);
    if (connectionSubscription) {
      connectionSubscription();
      connectionSubscription = null;
    }
  });

  function handleRevealModalClose() {
    revealModalOpen = false;
    revealChallengeData = null;
    revealSubmissions = [];
  }

  // Always use $gameState as source of truth for synchronization
  $: currentState = $gameState?.state;
  // Use gameEndedGameType if available (authoritative), otherwise use gameState gameType
  $: currentGameType = gameEndedGameType || $gameState?.gameType || null;
  // Use gameEndedScoreboard if available (authoritative), otherwise use gameState scoreboard
  $: scoreboard = gameEndedScoreboard || $gameState?.scoreboard || [];
  // Round synchronization: always read from gameState to ensure sync with players
  $: round = $gameState?.round ?? 0;
  $: maxRounds = $gameState?.maxRounds ?? 0;
  
  // Reactive subscription to players store to ensure HostLobbyDisplay updates
  // This ensures the component re-renders when players join/leave
  $: {
    if ($players !== undefined) {
      const playerCount = $players?.length || 0;
      const playersWithNames = $players?.filter(p => p?.name && typeof p.name === 'string' && p.name.trim().length > 0) || [];
      console.log(`[Display] 🔵 Players store updated: ${playerCount} total, ${playersWithNames.length} with names`);
      // Force reactivity by accessing the store value
      // The HostLobbyDisplay component will receive the updated players prop automatically
    }
  }
  
  // Debug logging for game end state
  $: if (currentState === GameState.GAME_END) {
    console.log('[Display] GAME_END state detected:', {
      scoreboard: scoreboard,
      gameType: currentGameType,
      gameEndedScoreboard: gameEndedScoreboard,
      gameStateScoreboard: $gameState?.scoreboard,
      gameEndedGameType: gameEndedGameType,
      gameStateGameType: $gameState?.gameType,
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
</script>

<svelte:head>
  <title>{t('host.display.title', { code: roomCode })} | {t('home.title')}</title>
</svelte:head>

{#if role === 'host-display'}
  <div class="display-screen">
    {#if !$connected}
      <div class="connection-status">
        <ChristmasLoading message={t('common.status.connecting') || 'Connecting...'} variant="connecting" size="large" />
      </div>
    {:else if currentState === undefined || currentState === null}
      <div class="loading-state">
        <ChristmasLoading message={t('common.status.loading') || 'Loading...'} size="large" />
      </div>
    {:else if currentState === GameState.LOBBY}
      <!-- Debug: Log before rendering HostLobbyDisplay -->
      {(() => {
        const playerNames = $players?.map(p => p?.name || '(no name)') || [];
        const playersWithNames = $players?.filter(p => p?.name && typeof p.name === 'string' && p.name.trim().length > 0) || [];
        
        console.log('[Display] 🔵 Rendering HostLobbyDisplay with players:', {
          length: $players?.length || 0,
          playersWithNames: playersWithNames.length,
          playerNames: playerNames,
          currentState: currentState,
          firstPlayer: $players?.[0] ? {
            id: $players[0].id?.substring(0, 8) || 'no-id',
            name: $players[0].name || '(no name)',
            hasName: !!($players[0].name && typeof $players[0].name === 'string'),
            avatar: $players[0].avatar || 'no-avatar'
          } : 'none',
        });
        
        if ($players && $players.length > 0 && playersWithNames.length !== $players.length) {
          console.warn('[Display] ⚠️ Some players missing names when rendering:', 
            $players.filter(p => !p?.name || typeof p.name !== 'string' || p.name.trim().length === 0)
          );
        }
        return '';
      })()}
      <HostLobbyDisplay {roomCode} players={$players} {joinUrl} />
    {:else if currentState === GameState.GAME_END}
      <div class="game-display-fullscreen">
        <HostLeaderboardDisplay {roomCode} {scoreboard} gameType={currentGameType} isHost={true} />
      </div>
    {:else if currentState === GameState.PAUSED}
      <!-- PAUSED state: Show game content with paused overlay -->
      <div class="game-display-fullscreen paused-display">
        <!-- Paused Overlay -->
        <div class="paused-overlay">
          <div class="paused-content">
            <div class="paused-icon">⏸️</div>
            <h1 class="paused-title">Game Paused</h1>
            <p class="paused-subtitle">The game is currently paused</p>
            <p class="paused-instruction">Use the control panel to resume</p>
          </div>
        </div>
        <!-- Show game content behind overlay (faded) -->
        <div class="paused-game-content">
          <HostGameDisplay {currentGameType} {currentState} {round} {maxRounds} {scoreboard} />
        </div>
        {#if scoreboard && scoreboard.length > 0}
          <HostBottomScorebar {scoreboard} />
        {/if}
      </div>
    {:else}
      <div class="game-display-fullscreen">
        <HostGameDisplay {currentGameType} {currentState} {round} {maxRounds} {scoreboard} />
      </div>
      {#if currentState === GameState.PLAYING || currentState === GameState.ROUND_END || currentState === GameState.STARTING}
        <HostBottomScorebar {scoreboard} />
      {/if}
    {/if}
  </div>
{/if}

{#if revealModalOpen && revealChallengeData}
  <GuessingRevealModal
    open={revealModalOpen}
    challenge={revealChallengeData}
    submissions={revealSubmissions}
    on:close={handleRevealModalClose}
  />
{/if}

<style>
  .display-screen {
    width: 100vw;
    height: 100vh;
    max-width: 100vw;
    max-height: 100vh;
    overflow: hidden;
    background: linear-gradient(135deg, #0a1a2e 0%, #1a2a4e 30%, #2a3a6e 60%, #1a2a4e 100%);
    background-image: 
      radial-gradient(circle at 20% 30%, rgba(255, 255, 255, 0.1) 0%, transparent 50%),
      radial-gradient(circle at 80% 70%, rgba(173, 216, 230, 0.15) 0%, transparent 50%);
    color: white;
    position: fixed;
    top: 0;
    left: 0;
    cursor: none;
    display: flex;
    flex-direction: column;
  }

  .game-display-fullscreen {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: clamp(0.5rem, 1vw, 1rem);
    overflow-y: auto;
    overflow-x: hidden;
  }

  .connection-status,
  .loading-state,
  .lobby-display {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 2rem;
  }

  .spinner {
    font-size: 4rem;
    margin-bottom: 1rem;
    animation: spin 2s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .lobby-title {
    font-size: clamp(3rem, 8vw, 6rem);
    font-weight: bold;
    color: #ffd700;
    text-shadow: 
      0 0 20px rgba(255, 215, 0, 0.8),
      0 0 40px rgba(255, 215, 0, 0.6),
      4px 4px 8px rgba(0, 0, 0, 0.5);
    margin-bottom: 2rem;
    letter-spacing: 8px;
    font-family: 'Courier New', monospace;
  }

  .lobby-subtitle {
    font-size: clamp(1.5rem, 3vw, 2.5rem);
    color: rgba(255, 255, 255, 0.9);
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
    margin-bottom: 3rem;
  }

  .player-count {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1.5rem 3rem;
    background: rgba(0, 0, 0, 0.4);
    border: 3px solid #ffd700;
    border-radius: 16px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4), 0 0 30px rgba(255, 215, 0, 0.3);
  }

  .count-icon {
    font-size: 3rem;
  }

  .count-text {
    font-size: clamp(2rem, 4vw, 3rem);
    font-weight: bold;
    color: #ffd700;
    text-shadow: 0 0 10px rgba(255, 215, 0, 0.8);
  }

  p {
    font-size: clamp(1.2rem, 2vw, 1.8rem);
    color: rgba(255, 255, 255, 0.8);
    text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.5);
  }

  /* Paused state styles */
  .paused-display {
    position: relative;
  }

  .paused-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(10px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    animation: fadeIn 0.3s ease-in;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .paused-content {
    text-align: center;
    padding: 3rem;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2rem;
    border: 3px solid rgba(255, 215, 0, 0.5);
    box-shadow: 
      0 10px 40px rgba(0, 0, 0, 0.5),
      0 0 30px rgba(255, 215, 0, 0.3);
    backdrop-filter: blur(20px);
  }

  .paused-icon {
    font-size: clamp(4rem, 10vw, 8rem);
    margin-bottom: 1rem;
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(1.1);
      opacity: 0.8;
    }
  }

  .paused-title {
    font-size: clamp(2.5rem, 6vw, 5rem);
    font-weight: 900;
    color: #ffd700;
    text-shadow: 
      0 0 20px rgba(255, 215, 0, 0.8),
      0 0 40px rgba(255, 215, 0, 0.6),
      4px 4px 8px rgba(0, 0, 0, 0.5);
    margin-bottom: 1rem;
    letter-spacing: 4px;
  }

  .paused-subtitle {
    font-size: clamp(1.5rem, 3vw, 2.5rem);
    color: rgba(255, 255, 255, 0.9);
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
    margin-bottom: 0.5rem;
  }

  .paused-instruction {
    font-size: clamp(1rem, 2vw, 1.5rem);
    color: rgba(255, 255, 255, 0.7);
    text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.5);
    margin-top: 1rem;
  }

  .paused-game-content {
    opacity: 0.3;
    filter: blur(2px);
    pointer-events: none;
  }
</style>

