<script lang="ts">
  import '../app.css';
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { snowEffect, initializeSettings } from '$lib/settings';
  import { connectSocket } from '$lib/socket';
  import { getAudioManager, startBackgroundMusic } from '$lib/audio';

  // Accept params to suppress SvelteKit warning (not used in layout)
  export const params: Record<string, string> = {};

  let snowflakes: HTMLElement[] = [];

  onMount(() => {
    if (browser) {
      connectSocket();
      
      // Initialize settings after socket is connected
      setTimeout(() => {
        initializeSettings();
      }, 100);
      
      // Initialize audio system
      const audioManager = getAudioManager();
      const audioUnsubscribe = audioManager.subscribeToSettings();
      startBackgroundMusic();
      
      // Reactive snow effect based on settings
      const snowUnsubscribe = snowEffect.subscribe((enabled) => {
        if (enabled) {
          createSnowflakes();
        } else {
          removeSnowflakes();
        }
      });

      // Cleanup on destroy
      return () => {
        snowUnsubscribe();
        audioUnsubscribe();
        removeSnowflakes();
      };
    }
  });

  function createSnowflakes() {
    if (!browser) return;
    
    // Remove existing snowflakes first
    removeSnowflakes();
    
    const snowflakeCount = 50;
    const container = document.body;
    if (!container) return;

    for (let i = 0; i < snowflakeCount; i++) {
      const snowflake = document.createElement('div');
      snowflake.className = 'snowflake';
      snowflake.innerHTML = '❄';
      snowflake.style.left = Math.random() * 100 + '%';
      snowflake.style.animationDuration = Math.random() * 3 + 2 + 's';
      snowflake.style.animationDelay = Math.random() * 2 + 's';
      snowflake.style.fontSize = Math.random() * 10 + 10 + 'px';
      container.appendChild(snowflake);
      snowflakes.push(snowflake);
    }
  }

  function removeSnowflakes() {
    snowflakes.forEach((flake) => {
      if (flake.parentNode) {
        flake.parentNode.removeChild(flake);
      }
    });
    snowflakes = [];
  }
</script>

<slot />
