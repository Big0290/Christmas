<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { getAudioManager, type RepeatMode } from '$lib/audio';
  import { discoverBackgroundMusicTracks, clearTrackCache, type Track } from '$lib/utils/audio-discovery';
  import { socket } from '$lib/socket';
  import AudioVisualizer from './AudioVisualizer.svelte';
  import { get } from 'svelte/store';
  import { t } from '$lib/i18n';

  export let roomCode: string;
  export let isHost: boolean = false;

  let tracks: Track[] = [];
  let currentTrackIndex = 0;
  let isPlaying = false;
  let shuffleEnabled = false;
  let repeatMode: RepeatMode = 'all';
  let volume = 0.3;
  let progress = 0;
  let duration = 0;
  let minimized = false;
  let showPlaylist = false; // Start with playlist collapsed for compactness
  let progressUpdating = false;

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
      audioManager.playTrack(index);
      currentTrackIndex = index;
      visualizerKey++; // Force visualizer restart

      if ($socket) {
        $socket.emit('jukebox_control', roomCode, 'select', { trackIndex: index });
      }
    } catch (error) {
      console.error('[Jukebox] Error selecting track:', error);
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

  const currentTrack = tracks[currentTrackIndex] || null;
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
      <button class="btn-minimize" on:click={() => minimized = !minimized} title={t('jukebox.minimize')}>
        {minimized ? '⬆️' : '⬇️'}
      </button>
    </div>
  </div>

  {#if !minimized}
    <div class="jukebox-content">
      <!-- Track Display -->
      <div class="track-display">
        <div class="track-name">{currentTrack?.displayName || t('jukebox.noTrack')}</div>
        <div class="track-time">{formatTime(progress)} / {formatTime(duration)}</div>
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

<style>
  .jukebox-container {
    background: linear-gradient(135deg, rgba(196, 30, 58, 0.25), rgba(15, 134, 68, 0.25), rgba(255, 215, 0, 0.15));
    border: 2px solid rgba(255, 215, 0, 0.4);
    border-radius: 10px;
    padding: 0.75rem;
    backdrop-filter: blur(15px);
    box-shadow: 
      0 6px 24px rgba(0, 0, 0, 0.4),
      0 0 12px rgba(255, 215, 0, 0.1),
      inset 0 1px 0 rgba(255, 255, 255, 0.1);
    transition: all 0.3s ease;
    position: relative;
    overflow: hidden;
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
    font-size: 1rem;
    font-weight: 800;
    color: #ffd700;
    text-shadow: 
      1px 1px 2px rgba(0, 0, 0, 0.7),
      0 0 6px rgba(255, 215, 0, 0.5);
    margin: 0;
    letter-spacing: 0.2px;
  }

  .jukebox-controls {
    display: flex;
    gap: 0.5rem;
  }

  .btn-minimize {
    background: rgba(255, 255, 255, 0.15);
    border: 1.5px solid rgba(255, 215, 0, 0.4);
    border-radius: 6px;
    padding: 0.3rem 0.5rem;
    cursor: pointer;
    color: #ffd700;
    font-size: 0.9rem;
    transition: all 0.2s;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  }

  .btn-minimize:hover {
    background: rgba(255, 215, 0, 0.2);
    border-color: #ffd700;
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(255, 215, 0, 0.3);
  }

  .btn-refresh {
    background: rgba(255, 255, 255, 0.15);
    border: 1.5px solid rgba(255, 215, 0, 0.4);
    border-radius: 6px;
    padding: 0.3rem 0.5rem;
    cursor: pointer;
    color: #ffd700;
    font-size: 0.9rem;
    transition: all 0.2s;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
    margin-right: 0.4rem;
  }

  .btn-refresh:hover:not(:disabled) {
    background: rgba(255, 215, 0, 0.2);
    border-color: #ffd700;
    transform: rotate(180deg) scale(1.05);
    box-shadow: 0 4px 12px rgba(255, 215, 0, 0.3);
  }

  .btn-refresh.refreshing {
    animation: spin 1s linear infinite;
    opacity: 0.7;
  }

  .btn-refresh:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .jukebox-content {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .track-display {
    text-align: center;
    padding: 0.5rem;
    background: linear-gradient(135deg, rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.2));
    border-radius: 6px;
    border: 1px solid rgba(255, 215, 0, 0.2);
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.3);
  }

  .track-name {
    font-size: 0.85rem;
    font-weight: 700;
    color: #ffd700;
    margin-bottom: 0.15rem;
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .track-time {
    font-size: 0.7rem;
    color: rgba(255, 255, 255, 0.9);
    font-family: 'Courier New', monospace;
    font-weight: 600;
  }

  .visualizer-container {
    width: 100%;
    height: 35px;
    margin: 0.15rem 0;
  }

  .progress-container {
    width: 100%;
  }

  .progress-bar {
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background: linear-gradient(90deg, rgba(0, 0, 0, 0.3), rgba(255, 255, 255, 0.1));
    outline: none;
    cursor: pointer;
    border: 1px solid rgba(255, 215, 0, 0.2);
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3);
  }

  .progress-bar::-webkit-slider-thumb {
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: linear-gradient(135deg, #ffd700, #ffed4e);
    cursor: pointer;
    border: 1.5px solid rgba(255, 255, 255, 0.8);
    box-shadow: 0 1px 4px rgba(255, 215, 0, 0.6), 0 0 6px rgba(255, 215, 0, 0.4);
    transition: all 0.2s;
  }

  .progress-bar::-webkit-slider-thumb:hover {
    transform: scale(1.15);
    box-shadow: 0 2px 8px rgba(255, 215, 0, 0.8), 0 0 10px rgba(255, 215, 0, 0.6);
  }

  .progress-bar::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: linear-gradient(135deg, #ffd700, #ffed4e);
    cursor: pointer;
    border: 1.5px solid rgba(255, 255, 255, 0.8);
    box-shadow: 0 1px 4px rgba(255, 215, 0, 0.6), 0 0 6px rgba(255, 215, 0, 0.4);
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
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.1));
    border: 1.5px solid rgba(255, 215, 0, 0.4);
    border-radius: 6px;
    padding: 0.4rem 0.6rem;
    cursor: pointer;
    color: white;
    font-size: 1.1rem;
    transition: all 0.2s ease;
    min-width: 38px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .btn-control:hover:not(:disabled) {
    background: linear-gradient(135deg, rgba(255, 215, 0, 0.25), rgba(255, 215, 0, 0.15));
    border-color: #ffd700;
    transform: translateY(-2px) scale(1.05);
    box-shadow: 0 6px 12px rgba(255, 215, 0, 0.3);
  }

  .btn-control:active:not(:disabled) {
    transform: translateY(0) scale(1);
  }

  .btn-control:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    filter: grayscale(0.5);
  }

  .btn-control.active {
    background: linear-gradient(135deg, rgba(196, 30, 58, 0.6), rgba(196, 30, 58, 0.4));
    border-color: #c41e3a;
    box-shadow: 0 0 15px rgba(196, 30, 58, 0.5);
  }

  .btn-play {
    background: linear-gradient(135deg, rgba(15, 134, 68, 0.4), rgba(15, 134, 68, 0.3));
    border-color: #0f8644;
    font-size: 1.4rem;
    padding: 0.5rem 0.9rem;
    box-shadow: 0 3px 8px rgba(15, 134, 68, 0.4);
  }

  .btn-play:hover:not(:disabled) {
    background: linear-gradient(135deg, rgba(15, 134, 68, 0.6), rgba(15, 134, 68, 0.5));
    box-shadow: 0 4px 12px rgba(15, 134, 68, 0.6);
  }

  .volume-container {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem;
    background: linear-gradient(135deg, rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.2));
    border-radius: 6px;
    border: 1px solid rgba(255, 215, 0, 0.2);
  }

  .volume-label {
    font-size: 0.85rem;
  }

  .volume-slider {
    flex: 1;
    height: 6px;
    border-radius: 3px;
    background: linear-gradient(90deg, rgba(0, 0, 0, 0.3), rgba(255, 255, 255, 0.1));
    outline: none;
    cursor: pointer;
    border: 1px solid rgba(255, 215, 0, 0.2);
  }

  .volume-slider::-webkit-slider-thumb {
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: linear-gradient(135deg, #ffd700, #ffed4e);
    cursor: pointer;
    border: 1.5px solid rgba(255, 255, 255, 0.8);
    box-shadow: 0 1px 4px rgba(255, 215, 0, 0.5);
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
    background: linear-gradient(135deg, rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.2));
    border-radius: 6px;
    padding: 0.4rem;
    border: 1px solid rgba(255, 215, 0, 0.2);
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.3);
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
    background: transparent;
    border: none;
    color: white;
    cursor: pointer;
    font-size: 1.2rem;
    padding: 0.25rem 0.5rem;
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
    padding: 0.35rem 0.5rem;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.2s;
    color: rgba(255, 255, 255, 0.8);
  }

  .playlist-item:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .playlist-item.active {
    background: linear-gradient(90deg, rgba(196, 30, 58, 0.4), rgba(196, 30, 58, 0.2));
    color: #ffd700;
    font-weight: bold;
    border-left: 3px solid #ffd700;
    box-shadow: 0 2px 8px rgba(255, 215, 0, 0.2);
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

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  /* Scrollbar styling */
  .playlist-container::-webkit-scrollbar {
    width: 8px;
  }

  .playlist-container::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 4px;
  }

  .playlist-container::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 4px;
  }

  .playlist-container::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.5);
  }
</style>

