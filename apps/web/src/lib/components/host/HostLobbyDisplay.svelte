<script lang="ts">
  import { onMount, onDestroy, beforeUpdate } from 'svelte';
  import { browser } from '$app/environment';
  import QRCode from 'qrcode';
  import type { Player } from '@christmas/core';
  import { t, language } from '$lib/i18n';
  import { colorScheme } from '$lib/theme';
  import ChristmasLoading from '$lib/components/ChristmasLoading.svelte';

  export let roomCode: string;
  export let players: Player[] = [];
  export let joinUrl: string = '';

  let qrCodeDataUrl = '';
  let previousPlayerIds = new Set<string>();
  let newPlayerIds = new Set<string>();
  let animationTimeoutIds = new Map<string, ReturnType<typeof setTimeout>>();

  // Make translations reactive by subscribing to language changes
  // Include $language in each reactive statement so Svelte knows to re-run when language changes
  $: loadingText = ($language && t('common.status.loading')) || 'Loading...';

  // Debug: Log when players prop changes
  // CRITICAL: This reactive statement ensures component updates when players prop changes
  $: {
    // Ensure players is always an array (defensive check)
    const playersArray = Array.isArray(players) ? players : [];
    const playerNames = playersArray.map(p => p?.name || '(no name)');
    const playersWithNames = playersArray.filter(p => p?.name && typeof p.name === 'string' && p.name.trim().length > 0);
    
    console.log('[HostLobbyDisplay] 🔵 Players prop updated:', {
      length: playersArray.length,
      playersWithNames: playersWithNames.length,
      isArray: Array.isArray(players),
      playerNames: playerNames,
      firstPlayer: playersArray[0] ? {
        id: playersArray[0].id?.substring(0, 8) || 'no-id',
        name: playersArray[0].name || '(no name)',
        hasName: !!(playersArray[0].name && typeof playersArray[0].name === 'string'),
        avatar: playersArray[0].avatar || 'no-avatar'
      } : 'none',
      allPlayers: playersArray.map(p => ({
        id: p?.id?.substring(0, 8) || 'no-id',
        name: p?.name || '(no name)',
        hasName: !!(p?.name && typeof p?.name === 'string'),
        avatar: p?.avatar || 'no-avatar'
      }))
    });
    
    // Warn if any players are missing names
    const playersWithoutNames = playersArray.filter(p => !p?.name || typeof p.name !== 'string' || p.name.trim().length === 0);
    if (playersWithoutNames.length > 0) {
      console.warn('[HostLobbyDisplay] ⚠️ Some players are missing names:', playersWithoutNames);
    }
    
    // Force reactivity by creating a new reference if needed
    // This ensures the component re-renders when players change
    if (playersArray.length !== (previousPlayerIds?.size || 0)) {
      console.log(`[HostLobbyDisplay] 🔄 Player count changed: ${previousPlayerIds?.size || 0} → ${playersArray.length}`);
    }
  }

  // Generate join URL if not provided
  $: if (browser && !joinUrl) {
    joinUrl = `${window.location.origin}/join?code=${roomCode}`;
  }

  // CRITICAL: Capture previous player IDs BEFORE the update happens
  // This ensures we can detect new players when room_update replaces the entire array
  beforeUpdate(() => {
    if (players && players.length > 0) {
      // Store current player IDs as "previous" before the update
      // This will be compared against the new players array after update
      previousPlayerIds = new Set(players.map(p => p.id));
    }
  });

  // Track new players for animation - runs AFTER beforeUpdate captures previous state
  $: {
    if (players && players.length > 0) {
      const currentPlayerIds = new Set(players.map(p => p.id));
      
      // Clear old animation timeouts for players that are no longer new
      newPlayerIds.forEach(id => {
        if (!currentPlayerIds.has(id)) {
          const timeoutId = animationTimeoutIds.get(id);
          if (timeoutId) {
            clearTimeout(timeoutId);
            animationTimeoutIds.delete(id);
          }
        }
      });
      
      // Find newly joined players by comparing current with previous
      const newlyJoined: string[] = [];
      currentPlayerIds.forEach(id => {
        if (!previousPlayerIds.has(id)) {
          newlyJoined.push(id);
          newPlayerIds.add(id);
          
          // Set a timeout to remove the new-player class after animation completes
          // This prevents the animation from retriggering on subsequent updates
          const timeoutId = setTimeout(() => {
            newPlayerIds.delete(id);
            animationTimeoutIds.delete(id);
            // Force reactivity update
            newPlayerIds = new Set(newPlayerIds);
          }, 1000); // Animation duration is 0.8s, give it 1s to be safe
          
          animationTimeoutIds.set(id, timeoutId);
          
          console.log(`[HostLobbyDisplay] 🎉 New player detected: ${id.substring(0, 8)}, total new: ${newlyJoined.length}`);
        }
      });
      
      if (newlyJoined.length > 0) {
        console.log(`[HostLobbyDisplay] ✨ ${newlyJoined.length} new player(s) joined, triggering animations`);
      }
      
      // Update previousPlayerIds for next comparison
      previousPlayerIds = new Set(currentPlayerIds);
    } else if (players.length === 0) {
      // Clear all when players list is empty
      newPlayerIds.clear();
      animationTimeoutIds.forEach(timeoutId => clearTimeout(timeoutId));
      animationTimeoutIds.clear();
      previousPlayerIds.clear();
    }
  }

  onMount(async () => {
    if (browser && joinUrl) {
      try {
        // Generate larger QR code for projector display
        qrCodeDataUrl = await QRCode.toDataURL(joinUrl, {
          width: 600,
          margin: 3,
          color: { dark: '#c41e3a', light: '#ffffff' },
        });
      } catch (error) {
        console.error('[HostLobbyDisplay] Error generating QR code:', error);
      }
    }
    
    // Initialize previousPlayerIds with current players
    if (players && players.length > 0) {
      previousPlayerIds = new Set(players.map(p => p.id));
    }
    
    // Listen for player_joined_animation events to trigger animations immediately
    // This ensures animations trigger even when player_joined happens before room_update
    const handlePlayerJoinedAnimation = (event: CustomEvent<{ player: Player; playerId: string }>) => {
      const { playerId } = event.detail;
      if (playerId && !newPlayerIds.has(playerId)) {
        console.log(`[HostLobbyDisplay] 🎉 Player joined animation triggered for: ${playerId.substring(0, 8)}`);
        newPlayerIds.add(playerId);
        
        // Set a timeout to remove the new-player class after animation completes
        const timeoutId = setTimeout(() => {
          newPlayerIds.delete(playerId);
          animationTimeoutIds.delete(playerId);
          // Force reactivity update
          newPlayerIds = new Set(newPlayerIds);
        }, 1000);
        
        animationTimeoutIds.set(playerId, timeoutId);
        // Force reactivity update
        newPlayerIds = new Set(newPlayerIds);
      }
    };
    
    if (browser) {
      window.addEventListener('player_joined_animation', handlePlayerJoinedAnimation as EventListener);
    }
    
    // Return cleanup function
    return () => {
      if (browser) {
        window.removeEventListener('player_joined_animation', handlePlayerJoinedAnimation as EventListener);
      }
    };
  });

  onDestroy(() => {
    // Clean up all animation timeouts
    animationTimeoutIds.forEach(timeoutId => clearTimeout(timeoutId));
    animationTimeoutIds.clear();
    
    // Remove event listener
    if (browser) {
      window.removeEventListener('player_joined_animation', () => {});
    }
  });

  // Regenerate QR code if joinUrl changes
  $: if (browser && joinUrl && !qrCodeDataUrl) {
    QRCode.toDataURL(joinUrl, {
      width: 600,
      margin: 3,
      color: { dark: '#c41e3a', light: '#ffffff' },
    }).then((dataUrl) => {
      qrCodeDataUrl = dataUrl;
    }).catch((error) => {
      console.error('[HostLobbyDisplay] Error generating QR code:', error);
    });
  }
