<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { getAudioManager, type RepeatMode } from '$lib/audio';
  import { discoverBackgroundMusicTracks, clearTrackCache, type Track } from '$lib/utils/audio-discovery';
  import { socket } from '$lib/socket';
  import AudioVisualizer from './AudioVisualizer.svelte';
  import ChristmasVisualizer from './ChristmasVisualizer.svelte';
  import { get } from 'svelte/store';
  import { t } from '$lib/i18n';

  export let roomCode: string;
  export let isHost: boolean = false;

  let tracks: Track[] = [];
  let currentTrackIndex = -1; // Start with -1 to show "no track" until one is selected
  let isPlaying = false;
  let shuffleEnabled = false;
  let repeatMode: RepeatMode = 'all';
  let volume = 0.3;
  let progress = 0;
  let duration = 0;
  let minimized = false;
  let showPlaylist = false; // Start with playlist collapsed for compactness
  let progressUpdating = false;
  let showVisualizer = false;

  let progressInterval: number | null = null;
  let jukeboxStateHandler: ((e: CustomEvent) => void) | null = null;
  let visualizerKey = 0; // Force visualizer to restart when tracks change
  let refreshing = false;
  let tracksLoaded = false; // Track if tracks have been loaded
  let pendingState: { currentTrack: number; isPlaying: boolean; shuffle: boolean; repeat: 'none' | 'one' | 'all'; volume: number } | null = null; // Queue state updates until tracks are loaded

  async function loadTracks() {
    if (!browser || refreshing) return;
    
    try {
      refreshing = true;
      tracksLoaded = false;
      // Clear cache and discover tracks
      clearTrackCache();
      const newTracks = await discoverBackgroundMusicTracks();
      
      // Only update if we got tracks
      if (newTracks && newTracks.length > 0) {
        tracks = newTracks;
        
        // Set playlist in audio manager
        const audioManager = getAudioManager();
        audioManager.setPlaylist(tracks);

        // Mark tracks as loaded
        tracksLoaded = true;

        // Sync current track index from audio manager immediately
        const managerTrack = audioManager.getCurrentTrack();
        if (managerTrack) {
          const foundIndex = tracks.findIndex(t => t.path === managerTrack.path);
          if (foundIndex >= 0) {
            currentTrackIndex = foundIndex;
          }
        } else {
          // If no track is playing, reset to -1 to show "no track" message
          currentTrackIndex = -1;
        }

        // Sync initial state
        if (isHost && tracks.length > 0) {
          syncToServer();
        }
        
        // Process any pending state update
        if (pendingState) {
          syncToState(pendingState);
          pendingState = null;
        }
        
        console.log(`[Jukebox] Loaded ${tracks.length} tracks`);
      } else {
        console.warn('[Jukebox] No tracks found after refresh. Make sure files are in /static/audio/background-music/');
        // Even if no tracks, mark as loaded to prevent infinite waiting
        tracksLoaded = true;
      }
    } catch (error) {
      console.error('[Jukebox] Error loading tracks:', error);
      tracksLoaded = true; // Mark as loaded even on error to prevent blocking
    } finally {
      refreshing = false;
    }
  }

  onMount(async () => {
    if (!browser) return;

    // Load tracks
    await loadTracks();

    // Listen for jukebox state updates from server
    jukeboxStateHandler = (e: CustomEvent) => {
      const state = e.detail;
      syncToState(state);
    };
    window.addEventListener('jukebox_state_update', jukeboxStateHandler as EventListener);

    // Start progress tracking
    startProgressTracking();
  });

  onDestroy(() => {
    if (progressInterval !== null) {
      clearInterval(progressInterval);
    }
    if (jukeboxStateHandler) {
      window.removeEventListener('jukebox_state_update', jukeboxStateHandler as EventListener);
    }
  });

  function startProgressTracking() {
    if (progressInterval !== null) {
      clearInterval(progressInterval);
    }

    progressInterval = window.setInterval(() => {
      if (!browser) return;
      const audioManager = getAudioManager();
      progress = audioManager.getProgress();
      duration = audioManager.getDuration();
      isPlaying = audioManager.getIsPlaying();
      
      // Sync current track from audio manager (handles shuffle correctly)
      const managerTrack = audioManager.getCurrentTrack();
      if (managerTrack && tracks.length > 0) {
        const foundIndex = tracks.findIndex(t => t.path === managerTrack.path);
        if (foundIndex >= 0 && foundIndex !== currentTrackIndex) {
          currentTrackIndex = foundIndex;
        }
      }
    }, 100);
  }

  function syncToState(state: { currentTrack: number; isPlaying: boolean; shuffle: boolean; repeat: 'none' | 'one' | 'all'; volume: number }) {
    // If tracks aren't loaded yet, queue this state update
    if (!tracksLoaded || tracks.length === 0) {
      pendingState = state;
      console.log('[Jukebox] Tracks not loaded yet, queuing state update');
      return;
    }

    const audioManager = getAudioManager();
    
    // Update local state
    currentTrackIndex = state.currentTrack;
    isPlaying = state.isPlaying;
    shuffleEnabled = state.shuffle;
    repeatMode = state.repeat;
    volume = state.volume;

    // Sync audio manager settings
    audioManager.setMusicVolume(volume);
    audioManager.setRepeatMode(repeatMode);
    
    if (audioManager.getShuffleEnabled() !== shuffleEnabled) {
      audioManager.toggleShuffle();
    }

    // Process track changes - tracks are guaranteed to be loaded here
    if (currentTrackIndex >= 0 && currentTrackIndex < tracks.length) {
      const playlist = audioManager.getPlaylist();
      const currentTrack = audioManager.getCurrentTrack();
      const targetTrack = tracks[currentTrackIndex];
      
      // Play selected track if changed
      if (!currentTrack || currentTrack.path !== targetTrack.path) {
        try {
          audioManager.playTrack(currentTrackIndex);
          // Force visualizer to restart
          visualizerKey++;
        } catch (error) {
          console.error('[Jukebox] Error playing track:', error);
        }
      }
    }

    // Sync play/pause state - use direct play/pause instead of toggle
    const audioIsPlaying = audioManager.getIsPlaying();
    if (isPlaying && !audioIsPlaying) {
      // Server says playing but audio is paused - play directly
      audioManager.play().catch((error) => {
        console.error('[Jukebox] Error playing from sync:', error);
      });
    } else if (!isPlaying && audioIsPlaying) {
      // Server says paused but audio is playing - pause directly
      audioManager.pause();
    }
  }

  function syncToServer() {
    if (!isHost || !$socket) return;

    const audioManager = getAudioManager();
    const currentIndex = audioManager.getCurrentTrackIndex();
    
    $socket.emit('jukebox_control', roomCode, 'select', { trackIndex: currentIndex });
  }

  async function handlePlayPause() {
    if (!isHost) return;

    try {
      const audioManager = getAudioManager();
      const wasPlaying = audioManager.getIsPlaying();
      
      // Toggle play/pause and wait for it to complete
      await audioManager.togglePlayPause();
      
      // Update local state after audio manager state is confirmed
      isPlaying = audioManager.getIsPlaying();

      // Sync to server
      if ($socket) {
        $socket.emit('jukebox_control', roomCode, isPlaying ? 'play' : 'pause');
      }
    } catch (error) {
      console.error('[Jukebox] Error toggling play/pause:', error);
      // Update state even on error to reflect actual audio state
      const audioManager = getAudioManager();
      isPlaying = audioManager.getIsPlaying();
    }
  }

  function handleNext() {
    if (!isHost) return;
    if (tracks.length === 0) {
      console.warn('[Jukebox] No tracks available for next');
      return;
    }

    try {
      const audioManager = getAudioManager();
      audioManager.nextTrack();
      currentTrackIndex = audioManager.getCurrentTrackIndex();

      if ($socket) {
        $socket.emit('jukebox_control', roomCode, 'next', { maxTracks: tracks.length });
      }
    } catch (error) {
      console.error('[Jukebox] Error going to next track:', error);
    }
  }

  function handlePrevious() {
    if (!isHost) return;
    if (tracks.length === 0) {
      console.warn('[Jukebox] No tracks available for previous');
      return;
    }

    try {
      const audioManager = getAudioManager();
      audioManager.previousTrack();
      currentTrackIndex = audioManager.getCurrentTrackIndex();

      if ($socket) {
        $socket.emit('jukebox_control', roomCode, 'previous', { maxTracks: tracks.length });
      }
    } catch (error) {
      console.error('[Jukebox] Error going to previous track:', error);
    }
  }

  function handleStop() {
    if (!isHost) return;

    try {
      const audioManager = getAudioManager();
      audioManager.stopBackgroundMusic();
      isPlaying = false;

      if ($socket) {
        $socket.emit('jukebox_control', roomCode, 'pause');
      }
    } catch (error) {
      console.error('[Jukebox] Error stopping music:', error);
      // Update state even on error
      isPlaying = false;
    }
  }

  function handleShuffle() {
    if (!isHost) return;

    const audioManager = getAudioManager();
    audioManager.toggleShuffle();
    shuffleEnabled = audioManager.getShuffleEnabled();

    if ($socket) {
      $socket.emit('jukebox_control', roomCode, 'shuffle');
    }
  }

  function handleRepeat() {
    if (!isHost) return;

    const audioManager = getAudioManager();
    repeatMode = audioManager.toggleRepeat();

    if ($socket) {
      $socket.emit('jukebox_control', roomCode, 'repeat');
    }
  }

  function handleVolumeChange(e: Event) {
    if (!isHost) return;

    const target = e.target as HTMLInputElement;
    const newVolume = parseFloat(target.value);
    volume = newVolume;

    const audioManager = getAudioManager();
    audioManager.setMusicVolume(newVolume);

    if ($socket) {
      $socket.emit('jukebox_control', roomCode, 'volume', { volume: newVolume });
    }
  }

  function handleTrackSelect(index: number) {
    if (!isHost) return;
    if (index < 0 || index >= tracks.length) {
      console.error('[Jukebox] Invalid track index:', index);
      return;
    }

    try {
      const audioManager = getAudioManager();
      
      // Set the index immediately - this will update the UI right away
      currentTrackIndex = index;
      
      // Play the track - this will set the track in audio manager
      audioManager.playTrack(index);
      
      // Verify the audio manager has the correct track after a brief moment
      // Use setTimeout to allow playTrack to complete
      setTimeout(() => {
        const managerIndex = audioManager.getCurrentTrackIndex();
        const managerTrack = audioManager.getCurrentTrack();
        
        if (managerTrack) {
          // Find the track in our tracks array by path
          const foundIndex = tracks.findIndex(t => t.path === managerTrack.path);
          if (foundIndex >= 0 && foundIndex !== currentTrackIndex) {
            currentTrackIndex = foundIndex;
          }
        } else if (managerIndex >= 0 && managerIndex < tracks.length && managerIndex !== currentTrackIndex) {
          // Fallback to index if track object not available
          currentTrackIndex = managerIndex;
        }
      }, 50);
      
      visualizerKey++; // Force visualizer restart

      if ($socket) {
        $socket.emit('jukebox_control', roomCode, 'select', { trackIndex: index });
      }
    } catch (error) {
      console.error('[Jukebox] Error selecting track:', error);
      // On error, try to sync from audio manager
      const audioManager = getAudioManager();
      const managerTrack = audioManager.getCurrentTrack();
      if (managerTrack) {
        const foundIndex = tracks.findIndex(t => t.path === managerTrack.path);
        if (foundIndex >= 0) {
          currentTrackIndex = foundIndex;
        }
      }
    }
  }

  function handleProgressChange(e: Event) {
    if (!isHost) return;

    const target = e.target as HTMLInputElement;
    const newProgress = parseFloat(target.value);
    progress = newProgress;

    const audioManager = getAudioManager();
    audioManager.setProgress(newProgress);
  }

  function handleProgressMouseDown() {
    progressUpdating = true;
  }

  function handleProgressMouseUp() {
    progressUpdating = false;
  }

  function formatTime(seconds: number): string {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function getRepeatIcon(): string {
    switch (repeatMode) {
      case 'one': return '🔂';
      case 'all': return '🔁';
      default: return '➡️';
    }
  }

  // Get current track - sync from audio manager periodically via progress tracking
  // Don't use reactive statement here as it can interfere with direct index setting
  // The progress tracking interval will keep it in sync
  
  // Get current track - use the index directly from our tracks array
  // This will update immediately when currentTrackIndex changes
  const currentTrack = currentTrackIndex >= 0 && currentTrackIndex < tracks.length 
    ? tracks[currentTrackIndex] 
    : null;
</script>

<div class="jukebox-container" class:minimized>
  <div class="jukebox-header">
    <h3 class="jukebox-title">🎵 {t('jukebox.title')}</h3>
    <div class="jukebox-controls">
      {#if isHost && !minimized}
        <button 
          class="btn-refresh" 
          class:refreshing
          on:click={loadTracks} 
          disabled={refreshing}
          title={t('jukebox.refreshPlaylist')}
        >
          {refreshing ? '⏳' : '🔄'}
        </button>
      {/if}
      {#if !minimized && tracks.length > 0}
        <button 
          class="btn-visualizer" 
          on:click={() => showVisualizer = !showVisualizer}
          title={t('jukebox.showVisualizer')}
        >
          🎄
        </button>
      {/if}
      <button class="btn-minimize" on:click={() => minimized = !minimized} title={t('jukebox.minimize')}>
        {minimized ? '⬆️' : '⬇️'}
      </button>
    </div>
  </div>

  {#if !minimized}
    <div class="jukebox-content">
      <!-- Track Display -->
      <div class="track-display" class:no-track={!currentTrack}>
        <div class="track-name">{currentTrack?.displayName || t('jukebox.noTrack')}</div>
        {#if currentTrack}
          <div class="track-time">{formatTime(progress)} / {formatTime(duration)}</div>
        {:else}
          <div class="track-time no-track-time">--:-- / --:--</div>
        {/if}
      </div>

      <!-- Visualizer -->
      <div class="visualizer-container">
        {#key visualizerKey}
          <AudioVisualizer mode="bars" width={300} height={35} barCount={20} color="#c41e3a" />
        {/key}
      </div>

      <!-- Progress Bar -->
      <div class="progress-container">
        <input
          type="range"
          min="0"
          max={duration || 100}
          value={progress}
          on:input={handleProgressChange}
          on:mousedown={handleProgressMouseDown}
          on:mouseup={handleProgressMouseUp}
          disabled={!isHost || !duration}
          class="progress-bar"
        />
      </div>

      <!-- Control Buttons -->
      <div class="controls">
        <button
          class="btn-control"
          on:click={handleShuffle}
          disabled={!isHost}
          class:active={shuffleEnabled}
          title={t('jukebox.shuffle')}
        >
          🔀
        </button>
        <button
          class="btn-control"
          on:click={handlePrevious}
          disabled={!isHost}
          title={t('jukebox.previous')}
        >
          ⏮
        </button>
        <button
          class="btn-control btn-play"
          on:click={handlePlayPause}
          disabled={!isHost}
          title={isPlaying ? t('jukebox.pause') : t('jukebox.play')}
        >
          {isPlaying ? '⏸' : '▶️'}
        </button>
        <button
          class="btn-control"
          on:click={handleStop}
          disabled={!isHost}
          title={t('jukebox.stop')}
        >
          ⏹
        </button>
        <button
          class="btn-control"
          on:click={handleNext}
          disabled={!isHost}
          title={t('jukebox.next')}
        >
          ⏭
        </button>
        <button
          class="btn-control"
          on:click={handleRepeat}
          disabled={!isHost}
          class:active={repeatMode !== 'none'}
          title={t('jukebox.repeat', { mode: repeatMode })}
        >
          {getRepeatIcon()}
        </button>
      </div>

      <!-- Volume Control -->
      <div class="volume-container">
        <span class="volume-label">🔊</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          on:input={handleVolumeChange}
          disabled={!isHost}
          class="volume-slider"
        />
        <span class="volume-value">{Math.round(volume * 100)}%</span>
      </div>

      <!-- Playlist -->
      {#if showPlaylist && tracks.length > 0}
        <div class="playlist-container">
          <div class="playlist-header">
            <h4>{t('jukebox.playlist', { count: tracks.length })}</h4>
            <button class="btn-toggle" on:click={() => showPlaylist = !showPlaylist}>−</button>
          </div>
          <div class="playlist">
            {#each tracks as track, index}
              <div
                class="playlist-item"
                class:active={index === currentTrackIndex}
                on:click={() => handleTrackSelect(index)}
                role="button"
                tabindex="0"
                on:keydown={(e) => e.key === 'Enter' && handleTrackSelect(index)}
              >
                <span class="track-number">{index + 1}</span>
                <span class="track-title">{track.displayName}</span>
                {#if index === currentTrackIndex && isPlaying}
                  <span class="playing-indicator">♪</span>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {:else if tracks.length > 0}
        <div class="playlist-toggle">
          <button class="btn-toggle" on:click={() => showPlaylist = true}>
            📋 {t('jukebox.showPlaylist', { count: tracks.length })}
          </button>
        </div>
      {/if}
    </div>
  {/if}
</div>

<!-- Christmas Visualizer Overlay -->
<ChristmasVisualizer 
  show={showVisualizer} 
  {isPlaying} 
  {currentTrack}
  onClose={() => showVisualizer = false}
/>

<style>
  .jukebox-container {
    background: linear-gradient(135deg, 
      rgba(196, 30, 58, 0.3) 0%, 
      rgba(15, 134, 68, 0.3) 50%, 
      rgba(255, 215, 0, 0.2) 100%);
    border: 2px solid rgba(255, 215, 0, 0.5);
    border-radius: 16px;
    padding: 1rem;
    backdrop-filter: blur(20px);
    box-shadow: 
      0 8px 32px rgba(0, 0, 0, 0.5),
      0 0 20px rgba(255, 215, 0, 0.15),
      inset 0 1px 0 rgba(255, 255, 255, 0.15),
      inset 0 -1px 0 rgba(0, 0, 0, 0.2);
    transition: all 0.3s ease;
    position: relative;
    overflow: hidden;
  }
  
  .jukebox-container::after {
    content: '';
    position: absolute;
    top: -2px;
    left: -2px;
    right: -2px;
    bottom: -2px;
    background: linear-gradient(
      45deg,
      #C41E3A 0%,
      #FFD700 25%,
      #0F8644 50%,
      #FFD700 75%,
      #C41E3A 100%
    );
    background-size: 200% 200%;
    border-radius: 16px;
    z-index: -1;
    opacity: 0.6;
    animation: border-glow 3s ease infinite;
  }
  
  @keyframes border-glow {
    0%, 100% {
      background-position: 0% 50%;
      opacity: 0.5;
    }
    50% {
      background-position: 100% 50%;
      opacity: 0.8;
    }
  }

  .jukebox-container::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: 
      radial-gradient(circle at 20% 50%, rgba(255, 215, 0, 0.1) 0%, transparent 50%),
      radial-gradient(circle at 80% 50%, rgba(196, 30, 58, 0.1) 0%, transparent 50%);
    pointer-events: none;
    z-index: 0;
  }

  .jukebox-container > * {
    position: relative;
    z-index: 1;
  }

  .jukebox-container.minimized {
    padding: 0.4rem 0.75rem;
  }

  .jukebox-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .jukebox-title {
    font-size: 1.1rem;
    font-weight: 900;
    color: #ffd700;
    text-shadow: 
      0 0 12px rgba(255, 215, 0, 0.8),
      0 2px 4px rgba(0, 0, 0, 0.8),
      1px 1px 2px rgba(0, 0, 0, 0.9);
    margin: 0;
    letter-spacing: 0.5px;
    position: relative;
    animation: title-glow 2s ease-in-out infinite;
  }
  
  @keyframes title-glow {
    0%, 100% {
      text-shadow: 
        0 0 12px rgba(255, 215, 0, 0.8),
        0 2px 4px rgba(0, 0, 0, 0.8),
        1px 1px 2px rgba(0, 0, 0, 0.9);
    }
    50% {
      text-shadow: 
        0 0 20px rgba(255, 215, 0, 1),
        0 0 30px rgba(255, 215, 0, 0.6),
        0 2px 4px rgba(0, 0, 0, 0.8),
        1px 1px 2px rgba(0, 0, 0, 0.9);
    }
  }

  .jukebox-controls {
    display: flex;
    gap: 0.5rem;
  }

  .btn-minimize,
  .btn-refresh,
  .btn-visualizer {
    background: linear-gradient(135deg, 
      rgba(196, 30, 58, 0.3), 
      rgba(15, 134, 68, 0.3));
    border: 2px solid rgba(255, 215, 0, 0.5);
    border-radius: 12px;
    padding: 0.4rem 0.6rem;
    cursor: pointer;
    color: #ffd700;
    font-size: 0.95rem;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 
      0 3px 8px rgba(0, 0, 0, 0.3),
      0 0 8px rgba(255, 215, 0, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.15);
    position: relative;
    overflow: hidden;
  }

  .btn-minimize::before,
  .btn-refresh::before,
  .btn-visualizer::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0;
    height: 0;
    border-radius: 50%;
    background: rgba(255, 215, 0, 0.3);
    transform: translate(-50%, -50%);
    transition: width 0.4s, height 0.4s;
  }

  .btn-minimize:hover::before,
  .btn-refresh:hover::before,
  .btn-visualizer:hover::before {
    width: 200%;
    height: 200%;
  }

  .btn-minimize:hover,
  .btn-refresh:hover:not(:disabled),
  .btn-visualizer:hover {
    background: linear-gradient(135deg, 
      rgba(255, 215, 0, 0.4), 
      rgba(196, 30, 58, 0.3));
    border-color: #ffd700;
    transform: translateY(-2px) scale(1.08);
    box-shadow: 
      0 6px 16px rgba(255, 215, 0, 0.4),
      0 0 16px rgba(255, 215, 0, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.25);
    color: #fff;
  }

  .btn-refresh {
    margin-right: 0.4rem;
  }

  .btn-refresh.refreshing {
    animation: spin 1s linear infinite;
    opacity: 0.8;
  }

  .btn-refresh:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
  
  .btn-visualizer {
    margin-right: 0.4rem;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .jukebox-content {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .track-display {
    text-align: center;
    padding: 0.75rem 1rem;
    background: linear-gradient(135deg, 
      rgba(0, 0, 0, 0.4) 0%, 
      rgba(196, 30, 58, 0.15) 50%, 
      rgba(0, 0, 0, 0.4) 100%);
    border-radius: 12px;
    border: 2px solid rgba(255, 215, 0, 0.3);
    box-shadow: 
      inset 0 2px 4px rgba(0, 0, 0, 0.4),
      0 0 12px rgba(255, 215, 0, 0.1);
    position: relative;
    overflow: hidden;
  }
  
  .track-display::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, 
      transparent, 
      rgba(255, 215, 0, 0.1), 
      transparent);
    animation: shimmer 3s infinite;
  }
  
  @keyframes shimmer {
    0% { left: -100%; }
    100% { left: 100%; }
  }

  .track-name {
    font-size: 0.95rem;
    font-weight: 800;
    color: #ffd700;
    margin-bottom: 0.25rem;
    text-shadow: 
      0 0 10px rgba(255, 215, 0, 0.6),
      0 2px 4px rgba(0, 0, 0, 0.8),
      1px 1px 2px rgba(0, 0, 0, 0.9);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    letter-spacing: 0.5px;
    position: relative;
    z-index: 1;
  }
  
  .track-display.no-track .track-name {
    color: rgba(255, 255, 255, 0.6);
    text-shadow: 
      0 0 8px rgba(255, 255, 255, 0.3),
      0 2px 4px rgba(0, 0, 0, 0.8);
    font-style: italic;
    font-weight: 600;
  }

  .track-time {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.95);
    font-family: 'Courier New', monospace;
    font-weight: 700;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
    position: relative;
    z-index: 1;
  }
  
  .track-time.no-track-time {
    color: rgba(255, 255, 255, 0.4);
    opacity: 0.6;
  }

  .visualizer-container {
    width: 100%;
    height: 40px;
    margin: 0.25rem 0;
    padding: 0.5rem;
    background: linear-gradient(135deg, 
      rgba(0, 0, 0, 0.4) 0%, 
      rgba(196, 30, 58, 0.1) 50%, 
      rgba(0, 0, 0, 0.4) 100%);
    border-radius: 12px;
    border: 2px solid rgba(255, 215, 0, 0.3);
    box-shadow: 
      inset 0 2px 4px rgba(0, 0, 0, 0.3),
      0 0 8px rgba(255, 215, 0, 0.1);
    position: relative;
    overflow: hidden;
  }
  
  .visualizer-container::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(255, 215, 0, 0.05) 50%,
      transparent 100%
    );
    animation: visualizer-shimmer 2s ease-in-out infinite;
  }
  
  @keyframes visualizer-shimmer {
    0%, 100% { transform: translateX(-100%); }
    50% { transform: translateX(100%); }
  }

  .progress-container {
    width: 100%;
  }

  .progress-bar {
    width: 100%;
    height: 6px;
    border-radius: 3px;
    outline: none;
    cursor: pointer;
    background: transparent;
    -webkit-appearance: none;
    appearance: none;
  }
  
  /* WebKit track styling - Candy Cane */
  .progress-bar::-webkit-slider-runnable-track {
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background: repeating-linear-gradient(
      45deg,
      #C41E3A 0px,
      #C41E3A 8px,
      #ffffff 8px,
      #ffffff 16px
    );
    border: 1px solid rgba(255, 215, 0, 0.3);
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3);
  }
  
  /* Firefox track styling - Candy Cane */
  .progress-bar::-moz-range-track {
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background: repeating-linear-gradient(
      45deg,
      #C41E3A 0px,
      #C41E3A 8px,
      #ffffff 8px,
      #ffffff 16px
    );
    border: 1px solid rgba(255, 215, 0, 0.3);
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3);
  }

  .progress-bar::-webkit-slider-thumb {
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    /* Candy cane thumb with stripes */
    background: repeating-linear-gradient(
      45deg,
      #C41E3A 0px,
      #C41E3A 3px,
      #ffffff 3px,
      #ffffff 6px
    );
    cursor: pointer;
    border: 2px solid rgba(255, 255, 255, 0.9);
    box-shadow: 
      0 2px 6px rgba(196, 30, 58, 0.6),
      0 0 8px rgba(255, 255, 255, 0.4),
      inset 0 1px 2px rgba(255, 255, 255, 0.3);
    transition: all 0.2s;
  }

  .progress-bar::-webkit-slider-thumb:hover {
    transform: scale(1.15);
    box-shadow: 0 2px 8px rgba(255, 215, 0, 0.8), 0 0 10px rgba(255, 215, 0, 0.6);
  }

  .progress-bar::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    /* Candy cane thumb with stripes */
    background: repeating-linear-gradient(
      45deg,
      #C41E3A 0px,
      #C41E3A 3px,
      #ffffff 3px,
      #ffffff 6px
    );
    cursor: pointer;
    border: 2px solid rgba(255, 255, 255, 0.9);
    box-shadow: 
      0 2px 6px rgba(196, 30, 58, 0.6),
      0 0 8px rgba(255, 255, 255, 0.4),
      inset 0 1px 2px rgba(255, 255, 255, 0.3);
    transition: all 0.2s;
  }

  .progress-bar::-moz-range-thumb:hover {
    transform: scale(1.15);
    box-shadow: 0 2px 8px rgba(255, 215, 0, 0.8), 0 0 10px rgba(255, 215, 0, 0.6);
  }

  .controls {
    display: flex;
    justify-content: center;
    gap: 0.3rem;
    flex-wrap: wrap;
  }

  .btn-control {
    background: linear-gradient(135deg, rgba(196, 30, 58, 0.3), rgba(15, 134, 68, 0.3));
    border: 2px solid rgba(255, 215, 0, 0.5);
    border-radius: 14px;
    padding: 0.5rem 0.75rem;
    cursor: pointer;
    color: white;
    font-size: 1.1rem;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    min-width: 44px;
    box-shadow: 
      0 4px 12px rgba(0, 0, 0, 0.3),
      0 0 8px rgba(255, 215, 0, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.2);
    position: relative;
    overflow: hidden;
  }

  .btn-control::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
    transition: left 0.5s;
  }

  .btn-control:hover:not(:disabled)::before {
    left: 100%;
  }

  .btn-control:hover:not(:disabled) {
    background: linear-gradient(135deg, rgba(255, 215, 0, 0.4), rgba(196, 30, 58, 0.3));
    border-color: #ffd700;
    transform: translateY(-3px) scale(1.08);
    box-shadow: 
      0 8px 20px rgba(255, 215, 0, 0.4),
      0 0 20px rgba(255, 215, 0, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.3);
  }

  .btn-control:active:not(:disabled) {
    transform: translateY(-1px) scale(1.02);
    box-shadow: 
      0 4px 12px rgba(255, 215, 0, 0.3),
      0 0 12px rgba(255, 215, 0, 0.2);
  }

  .btn-control:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    filter: grayscale(0.6);
    transform: none;
  }

  .btn-control.active {
    background: linear-gradient(135deg, rgba(196, 30, 58, 0.7), rgba(196, 30, 58, 0.5));
    border-color: #c41e3a;
    box-shadow: 
      0 0 20px rgba(196, 30, 58, 0.6),
      0 4px 12px rgba(196, 30, 58, 0.4),
      inset 0 1px 0 rgba(255, 255, 255, 0.2);
    animation: active-pulse 2s ease-in-out infinite;
  }

  @keyframes active-pulse {
    0%, 100% {
      box-shadow: 
        0 0 20px rgba(196, 30, 58, 0.6),
        0 4px 12px rgba(196, 30, 58, 0.4),
        inset 0 1px 0 rgba(255, 255, 255, 0.2);
    }
    50% {
      box-shadow: 
        0 0 30px rgba(196, 30, 58, 0.8),
        0 6px 16px rgba(196, 30, 58, 0.6),
        inset 0 1px 0 rgba(255, 255, 255, 0.3);
    }
  }

  .btn-play {
    background: linear-gradient(135deg, rgba(15, 134, 68, 0.6), rgba(15, 134, 68, 0.4));
    border-color: #0f8644;
    font-size: 1.5rem;
    padding: 0.6rem 1rem;
    min-width: 52px;
    box-shadow: 
      0 6px 16px rgba(15, 134, 68, 0.5),
      0 0 12px rgba(15, 134, 68, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.2);
  }

  .btn-play:hover:not(:disabled) {
    background: linear-gradient(135deg, rgba(15, 134, 68, 0.8), rgba(15, 134, 68, 0.6));
    border-color: #0f8644;
    box-shadow: 
      0 10px 24px rgba(15, 134, 68, 0.7),
      0 0 20px rgba(15, 134, 68, 0.5),
      inset 0 1px 0 rgba(255, 255, 255, 0.3);
  }

  .volume-container {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 0.75rem;
    background: linear-gradient(135deg, 
      rgba(0, 0, 0, 0.4) 0%, 
      rgba(15, 134, 68, 0.15) 50%, 
      rgba(0, 0, 0, 0.4) 100%);
    border-radius: 12px;
    border: 2px solid rgba(255, 215, 0, 0.3);
    box-shadow: 
      inset 0 2px 4px rgba(0, 0, 0, 0.3),
      0 0 8px rgba(255, 215, 0, 0.1);
  }

  .volume-label {
    font-size: 0.85rem;
  }

  .volume-slider {
    flex: 1;
    height: 6px;
    border-radius: 3px;
    outline: none;
    cursor: pointer;
    background: transparent;
    -webkit-appearance: none;
    appearance: none;
  }
  
  /* WebKit track styling - Candy Cane */
  .volume-slider::-webkit-slider-runnable-track {
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background: repeating-linear-gradient(
      45deg,
      #C41E3A 0px,
      #C41E3A 8px,
      #ffffff 8px,
      #ffffff 16px
    );
    border: 1px solid rgba(255, 215, 0, 0.3);
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3);
  }
  
  /* Firefox track styling - Candy Cane */
  .volume-slider::-moz-range-track {
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background: repeating-linear-gradient(
      45deg,
      #C41E3A 0px,
      #C41E3A 8px,
      #ffffff 8px,
      #ffffff 16px
    );
    border: 1px solid rgba(255, 215, 0, 0.3);
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3);
  }

  .volume-slider::-webkit-slider-thumb {
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    /* Candy cane thumb with stripes */
    background: repeating-linear-gradient(
      45deg,
      #C41E3A 0px,
      #C41E3A 3px,
      #ffffff 3px,
      #ffffff 6px
    );
    cursor: pointer;
    border: 2px solid rgba(255, 255, 255, 0.9);
    box-shadow: 
      0 2px 6px rgba(196, 30, 58, 0.6),
      0 0 8px rgba(255, 255, 255, 0.4),
      inset 0 1px 2px rgba(255, 255, 255, 0.3);
  }

  .volume-slider::-webkit-slider-thumb:hover {
    transform: scale(1.1);
  }

  .volume-value {
    min-width: 35px;
    text-align: right;
    color: white;
    font-size: 0.75rem;
  }

  .playlist-container {
    max-height: 120px;
    overflow-y: auto;
    background: linear-gradient(135deg, 
      rgba(0, 0, 0, 0.4) 0%, 
      rgba(15, 134, 68, 0.15) 50%, 
      rgba(0, 0, 0, 0.4) 100%);
    border-radius: 12px;
    padding: 0.5rem;
    border: 2px solid rgba(255, 215, 0, 0.3);
    box-shadow: 
      inset 0 2px 4px rgba(0, 0, 0, 0.3),
      0 0 8px rgba(255, 215, 0, 0.1);
  }

  .playlist-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.3rem;
    padding: 0.3rem;
  }

  .playlist-header h4 {
    margin: 0;
    color: white;
    font-size: 0.85rem;
  }

  .btn-toggle {
    background: linear-gradient(135deg, 
      rgba(196, 30, 58, 0.2), 
      rgba(15, 134, 68, 0.2));
    border: 2px solid rgba(255, 215, 0, 0.4);
    border-radius: 10px;
    color: #ffd700;
    cursor: pointer;
    font-size: 1.2rem;
    padding: 0.4rem 0.6rem;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 
      0 2px 6px rgba(0, 0, 0, 0.2),
      0 0 6px rgba(255, 215, 0, 0.15);
  }
  
  .btn-toggle:hover {
    background: linear-gradient(135deg, 
      rgba(255, 215, 0, 0.3), 
      rgba(196, 30, 58, 0.2));
    border-color: #ffd700;
    transform: translateY(-2px) scale(1.05);
    box-shadow: 
      0 4px 12px rgba(255, 215, 0, 0.3),
      0 0 12px rgba(255, 215, 0, 0.2);
  }

  .playlist {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .playlist-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    color: rgba(255, 255, 255, 0.85);
    border: 1px solid transparent;
  }

  .playlist-item:hover {
    background: linear-gradient(135deg, 
      rgba(255, 215, 0, 0.15), 
      rgba(196, 30, 58, 0.1));
    border-color: rgba(255, 215, 0, 0.3);
    transform: translateX(4px);
    box-shadow: 0 2px 8px rgba(255, 215, 0, 0.15);
  }

  .playlist-item.active {
    background: linear-gradient(135deg, 
      rgba(196, 30, 58, 0.5), 
      rgba(196, 30, 58, 0.3));
    color: #ffd700;
    font-weight: 800;
    border: 2px solid #ffd700;
    border-left: 4px solid #ffd700;
    box-shadow: 
      0 4px 12px rgba(255, 215, 0, 0.3),
      0 0 12px rgba(196, 30, 58, 0.4),
      inset 0 1px 0 rgba(255, 255, 255, 0.1);
    transform: translateX(2px);
  }

  .track-number {
    min-width: 20px;
    text-align: right;
    font-size: 0.75rem;
    opacity: 0.7;
  }

  .track-title {
    flex: 1;
    font-size: 0.8rem;
  }

  .playing-indicator {
    animation: pulse 1s infinite;
    font-size: 1rem;
  }

  .playlist-toggle {
    text-align: center;
    padding: 0.5rem;
  }
  
  .playlist-toggle .btn-toggle {
    width: 100%;
    font-size: 0.9rem;
    padding: 0.5rem 1rem;
    background: linear-gradient(135deg, 
      rgba(196, 30, 58, 0.25), 
      rgba(15, 134, 68, 0.25));
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  /* Scrollbar styling - Candy Cane */
  .playlist-container::-webkit-scrollbar {
    width: 10px;
  }

  .playlist-container::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 5px;
  }

  .playlist-container::-webkit-scrollbar-thumb {
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

  .playlist-container::-webkit-scrollbar-thumb:hover {
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
  
  /* Firefox scrollbar */
  .playlist-container {
    scrollbar-width: thin;
    scrollbar-color: #C41E3A rgba(0, 0, 0, 0.2);
  }
</style>

