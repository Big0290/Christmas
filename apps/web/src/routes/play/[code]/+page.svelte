<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { socket, connectSocket, gameState, connected } from '$lib/socket';
  import { GameType, GameState } from '@christmas/core';
  import ScoreAnimation from '$lib/components/ScoreAnimation.svelte';
  import NotificationToast from '$lib/components/NotificationToast.svelte';
  import { browser } from '$app/environment';
  
  import TriviaRoyale from '$lib/games/TriviaRoyale.svelte';
  import GiftGrabber from '$lib/games/GiftGrabber.svelte';
  import WorkshopTycoon from '$lib/games/WorkshopTycoon.svelte';
  import EmojiCarol from '$lib/games/EmojiCarol.svelte';
  import NaughtyOrNice from '$lib/games/NaughtyOrNice.svelte';
  import PriceIsRight from '$lib/games/PriceIsRight.svelte';
  import SessionLeaderboard from '$lib/components/SessionLeaderboard.svelte';

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

  onMount(() => {
    connectSocket();
    
    // Check connection status
    const unsubscribe = connected.subscribe((isConnected) => {
      isConnecting = !isConnected;
      if (!isConnected && $socket) {
        connectionError = true;
      } else {
        connectionError = false;
        
        // Load leaderboard ranks when connected
        if (isConnected && $socket) {
          setTimeout(() => {
            loadLeaderboardRanks();
          }, 500); // Wait a bit for socket to be ready
        }
        
        // Auto-reconnect if we have stored credentials
        if (isConnected && !hasAttemptedReconnect && browser) {
          const savedName = localStorage.getItem('christmas_playerName');
          const savedRoomCode = sessionStorage.getItem('christmas_roomCode');
          const previousPlayerId = sessionStorage.getItem('christmas_playerId');
          
          if (savedName && savedRoomCode && savedRoomCode === roomCode && $socket?.id) {
            // Attempt to reconnect with score recovery
            $socket.emit('reconnect_player', savedRoomCode, savedName, previousPlayerId, (response: any) => {
              if (response.success) {
                // Update stored player ID
                sessionStorage.setItem('christmas_playerId', $socket?.id || '');
                
                // Show reconnection message with score info
                let message = '✅ Reconnected!';
                if (response.restoredScore !== undefined && response.restoredScore > 0) {
                  message += ` Score restored: ${response.restoredScore} pts`;
                }
                notifications = [
                  ...notifications,
                  { id: notificationId++, message, type: 'success' },
                ];
                
                // Reload leaderboard ranks after reconnection
                loadLeaderboardRanks();
                
                // If game is in progress, restore player state
                if (response.room?.currentGame && $gameState) {
                  // Game state will be updated via socket events
                }
              } else {
                // Reconnection failed, try to join normally (new player)
                $socket.emit('join_room', savedRoomCode, savedName, (joinResponse: any) => {
                  if (joinResponse.success) {
                    sessionStorage.setItem('christmas_playerId', $socket?.id || '');
                    notifications = [
                      ...notifications,
                      { id: notificationId++, message: 'Joined as new player', type: 'info' },
                    ];
                    loadLeaderboardRanks();
                  }
                });
              }
            });
            hasAttemptedReconnect = true;
          }
        }
      }
    });

    return () => {
      unsubscribe();
    };
  });

  $: currentGame = $gameState?.gameType;
  $: playerScore = $gameState?.scores?.[$socket?.id] || 0;
  $: currentState = $gameState?.state;
  
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
          { id: notificationId++, message: '🎮 Game Starting!', type: 'info' },
        ];
      } else if (currentState === GameState.ROUND_END) {
        const roundNum = $gameState?.round || 0;
        notifications = [
          ...notifications,
          { id: notificationId++, message: `🎉 Round ${roundNum} Complete!`, type: 'success' },
        ];
      } else if (currentState === GameState.GAME_END) {
        notifications = [
          ...notifications,
          { id: notificationId++, message: '🏆 Game Over!', type: 'success' },
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
  <title>Playing in {roomCode} | Christmas Party Games</title>
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
        <div class="text-xs text-white/60">Room: {roomCode}</div>
        <div class="text-2xl font-bold score-display">🎄 {playerScore} pts</div>
        {#if currentState === GameState.GAME_END}
          {#if sessionRank > 0 || globalRank > 0}
            <div class="text-xs text-white/50 mt-1">
              {#if sessionRank > 0}
                Session: #{sessionRank}
              {/if}
              {#if globalRank > 0}
                {#if sessionRank > 0} • {/if}Global: #{globalRank}
              {/if}
            </div>
          {/if}
        {/if}
      </div>
      <div class="text-3xl">
        {$socket?.id ? '🟢' : '🔴'}
      </div>
    </div>
  </div>

  <!-- Game Content -->
  <div class="mobile-content">
    {#if connectionError}
      <div class="flex items-center justify-center h-full">
        <div class="text-center">
          <div class="text-6xl mb-4">⚠️</div>
          <h2 class="text-2xl font-bold mb-2">Connection Lost</h2>
          <p class="text-white/70 mb-4">
            Trying to reconnect...
          </p>
          <button on:click={() => { connectSocket(); connectionError = false; }} class="btn-primary">
            Retry Connection
          </button>
        </div>
      </div>
    {:else if isConnecting}
      <div class="flex items-center justify-center h-full">
        <div class="text-center">
          <div class="text-6xl mb-4 animate-spin">⏳</div>
          <h2 class="text-2xl font-bold mb-2">Connecting...</h2>
          <p class="text-white/70">
            Please wait
          </p>
        </div>
      </div>
    {:else if !currentGame}
      <div class="flex items-center justify-center h-full">
        <div class="text-center">
          <div class="text-6xl mb-4">⏳</div>
          <h2 class="text-2xl font-bold mb-2">Waiting to Start</h2>
          <p class="text-white/70">
            The host will start the game soon!
          </p>
        </div>
      </div>
    {:else if currentGame === GameType.TRIVIA_ROYALE}
      <TriviaRoyale />
    {:else if currentGame === GameType.GIFT_GRABBER}
      <GiftGrabber />
    {:else if currentGame === GameType.WORKSHOP_TYCOON}
      <WorkshopTycoon />
    {:else if currentGame === GameType.EMOJI_CAROL}
      <EmojiCarol />
    {:else if currentGame === GameType.NAUGHTY_OR_NICE}
      <NaughtyOrNice />
    {:else if currentGame === GameType.PRICE_IS_RIGHT}
      <PriceIsRight />
    {/if}
  </div>

  <!-- Final Leaderboard Modal (only shown at game end) -->
  {#if currentState === GameState.GAME_END && showFinalLeaderboard}
    <div class="leaderboard-overlay" on:click={() => showFinalLeaderboard = false}>
      <div class="leaderboard-modal" on:click|stopPropagation>
        <div class="leaderboard-modal-header">
          <h2 class="text-2xl font-bold text-christmas-gold">🏆 Final Results</h2>
          <button on:click={() => showFinalLeaderboard = false} class="close-modal-btn">✕</button>
        </div>
        <div class="leaderboard-modal-content">
          <SessionLeaderboard {roomCode} />
        </div>
        <div class="leaderboard-modal-footer">
          <button on:click={() => showFinalLeaderboard = false} class="btn-primary">
            Close
          </button>
        </div>
      </div>
    </div>
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
    padding: 1rem;
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
