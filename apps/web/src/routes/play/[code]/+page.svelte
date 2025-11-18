<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { socket, connectSocket, gameState, connected } from '$lib/socket';
  import { GameType, GameState } from '@christmas/core';
  import ScoreAnimation from '$lib/components/ScoreAnimation.svelte';
  import NotificationToast from '$lib/components/NotificationToast.svelte';
  import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
  import { browser } from '$app/environment';
  import { t } from '$lib/i18n';
  import { language } from '$lib/i18n';
  
  import TriviaRoyale from '$lib/games/TriviaRoyale.svelte';
  import EmojiCarol from '$lib/games/EmojiCarol.svelte';
  import NaughtyOrNice from '$lib/games/NaughtyOrNice.svelte';
  import PriceIsRight from '$lib/games/PriceIsRight.svelte';
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

  function loadLeaderboardRanks() {
    if (!$socket || !browser) return;
    
    const playerName = localStorage.getItem('christmas_playerName');
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
        sessionStorage.setItem('christmas_playerId', $socket?.id || '');
        
        // Show reconnection message with score info
        let message = `✅ ${t('notifications.reconnected')}`;
        if (response.restoredScore !== undefined && response.restoredScore > 0) {
          message += ` ${t('notifications.scoreRestored', { score: response.restoredScore })}`;
        }
        notifications = [
          ...notifications,
          { id: notificationId++, message, type: 'success' },
        ];
        
        // Reload leaderboard ranks after reconnection
        loadLeaderboardRanks();
        
        // Game state will be sent via game_state_update event
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
          // Max attempts reached
          connectionError = true;
          notifications = [
            ...notifications,
            { id: notificationId++, message: t('notifications.reconnectionError', { error: errorMsg }), type: 'error' },
          ];
        }
      }
    });
  }

  onMount(() => {
    connectSocket();
    
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
        // Reset reconnection state on disconnect
        isReconnecting = false;
        reconnectAttempts = 0;
      });

      $socket.on('reconnect', () => {
        console.log('[Player] Socket reconnected');
        // Attempt reconnection when socket reconnects
        if (browser) {
          const savedRoomCode = localStorage.getItem('christmas_roomCode');
          const playerToken = localStorage.getItem('christmas_playerToken');
          
          if (savedRoomCode === roomCode && playerToken && !isReconnecting) {
            // Reset flags to allow reconnection attempt
            hasAttemptedReconnect = false;
            reconnectAttempts = 0;
            attemptReconnection(savedRoomCode, playerToken);
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
        gameState.set(data);
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
        const savedRoomCode = localStorage.getItem('christmas_roomCode');
        const playerToken = localStorage.getItem('christmas_playerToken');
        const playerName = localStorage.getItem('christmas_playerName');
        
        if (playerToken && savedRoomCode === roomCode && $socket?.id) {
          // Attempt to reconnect player with token
          attemptReconnection(savedRoomCode, playerToken);
        } else if (playerName && savedRoomCode === roomCode) {
          // No token - might be first time entering after joining
          // Wait a moment to see if we receive room_update or game_state_update events
          hasAttemptedReconnect = true;
          setTimeout(() => {
            // If we don't receive any updates within 2 seconds, show error
            const timeout = setTimeout(() => {
              if (!$gameState && !connectionError) {
                connectionError = true;
                notifications = [
                  ...notifications,
                  { id: notificationId++, message: t('player.errors.notConnected'), type: 'error' },
                ];
              }
            }, 2000);
            
            // Clear timeout if we get room_update or game_state_update
            const roomUpdateHandler = () => {
              clearTimeout(timeout);
              if ($socket) {
                $socket.off('room_update', roomUpdateHandler);
                $socket.off('game_state_update', gameStateHandler);
              }
            };
            const gameStateHandler = () => {
              clearTimeout(timeout);
              if ($socket) {
                $socket.off('room_update', roomUpdateHandler);
                $socket.off('game_state_update', gameStateHandler);
              }
            };
            if ($socket) {
              $socket.on('room_update', roomUpdateHandler);
              $socket.on('game_state_update', gameStateHandler);
            }
          }, 500);
        } else {
          // No saved credentials - might be direct navigation
          connectionError = true;
          notifications = [
            ...notifications,
            { id: notificationId++, message: t('player.errors.pleaseRejoin'), type: 'error' },
          ];
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

  $: currentGame = $gameState?.gameType;
  $: playerScore = $gameState?.scores?.[$socket?.id] || 0;
  $: currentState = $gameState?.state;

  // Log game state changes for debugging
  $: if (currentState !== previousState) {
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
          <div class="flex gap-2 justify-center">
            <button on:click={() => { connectSocket(); connectionError = false; }} class="btn-primary">
              {t('player.connection.retry')}
            </button>
            <button on:click={() => {
              if (browser && $socket) {
                const savedRoomCode = localStorage.getItem('christmas_roomCode');
                const token = localStorage.getItem('christmas_playerToken');
                if (savedRoomCode === roomCode && token) {
                  // Reset reconnection state and attempt reconnection
                  hasAttemptedReconnect = false;
                  reconnectAttempts = 0;
                  isReconnecting = false;
                  attemptReconnection(savedRoomCode, token);
                } else {
                  notifications = [
                    ...notifications,
                    { id: notificationId++, message: t('player.errors.noCredentials'), type: 'error' },
                  ];
                }
              }
            }} class="btn-secondary">
              {t('player.connection.reconnectNow')}
            </button>
          </div>
        </div>
      </div>
    {:else if isConnecting}
      <div class="flex items-center justify-center h-full">
        <div class="text-center">
          <div class="text-6xl mb-4 animate-spin">⏳</div>
          <h2 class="text-2xl font-bold mb-2">{t('player.connection.connecting')}</h2>
          <p class="text-white/70">
            {t('player.connection.pleaseWait')}
          </p>
        </div>
      </div>
    {:else if !currentGame}
      <div class="flex items-center justify-center h-full">
        <div class="text-center">
          <div class="text-6xl mb-4">⏳</div>
          <h2 class="text-2xl font-bold mb-2">{t('player.connection.waitingStart')}</h2>
          <p class="text-white/70">
            {t('player.connection.hostWillStart')}
          </p>
        </div>
      </div>
    {:else if currentGame === GameType.TRIVIA_ROYALE}
      <TriviaRoyale />
    {:else if currentGame === GameType.EMOJI_CAROL}
      <EmojiCarol />
    {:else if currentGame === GameType.NAUGHTY_OR_NICE}
      <NaughtyOrNice />
    {:else if currentGame === GameType.PRICE_IS_RIGHT}
      <PriceIsRight />
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
    background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
    padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  }

  .mobile-header {
    padding: 1rem;
    background: rgba(0, 0, 0, 0.3);
    border-bottom: 2px solid rgba(255, 215, 0, 0.3);
    position: relative;
  }

  .score-display {
    transition: transform 0.2s;
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

  .leaderboard-modal-footer {
    display: flex;
    justify-content: center;
  }
</style>
