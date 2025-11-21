import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { socket, connected } from './socket';
import { updateGlobalSettings, globalSettings } from './settings';
import { language } from './i18n';
import type { GlobalSettings } from '@christmas/core';

export interface RoomTheme {
  snowEffect: boolean;
  backgroundMusic: boolean;
  sparkles: boolean;
  icicles: boolean;
  frostPattern: boolean;
  colorScheme: 'traditional' | 'winter' | 'mixed';
  language?: 'en' | 'fr';
}

const defaultTheme: RoomTheme = {
  snowEffect: true,
  backgroundMusic: true,
  sparkles: true,
  icicles: false,
  frostPattern: true,
  colorScheme: 'mixed',
  language: get(language),
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
      console.warn(`[Theme] Cannot load theme: socket not available`);
      resolve(null);
      return;
    }

    // Check if socket is connected - wait for connection if needed
    const $connected = get(connected);
    if (!$socket.connected || !$connected) {
      console.warn(`[Theme] Cannot load theme: socket not connected, waiting for connection...`);
      // Wait for socket to connect
      const unsubscribeSocket = socket.subscribe((sock) => {
        const isConnected = get(connected);
        if (sock && sock.connected && isConnected) {
          unsubscribeSocket();
          unsubscribeConnected();
          // Retry loading theme
          console.log(`[Theme] Socket connected, retrying theme load...`);
          loadRoomTheme(roomCode).then(resolve).catch(() => resolve(null));
        }
      });
      const unsubscribeConnected = connected.subscribe((isConnected) => {
        const $socket = get(socket);
        if ($socket && $socket.connected && isConnected) {
          unsubscribeSocket();
          unsubscribeConnected();
          // Retry loading theme
          console.log(`[Theme] Connection established, retrying theme load...`);
          loadRoomTheme(roomCode).then(resolve).catch(() => resolve(null));
        }
      });
      // Timeout after 10 seconds
      setTimeout(() => {
        unsubscribeSocket();
        unsubscribeConnected();
        console.warn(`[Theme] Timeout waiting for socket connection, using defaults`);
        resolve(defaultTheme);
      }, 10000);
      return;
    }

    console.log(`[Theme] Loading theme for room ${roomCode}...`);
    
    // Set timeout for theme loading
    const timeout = setTimeout(() => {
      console.warn(`[Theme] ⚠️ Timeout loading theme for room ${roomCode}, using defaults`);
      resolve(defaultTheme);
    }, 5000);
    
    $socket.emit('get_room_theme', roomCode, (response: any) => {
      clearTimeout(timeout);
      console.log(`[Theme] Received theme response for room ${roomCode}:`, response);
      if (response?.success && response.theme) {
        const theme: RoomTheme = {
          snowEffect: response.theme.snowEffect ?? defaultTheme.snowEffect,
          backgroundMusic: response.theme.backgroundMusic ?? response.theme.soundEnabled ?? defaultTheme.backgroundMusic,
          sparkles: response.theme.sparkles ?? defaultTheme.sparkles,
          icicles: response.theme.icicles ?? defaultTheme.icicles,
          frostPattern: response.theme.frostPattern ?? defaultTheme.frostPattern,
          colorScheme: response.theme.colorScheme ?? defaultTheme.colorScheme,
          language: response.theme.language ?? defaultTheme.language,
        };
        console.log(`[Theme] ✅ Loaded theme for room ${roomCode}:`, theme);
        roomTheme.set(theme);
        currentRoomCode.set(roomCode);
        // Update language store if theme has language preference
        if (theme.language) {
          language.set(theme.language);
        }
        applyRoomTheme(theme);
        resolve(theme);
      } else {
        console.warn(`[Theme] ⚠️ No theme found for room ${roomCode}, using defaults`);
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
  if (!browser) {
    console.warn('[Theme] Cannot apply theme: not in browser');
    return;
  }

  console.log('[Theme] 🎨 Applying theme to UI:', theme);

  // Update language store if theme has language preference
  if (theme.language) {
    language.set(theme.language);
  }

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
  
  console.log('[Theme] ✅ Theme applied to UI:', {
    colorScheme: theme.colorScheme,
    dataTheme: root.getAttribute('data-theme'),
    classes: root.className
  });
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
  if (!browser) {
    console.warn('[Theme] Cannot save theme: not in browser');
    return Promise.resolve(false);
  }

  if (!roomCode || roomCode.trim() === '') {
    console.error('[Theme] Cannot save theme: roomCode is empty');
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const $socket = get(socket);
    if (!$socket) {
      console.error('[Theme] Cannot save theme: socket not available');
      resolve(false);
      return;
    }

    if (!$socket.connected) {
      console.error('[Theme] Cannot save theme: socket not connected');
      resolve(false);
      return;
    }

    console.log(`[Theme] Saving theme settings for room ${roomCode}:`, updates);
    
    // Set timeout for the emit
    const timeout = setTimeout(() => {
      console.error('[Theme] ❌ Save timeout: No response from server after 5 seconds');
      resolve(false);
    }, 5000);
    
    $socket.emit('update_room_settings', roomCode, {
      backgroundMusic: updates.backgroundMusic,
      snowEffect: updates.snowEffect,
      sparkles: updates.sparkles,
      icicles: updates.icicles,
      frostPattern: updates.frostPattern,
      colorScheme: updates.colorScheme,
      language: updates.language,
    }, (response: any) => {
      clearTimeout(timeout);
      if (response?.success) {
        console.log(`[Theme] ✅ Successfully saved theme settings for room ${roomCode}`);
        // Apply theme immediately after successful save
        if (updates) {
          roomTheme.update((theme) => {
            if (!theme) {
              // Create new theme from updates
              const newTheme: RoomTheme = {
                snowEffect: updates.snowEffect ?? defaultTheme.snowEffect,
                backgroundMusic: updates.backgroundMusic ?? defaultTheme.backgroundMusic,
                sparkles: updates.sparkles ?? defaultTheme.sparkles,
                icicles: updates.icicles ?? defaultTheme.icicles,
                frostPattern: updates.frostPattern ?? defaultTheme.frostPattern,
                colorScheme: updates.colorScheme ?? defaultTheme.colorScheme,
                language: updates.language ?? defaultTheme.language,
              };
              applyRoomTheme(newTheme);
              return newTheme;
            }
            const updated = { ...theme, ...updates };
            applyRoomTheme(updated);
            return updated;
          });
        }
        resolve(true);
      } else {
        console.error('[Theme] ❌ Save failed:', {
          error: response?.error || 'Unknown error',
          response: response,
          roomCode: roomCode,
          updates: updates
        });
        resolve(false);
      }
    });
  });
}