</script>

<div class="lobby-display" data-theme={$colorScheme}>
  <!-- Background decorations -->
  <div class="lobby-background">
    <div class="snowflakes" aria-hidden="true">
      {#each Array(50) as _}
        <div class="snowflake">❄</div>
      {/each}
    </div>
  </div>

  <div class="lobby-content">
    <!-- Header -->
    <div class="lobby-header">
      <h1 class="lobby-title">
        <span class="title-icon">🎄</span>
        <span class="title-text">{roomCode}</span>
        <span class="title-icon">🎄</span>
      </h1>
      <p class="lobby-subtitle">
        <span class="subtitle-bilingual">
          <span class="subtitle-french">Scannez le code QR pour rejoindre</span>
          <span class="subtitle-english">Scan QR Code to Join</span>
        </span>
      </p>
    </div>

    <!-- Main Content Grid -->
    <div class="lobby-grid">
      <!-- Left: QR Code -->
      <div class="qr-section">
        <div class="qr-container">
          {#if qrCodeDataUrl}
            <div class="qr-code-wrapper">
              <img src={qrCodeDataUrl} alt="QR Code" class="qr-code-image" />
            </div>
          {:else}
            <div class="qr-loading">
              <ChristmasLoading message={loadingText} size="medium" />
            </div>
          {/if}
        </div>
        <div class="join-url-section">
          <p class="url-label">
            <span class="label-bilingual">
              <span class="label-french">Ou visitez :</span>
              <span class="label-english">Or visit:</span>
            </span>
          </p>
          <div class="url-display">
            <code class="url-text">{joinUrl}</code>
          </div>
        </div>
      </div>

      <!-- Right: Player List -->
      <div class="players-section">
        <div class="players-header">
          <h2 class="players-title">
            <span class="players-icon">👥</span>
            <span class="players-count">{players ? players.length : 0}</span>
            <span class="players-label">
              <span class="label-bilingual">
                <span class="label-french">Joueurs</span>
                <span class="label-english">Players</span>
              </span>
            </span>
          </h2>
        </div>
        
        <div class="players-list-container">
          {#if !players || !Array.isArray(players) || players.length === 0}
            <div class="empty-players">
              <div class="empty-icon">🎅</div>
              <p class="empty-text">
                <span class="text-bilingual">
                  <span class="text-french">En attente de joueurs...</span>
                  <span class="text-english">Waiting for players...</span>
                </span>
              </p>
              <p class="empty-hint">
                <span class="hint-bilingual">
                  <span class="hint-french">Scannez le code QR pour rejoindre !</span>
                  <span class="hint-english">Scan the QR code to join!</span>
                </span>
              </p>
            </div>
          {:else}
            <div class="players-list">
              {#each (Array.isArray(players) ? players : []) as player, index (player.id)}
                {@const playerName = player?.name && typeof player.name === 'string' && player.name.trim().length > 0 ? player.name : `Player ${index + 1}`}
                <div 
                  class="player-card"
                  class:new-player={newPlayerIds.has(player.id)}
                  style="animation-delay: {index * 0.1}s"
                >
                  <div class="player-avatar-large">{player?.avatar || '🎄'}</div>
                  <div class="player-info">
                    <div class="player-name">{playerName}</div>
                    {#if player?.score !== undefined && player.score > 0}
                      <div class="player-score">⭐ {player.score}</div>
                    {/if}
                  </div>
                  <div class="player-badge">
                    {#if index === 0}
                      🥇
                    {:else if index === 1}
                      🥈
                    {:else if index === 2}
                      🥉
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .lobby-display {
    width: 100vw;
    height: 100vh;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: linear-gradient(135deg, var(--christmas-red) 0%, var(--christmas-green) 50%, #0f3460 100%);
    transition: background 0.5s ease;
  }

  /* Theme variants */
  .lobby-display[data-theme="traditional"] {
    background: linear-gradient(135deg, var(--christmas-red) 0%, var(--christmas-green) 50%, var(--evergreen) 100%);
  }

  .lobby-display[data-theme="winter"] {
    background: linear-gradient(135deg, var(--twilight-blue) 0%, var(--winter-blue) 50%, var(--ice-blue) 100%);
  }

  .lobby-display[data-theme="mixed"] {
    background: linear-gradient(135deg, var(--christmas-red) 0%, var(--winter-blue) 30%, var(--christmas-green) 60%, var(--ice-blue) 100%);
  }

  .lobby-background {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    pointer-events: none;
    z-index: 0;
  }

  .snowflakes {
    position: absolute;
    width: 100%;
    height: 100%;
  }

  .snowflake {
    position: absolute;
    color: rgba(255, 255, 255, 0.8);
    font-size: 1.5em;
    animation: fall linear infinite;
    animation-duration: var(--fall-duration, 10s);
    animation-delay: var(--fall-delay, 0s);
    left: var(--left, 0%);
  }

  @keyframes fall {
    0% {
      transform: translateY(-100vh) rotate(0deg);
      opacity: 1;
    }
    100% {
      transform: translateY(100vh) rotate(360deg);
      opacity: 0;
    }
  }

  .lobby-content {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 1600px;
    padding: 2rem;
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .lobby-header {
    text-align: center;
    margin-bottom: 1rem;
  }

  .lobby-title {
    font-size: clamp(3rem, 8vw, 6rem);
    font-weight: 900;
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    color: var(--christmas-gold);
    text-shadow: 
      0 0 10px rgba(255, 215, 0, 0.5),
      0 0 20px rgba(255, 215, 0, 0.3),
      0 4px 8px rgba(0, 0, 0, 0.3);
    animation: glow 2s ease-in-out infinite alternate;
  }

  @keyframes glow {
    from {
      text-shadow: 
        0 0 10px rgba(255, 215, 0, 0.5),
        0 0 20px rgba(255, 215, 0, 0.3),
        0 4px 8px rgba(0, 0, 0, 0.3);
    }
    to {
      text-shadow: 
        0 0 20px rgba(255, 215, 0, 0.8),
        0 0 30px rgba(255, 215, 0, 0.5),
        0 0 40px rgba(255, 215, 0, 0.3),
        0 4px 8px rgba(0, 0, 0, 0.3);
    }
  }

  .title-icon {
    animation: bounce 2s ease-in-out infinite;
  }

  .title-icon:last-child {
    animation-delay: 1s;
  }

  @keyframes bounce {
    0%, 100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-10px);
    }
  }

  .title-text {
    letter-spacing: 0.2em;
    font-family: 'Courier New', monospace;
  }

  .lobby-subtitle {
    font-size: clamp(1.2rem, 3vw, 2rem);
    color: rgba(255, 255, 255, 0.9);
    margin-top: 1rem;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  }

  /* Bilingual text structure */
  .subtitle-bilingual,
  .label-bilingual,
  .text-bilingual,
  .hint-bilingual {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .subtitle-french,
  .label-french,
  .text-french,
  .hint-french {
    font-size: 0.9em;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
  }

  .subtitle-english,
  .label-english,
  .text-english,
  .hint-english {
    font-size: 1em;
    font-weight: bold;
    color: rgba(255, 255, 255, 0.95);
  }

  .lobby-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3rem;
    align-items: start;
  }

  @media (max-width: 1024px) {
    .lobby-grid {
      grid-template-columns: 1fr;
      gap: 2rem;
    }
  }

  /* QR Code Section */
  .qr-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2rem;
  }

  .qr-container {
    background: rgba(255, 255, 255, 0.95);
    padding: 2rem;
    border-radius: 2rem;
    box-shadow: 
      0 10px 40px rgba(0, 0, 0, 0.3),
      0 0 20px rgba(255, 215, 0, 0.2);
    backdrop-filter: blur(10px);
  }

  .qr-code-wrapper {
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .qr-code-image {
    width: 100%;
    max-width: 500px;
    height: auto;
    border-radius: 1rem;
  }

  .qr-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 3rem;
    min-width: 300px;
    min-height: 300px;
  }

  .spinner {
    font-size: 3rem;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .join-url-section {
    text-align: center;
    width: 100%;
  }

  .url-label {
    font-size: clamp(1rem, 2vw, 1.5rem);
    color: rgba(255, 255, 255, 0.9);
    margin-bottom: 0.5rem;
    font-weight: 600;
  }

  .url-display {
    background: rgba(0, 0, 0, 0.3);
    padding: 1rem;
    border-radius: 0.5rem;
    backdrop-filter: blur(10px);
  }

  .url-text {
    font-size: clamp(0.9rem, 1.5vw, 1.2rem);
    color: var(--christmas-gold);
    word-break: break-all;
    font-family: 'Courier New', monospace;
  }

  /* Players Section */
  .players-section {
    display: flex;
    flex-direction: column;
    height: 100%;
    max-height: 70vh;
  }

  .players-header {
    text-align: center;
    margin-bottom: 1.5rem;
  }

  .players-title {
    font-size: clamp(2rem, 4vw, 3.5rem);
    font-weight: 800;
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    color: var(--christmas-gold);
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  }

  .players-icon {
    font-size: 1.2em;
  }

  .players-count {
    color: var(--christmas-gold);
    font-weight: 900;
  }

  .players-list-container {
    flex: 1;
    overflow-y: auto;
    padding-right: 0.5rem;
  }

  .players-list-container::-webkit-scrollbar {
    width: 8px;
  }

  .players-list-container::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
  }

  .players-list-container::-webkit-scrollbar-thumb {
    background: var(--christmas-gold);
    border-radius: 4px;
  }

  .players-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .player-card {
    background: rgba(255, 255, 255, 0.15);
    backdrop-filter: blur(10px);
    border: 2px solid rgba(255, 215, 0, 0.3);
    border-radius: 1rem;
    padding: 1.5rem;
    display: flex;
    align-items: center;
    gap: 1.5rem;
    transition: all 0.3s ease;
    animation: slideIn 0.5s ease-out;
    opacity: 0;
    animation-fill-mode: forwards;
  }

  .player-card:hover {
    background: rgba(255, 255, 255, 0.25);
    border-color: var(--christmas-gold);
    transform: translateX(5px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }

  .player-card.new-player {
    animation: playerJoin 0.8s ease-out;
    border-color: var(--christmas-gold);
    box-shadow: 0 0 20px rgba(255, 215, 0, 0.5);
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateX(-20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @keyframes playerJoin {
    0% {
      opacity: 0;
      transform: scale(0.8) translateX(-50px);
      box-shadow: 0 0 0 rgba(255, 215, 0, 0);
    }
    50% {
      transform: scale(1.05) translateX(0);
      box-shadow: 0 0 30px rgba(255, 215, 0, 0.8);
    }
    100% {
      opacity: 1;
      transform: scale(1) translateX(0);
      box-shadow: 0 0 20px rgba(255, 215, 0, 0.5);
    }
  }

  .player-avatar-large {
    font-size: clamp(2.5rem, 5vw, 4rem);
    flex-shrink: 0;
    animation: bounce 2s ease-in-out infinite;
  }

  .player-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .player-name {
    font-size: clamp(1.2rem, 2.5vw, 2rem);
    font-weight: 700;
    color: white;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  }

  .player-score {
    font-size: clamp(1rem, 2vw, 1.5rem);
    color: var(--christmas-gold);
    font-weight: 600;
  }

  .player-badge {
    font-size: clamp(1.5rem, 3vw, 2.5rem);
    flex-shrink: 0;
  }

  .empty-players {
    text-align: center;
    padding: 4rem 2rem;
    color: rgba(255, 255, 255, 0.8);
  }

  .empty-icon {
    font-size: 5rem;
    margin-bottom: 1rem;
    animation: bounce 2s ease-in-out infinite;
  }

  .empty-text {
    font-size: clamp(1.5rem, 3vw, 2.5rem);
    font-weight: 600;
    margin-bottom: 0.5rem;
  }

  .empty-hint {
    font-size: clamp(1rem, 2vw, 1.5rem);
    color: rgba(255, 255, 255, 0.7);
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    .lobby-content {
      padding: 1rem;
    }

    .lobby-grid {
      gap: 1.5rem;
    }

    .qr-container {
      padding: 1.5rem;
    }

    .player-card {
      padding: 1rem;
      gap: 1rem;
    }
  }
</style>

