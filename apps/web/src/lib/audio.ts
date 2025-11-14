import { soundEnabled } from './settings';
import { get } from 'svelte/store';
import { browser } from '$app/environment';

class AudioManager {
  private backgroundMusic: HTMLAudioElement | null = null;
  private soundEffects: Map<string, HTMLAudioElement> = new Map();
  private musicVolume = 0.3;
  private effectsVolume = 0.5;
  private musicEnabled = true;
  private effectsEnabled = true;

  constructor() {
    if (!browser) return;
    
    // Initialize background music
    this.backgroundMusic = new Audio('/audio/background-music.mp3');
    this.backgroundMusic.loop = true;
    this.backgroundMusic.volume = this.musicVolume;
    
    // Preload sound effects
    this.loadSoundEffect('gameStart', '/audio/game-start.wav');
    this.loadSoundEffect('correct', '/audio/correct.wav');
    this.loadSoundEffect('wrong', '/audio/wrong.wav');
    this.loadSoundEffect('roundEnd', '/audio/round-end.wav');
    this.loadSoundEffect('gameEnd', '/audio/game-end.wav');
    this.loadSoundEffect('click', '/audio/click.wav');
  }

  private loadSoundEffect(name: string, path: string) {
    if (!browser) return;
    const audio = new Audio(path);
    audio.volume = this.effectsVolume;
    audio.preload = 'auto';
    this.soundEffects.set(name, audio);
  }

  playBackgroundMusic() {
    if (!browser || !this.backgroundMusic) return;
    if (!get(soundEnabled) || !this.musicEnabled) return;
    
    this.backgroundMusic.play().catch((error) => {
      console.warn('Could not play background music:', error);
      // Music might fail due to browser autoplay policies
    });
  }

  stopBackgroundMusic() {
    if (!browser || !this.backgroundMusic) return;
    this.backgroundMusic.pause();
    this.backgroundMusic.currentTime = 0;
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

  setMusicVolume(volume: number) {
    this.musicVolume = Math.max(0, Math.min(1, volume));
    if (this.backgroundMusic) {
      this.backgroundMusic.volume = this.musicVolume;
    }
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

