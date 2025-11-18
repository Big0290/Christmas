import { soundEnabled } from './settings';
import { get } from 'svelte/store';
import { browser } from '$app/environment';
import type { Track } from './utils/audio-discovery';

export type RepeatMode = 'none' | 'one' | 'all';

class AudioManager {
  private backgroundMusic: HTMLAudioElement | null = null;
  private soundEffects: Map<string, HTMLAudioElement> = new Map();
  private musicVolume = 0.3;
  private effectsVolume = 0.5;
  private musicEnabled = true;
  private effectsEnabled = true;

  // Track last played sound events to prevent duplicates
  private lastPlayedSounds: Map<string, number> = new Map();
  private readonly SOUND_DEBOUNCE_MS = 500; // Prevent same sound from playing within 500ms

  // Playlist management
  private tracks: Track[] = [];
  private currentTrackIndex = -1;
  private shuffledTracks: Track[] = [];
  private shuffleEnabled = false;
  private repeatMode: RepeatMode = 'all';
  private isPlaying = false;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;

  constructor() {
    if (!browser) return;
    
    // Initialize background music (backward compatibility)
    this.backgroundMusic = new Audio('/audio/background-music.mp3');
    this.backgroundMusic.loop = true;
    this.backgroundMusic.volume = this.musicVolume;
    
    // Set up ended event handler for playlist
    this.backgroundMusic.addEventListener('ended', () => {
      this.handleTrackEnded();
    });
    
    // Preload sound effects
    this.loadSoundEffect('gameStart', '/audio/game-start.wav');
    this.loadSoundEffect('correct', '/audio/correct.wav');
    this.loadSoundEffect('wrong', '/audio/wrong.wav');
    this.loadSoundEffect('roundEnd', '/audio/round-end.wav');
    this.loadSoundEffect('gameEnd', '/audio/game-end.wav');
    this.loadSoundEffect('click', '/audio/click.wav');
    this.loadSoundEffect('countdown', '/audio/countdown.wav');
  }

  private loadSoundEffect(name: string, path: string) {
    if (!browser) return;
    const audio = new Audio(path);
    audio.volume = this.effectsVolume;
    audio.preload = 'auto';
    this.soundEffects.set(name, audio);
  }

  playBackgroundMusic() {
    // Backward compatibility: if no playlist, use old behavior
    if (this.tracks.length === 0) {
      if (!browser || !this.backgroundMusic) return;
      if (!get(soundEnabled) || !this.musicEnabled) return;
      
      this.backgroundMusic.play().catch((error) => {
        console.warn('Could not play background music:', error);
      });
      return;
    }

    // New playlist behavior
    if (this.currentTrackIndex === -1 && this.tracks.length > 0) {
      this.currentTrackIndex = 0;
    }
    this.playCurrentTrack();
  }

  stopBackgroundMusic() {
    if (!browser || !this.backgroundMusic) return;
    this.backgroundMusic.pause();
    this.backgroundMusic.currentTime = 0;
    this.isPlaying = false;
  }

  // Playlist management methods
  setPlaylist(tracks: Track[]) {
    this.tracks = tracks;
    this.shuffledTracks = [...tracks];
    if (this.currentTrackIndex === -1 && tracks.length > 0) {
      this.currentTrackIndex = 0;
    }
    this.updateShuffledPlaylist();
  }

  private updateShuffledPlaylist() {
    if (this.shuffleEnabled) {
      this.shuffledTracks = [...this.tracks].sort(() => Math.random() - 0.5);
    } else {
      this.shuffledTracks = [...this.tracks];
    }
  }

  getCurrentTrackIndex(): number {
    if (this.shuffleEnabled && this.shuffledTracks.length > 0) {
      const currentTrack = this.getCurrentTrack();
      if (currentTrack) {
        return this.shuffledTracks.findIndex(t => t.path === currentTrack.path);
      }
    }
    return this.currentTrackIndex;
  }

  getCurrentTrack(): Track | null {
    if (this.tracks.length === 0) return null;
    if (this.shuffleEnabled && this.shuffledTracks.length > 0) {
      const index = this.getCurrentTrackIndex();
      return index >= 0 ? this.shuffledTracks[index] : null;
    }
    return this.currentTrackIndex >= 0 && this.currentTrackIndex < this.tracks.length
      ? this.tracks[this.currentTrackIndex]
      : null;
  }

  getPlaylist(): Track[] {
    return this.shuffleEnabled ? this.shuffledTracks : this.tracks;
  }

  playTrack(index: number) {
    if (!browser) return;
    const playlist = this.getPlaylist();
    if (index < 0 || index >= playlist.length) return;

    if (this.shuffleEnabled) {
      // Find the track in shuffled list and update currentTrackIndex to match original
      const track = playlist[index];
      this.currentTrackIndex = this.tracks.findIndex(t => t.path === track.path);
    } else {
      this.currentTrackIndex = index;
    }
    this.playCurrentTrack();
  }

