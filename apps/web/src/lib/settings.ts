import { writable, derived } from 'svelte/store';
import { GlobalSettingsSchema, type GlobalSettings } from '@christmas/core';

// Initialize with default settings
const defaultSettings: GlobalSettings = GlobalSettingsSchema.parse({ theme: {} });

// Settings store
export const globalSettings = writable<GlobalSettings>(defaultSettings);

// Derived stores for easy access
export const snowEffect = derived(globalSettings, ($settings) => $settings.theme.snowEffect ?? true);
export const soundEnabled = derived(globalSettings, ($settings) => $settings.theme.soundEnabled ?? true);

// Initialize settings from socket events
export function initializeSettings() {
  if (typeof window === 'undefined') return; // SSR safety
  
  // Import socket dynamically to avoid circular dependencies
  import('./socket').then(({ socket }) => {
    // Listen for settings updates from server
    socket.subscribe(($sock) => {
      if ($sock) {
        $sock.on('settings_updated', (data: any) => {
          if (data.global) {
            try {
              const validated = GlobalSettingsSchema.parse(data.global);
              globalSettings.set(validated);
            } catch (error) {
              console.error('Invalid settings received:', error);
            }
          }
        });
      }
    });
  }).catch((error) => {
    console.warn('Could not initialize settings listener:', error);
  });
}

// Update settings function
export function updateGlobalSettings(settings: Partial<GlobalSettings>) {
  globalSettings.update((current) => {
    const updated = { ...current, ...settings };
    return GlobalSettingsSchema.parse(updated);
  });
}

