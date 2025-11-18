import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { socket } from './socket';
import { updateGlobalSettings, globalSettings } from './settings';
import type { GlobalSettings } from '@christmas/core';

export interface RoomTheme {
  snowEffect: boolean;
  backgroundMusic: boolean;
  sparkles: boolean;
  icicles: boolean;
  frostPattern: boolean;
  colorScheme: 'traditional' | 'winter' | 'mixed';
}

const defaultTheme: RoomTheme = {
  snowEffect: true,
  backgroundMusic: true,
  sparkles: true,
  icicles: false,
  frostPattern: true,
  colorScheme: 'mixed',
};

// Current room theme store
export const roomTheme = writable<RoomTheme | null>(null);

// Current room code store
export const currentRoomCode = writable<string | null>(null);

// Derived stores for easy access
export const snowEffectEnabled = derived(roomTheme, ($theme) => $theme?.snowEffect ?? defaultTheme.snowEffect);
export const sparklesEnabled = derived(roomTheme, ($theme) => $theme?.sparkles ?? defaultTheme.sparkles);
export const iciclesEnabled = derived(roomTheme, ($theme) => $theme?.icicles ?? defaultTheme.icicles);
export const frostPatternEnabled = derived(roomTheme, ($theme) => $theme?.frostPattern ?? defaultTheme.frostPattern);
export const colorScheme = derived(roomTheme, ($theme) => $theme?.colorScheme ?? defaultTheme.colorScheme);

/**
 * Load room theme from server
 */
export function loadRoomTheme(roomCode: string): Promise<RoomTheme | null> {
  if (!browser) return Promise.resolve(null);

  return new Promise((resolve) => {
    const $socket = get(socket);
    if (!$socket) {
      resolve(null);
      return;
    }

    $socket.emit('get_room_theme', roomCode, (response: any) => {
      if (response?.success && response.theme) {
        const theme: RoomTheme = {
          snowEffect: response.theme.snowEffect ?? defaultTheme.snowEffect,
          backgroundMusic: response.theme.backgroundMusic ?? response.theme.soundEnabled ?? defaultTheme.backgroundMusic,
          sparkles: response.theme.sparkles ?? defaultTheme.sparkles,
          icicles: response.theme.icicles ?? defaultTheme.icicles,
          frostPattern: response.theme.frostPattern ?? defaultTheme.frostPattern,
          colorScheme: response.theme.colorScheme ?? defaultTheme.colorScheme,
        };
        roomTheme.set(theme);
        currentRoomCode.set(roomCode);
        applyRoomTheme(theme);
        resolve(theme);
      } else {
        // Use defaults if no theme found
        roomTheme.set(defaultTheme);
        currentRoomCode.set(roomCode);
        applyRoomTheme(defaultTheme);
        resolve(defaultTheme);
      }
    });
  });
}

/**
 * Apply room theme to UI
 */
export function applyRoomTheme(theme: RoomTheme): void {
  if (!browser) return;

  // Update global settings store
  updateGlobalSettings({
    theme: {
      soundEnabled: theme.backgroundMusic,
      snowEffect: theme.snowEffect,
      sparkles: theme.sparkles,
      icicles: theme.icicles,
      frostPattern: theme.frostPattern,
      colorScheme: theme.colorScheme,
    },
  });

  // Apply color scheme to document
  const root = document.documentElement;
  root.setAttribute('data-theme', theme.colorScheme);

  // Apply theme classes
  root.classList.remove('theme-traditional', 'theme-winter', 'theme-mixed');
  root.classList.add(`theme-${theme.colorScheme}`);
}

/**
 * Reset theme to defaults
 */
export function resetToDefaults(): void {
  roomTheme.set(null);
  currentRoomCode.set(null);
  
  if (browser) {
    const root = document.documentElement;
    root.removeAttribute('data-theme');
    root.classList.remove('theme-traditional', 'theme-winter', 'theme-mixed');
    
    // Reset global settings to defaults
    updateGlobalSettings({
      theme: {
        soundEnabled: defaultTheme.backgroundMusic,
        snowEffect: defaultTheme.snowEffect,
        sparkles: defaultTheme.sparkles,
        icicles: defaultTheme.icicles,
        frostPattern: defaultTheme.frostPattern,
        colorScheme: defaultTheme.colorScheme,
      },
    });
  }
}

/**
 * Update room theme (for host)
 */
export function updateRoomTheme(roomCode: string, updates: Partial<RoomTheme>): Promise<boolean> {
  if (!browser) return Promise.resolve(false);

  return new Promise((resolve) => {
    const $socket = get(socket);
    if (!$socket) {
      resolve(false);
      return;
    }

    $socket.emit('update_room_settings', {
      backgroundMusic: updates.backgroundMusic,
      snowEffect: updates.snowEffect,
      sparkles: updates.sparkles,
      icicles: updates.icicles,
      frostPattern: updates.frostPattern,
      colorScheme: updates.colorScheme,
    }, (response: any) => {
      if (response?.success) {
        // Theme will be updated via room_settings_updated event
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}