  private playCurrentTrack() {
    if (!browser) return;
    const track = this.getCurrentTrack();
    if (!track) return;

    if (!get(soundEnabled) || !this.musicEnabled) return;

    // Stop current track
    if (this.backgroundMusic) {
      this.backgroundMusic.pause();
      this.backgroundMusic.src = '';
    }

    // Load new track
    this.backgroundMusic = new Audio(track.path);
    this.backgroundMusic.volume = this.musicVolume;
    this.backgroundMusic.loop = this.repeatMode === 'one';
    
    // Set up ended handler
    this.backgroundMusic.addEventListener('ended', () => {
      this.handleTrackEnded();
    });

    // Set up audio context for visualizer
    this.setupAudioContext();

    // Play
    this.backgroundMusic.play()
      .then(() => {
        this.isPlaying = true;
      })
      .catch((error) => {
        console.warn('Could not play track:', error);
        this.isPlaying = false;
      });
  }

  private handleTrackEnded() {
    if (this.repeatMode === 'one') {
      // Already looping, nothing to do
      return;
    }

    if (this.repeatMode === 'all') {
      this.nextTrack();
    } else if (this.repeatMode === 'none') {
      const playlist = this.getPlaylist();
      const currentIndex = this.getCurrentTrackIndex();
      if (currentIndex < playlist.length - 1) {
        this.nextTrack();
      } else {
        // End of playlist
        this.isPlaying = false;
      }
    }
  }

  nextTrack() {
    const playlist = this.getPlaylist();
    if (playlist.length === 0) return;

    const currentIndex = this.getCurrentTrackIndex();
    const nextIndex = (currentIndex + 1) % playlist.length;
    this.playTrack(nextIndex);
  }

  previousTrack() {
    const playlist = this.getPlaylist();
    if (playlist.length === 0) return;

    const currentIndex = this.getCurrentTrackIndex();
    const prevIndex = currentIndex === 0 ? playlist.length - 1 : currentIndex - 1;
    this.playTrack(prevIndex);
  }

  play(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!browser) {
        reject(new Error('Not in browser'));
        return;
      }
      if (!get(soundEnabled) || !this.musicEnabled) {
        reject(new Error('Sound disabled'));
        return;
      }

      if (this.tracks.length === 0) {
        // Backward compatibility
        this.playBackgroundMusic();
        resolve();
        return;
      }

      // Ensure we have a track loaded
      if (!this.backgroundMusic || !this.backgroundMusic.src) {
        // No track loaded, load current track
        if (this.currentTrackIndex >= 0) {
          this.playCurrentTrack();
          resolve();
          return;
        } else if (this.tracks.length > 0) {
          // Start from first track
          this.currentTrackIndex = 0;
          this.playCurrentTrack();
          resolve();
          return;
        } else {
          reject(new Error('No tracks available'));
          return;
        }
      }

      // Resume playback
      if (this.backgroundMusic) {
        this.backgroundMusic.play()
          .then(() => {
            this.isPlaying = true;
            resolve();
          })
          .catch((error) => {
            console.warn('Could not play:', error);
            // If play fails, try reloading the track
            if (this.currentTrackIndex >= 0) {
              try {
                this.playCurrentTrack();
                resolve();
              } catch (reloadError) {
                reject(reloadError);
              }
            } else {
              reject(error);
            }
          });
      } else {
        reject(new Error('Audio element not initialized'));
      }
    });
  }

  pause(): void {
    if (!browser || !this.backgroundMusic) return;
    this.backgroundMusic.pause();
    this.isPlaying = false;
  }

  togglePlayPause(): Promise<void> {
    if (!browser) return Promise.resolve();
    if (!get(soundEnabled) || !this.musicEnabled) return Promise.resolve();

    if (this.isPlaying) {
      // Pause
      this.pause();
      return Promise.resolve();
    } else {
      // Play/Resume
      return this.play();
    }
  }

  toggleShuffle() {
    this.shuffleEnabled = !this.shuffleEnabled;
    this.updateShuffledPlaylist();
    // If currently playing, maintain current track position
    if (this.isPlaying && this.currentTrackIndex >= 0) {
      const currentTrack = this.getCurrentTrack();
      if (currentTrack) {
        const newIndex = this.getPlaylist().findIndex(t => t.path === currentTrack.path);
        if (newIndex >= 0) {
          this.currentTrackIndex = this.tracks.findIndex(t => t.path === currentTrack.path);
        }
      }
    }
  }

  toggleRepeat(): RepeatMode {
    const modes: RepeatMode[] = ['none', 'one', 'all'];
    const currentIndex = modes.indexOf(this.repeatMode);
    this.repeatMode = modes[(currentIndex + 1) % modes.length];
    
    if (this.backgroundMusic) {
      this.backgroundMusic.loop = this.repeatMode === 'one';
    }
    
    return this.repeatMode;
  }

  setRepeatMode(mode: RepeatMode) {
    this.repeatMode = mode;
    if (this.backgroundMusic) {
      this.backgroundMusic.loop = mode === 'one';
    }
  }

  setProgress(seconds: number) {
    if (!browser || !this.backgroundMusic) return;
    if (isNaN(this.backgroundMusic.duration)) return;
    this.backgroundMusic.currentTime = Math.max(0, Math.min(seconds, this.backgroundMusic.duration));
  }

  getProgress(): number {
    if (!browser || !this.backgroundMusic) return 0;
    return this.backgroundMusic.currentTime || 0;
  }

  getDuration(): number {
    if (!browser || !this.backgroundMusic) return 0;
    return this.backgroundMusic.duration || 0;
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  getShuffleEnabled(): boolean {
    return this.shuffleEnabled;
  }

  getRepeatMode(): RepeatMode {
    return this.repeatMode;
  }

  // Audio context for visualizer
  private setupAudioContext() {
    if (!browser || !this.backgroundMusic) return;

    try {
      // Create audio context if it doesn't exist
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      // Resume context if suspended (required by some browsers)
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      // Create analyser node
      if (!this.analyser) {
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256;
      }

      // Create source node from audio element
      // Note: MediaElementSourceNode can only be created once per audio element
      // Since we create a new Audio() element each time, we can always create a new source
      // Disconnect old source if it exists
      if (this.sourceNode) {
        try {
          this.sourceNode.disconnect();
        } catch (e) {
          // Ignore errors when disconnecting (node may already be disconnected)
        }
      }
      
      // Create new source node for the current audio element
      this.sourceNode = this.audioContext.createMediaElementSource(this.backgroundMusic);
      this.sourceNode.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);
    } catch (error) {
      console.warn('Could not set up audio context for visualizer:', error);
      // Reset nodes on error
      this.sourceNode = null;
    }
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  getFrequencyData(): Uint8Array | null {
    if (!this.analyser) return null;
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteFrequencyData(dataArray);
    return dataArray;
  }

  playSound(effectName: string) {
    if (!browser) return;
    if (!get(soundEnabled) || !this.effectsEnabled) return;
    
    const sound = this.soundEffects.get(effectName);
    if (sound) {
      // Clone and play to allow overlapping sounds
      const clonedSound = sound.cloneNode() as HTMLAudioElement;
      clonedSound.volume = this.effectsVolume;
      clonedSound.play().catch((error) => {
        console.warn(`Could not play sound effect ${effectName}:`, error);
      });
    }
  }

  playSoundOnce(effectName: string, debounceMs: number = this.SOUND_DEBOUNCE_MS) {
    if (!browser) return;
    if (!get(soundEnabled) || !this.effectsEnabled) return;
    
    const now = Date.now();
    const lastPlayed = this.lastPlayedSounds.get(effectName);
    
    // Check if we should play this sound (debounce check)
    if (lastPlayed && (now - lastPlayed) < debounceMs) {
      // Sound was played recently, skip
      return;
    }
    
    // Update last played time
    this.lastPlayedSounds.set(effectName, now);
    
    // Play the sound
    this.playSound(effectName);
  }

  setMusicVolume(volume: number) {
    this.musicVolume = Math.max(0, Math.min(1, volume));
    if (this.backgroundMusic) {
      this.backgroundMusic.volume = this.musicVolume;
    }
  }

  getMusicVolume(): number {
    return this.musicVolume;
  }

  setEffectsVolume(volume: number) {
    this.effectsVolume = Math.max(0, Math.min(1, volume));
    this.soundEffects.forEach((sound) => {
      sound.volume = this.effectsVolume;
    });
  }

  setMusicEnabled(enabled: boolean) {
    this.musicEnabled = enabled;
    if (!enabled) {
      this.stopBackgroundMusic();
    } else if (get(soundEnabled)) {
      this.playBackgroundMusic();
    }
  }

  setEffectsEnabled(enabled: boolean) {
    this.effectsEnabled = enabled;
  }

  // Subscribe to soundEnabled changes
  subscribeToSettings() {
    if (!browser) return () => {};
    
    return soundEnabled.subscribe((enabled) => {
      if (enabled && this.musicEnabled) {
        this.playBackgroundMusic();
      } else {
        this.stopBackgroundMusic();
      }
    });
  }
}

// Singleton instance
let audioManager: AudioManager | null = null;

export function getAudioManager(): AudioManager {
  if (!audioManager && browser) {
    audioManager = new AudioManager();
  }
  return audioManager!;
}

// Convenience functions
export function playSound(effectName: string) {
  if (browser) {
    getAudioManager().playSound(effectName);
  }
}

export function playSoundOnce(effectName: string, debounceMs?: number) {
  if (browser) {
    getAudioManager().playSoundOnce(effectName, debounceMs);
  }
}

export function startBackgroundMusic() {
  if (browser) {
    getAudioManager().playBackgroundMusic();
  }
}

export function stopBackgroundMusic() {
  if (browser) {
    getAudioManager().stopBackgroundMusic();
  }
}

