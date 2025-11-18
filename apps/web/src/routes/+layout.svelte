<script lang="ts">
  import '../app.css';
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { snowEffect, initializeSettings } from '$lib/settings';
  import { connectSocket } from '$lib/socket';
  import { getAudioManager, startBackgroundMusic } from '$lib/audio';
  import { initializeAuth } from '$lib/supabase';
  import { get } from 'svelte/store';
  import { roomTheme, sparklesEnabled, iciclesEnabled, frostPatternEnabled, colorScheme } from '$lib/theme';
  import SparklesEffect from '$lib/components/SparklesEffect.svelte';
  import IciclesEffect from '$lib/components/IciclesEffect.svelte';
  import FrostPattern from '$lib/components/FrostPattern.svelte';

  // Accept params prop to suppress SvelteKit warning
  export const params: Record<string, string> = {};

  let snowflakes: HTMLElement[] = [];
  let showSparkles = false;
  let showIcicles = false;
  let showFrost = false;
  let currentColorScheme = 'mixed';

  onMount(() => {
    if (browser) {
      // Initialize auth first
      initializeAuth();
      // Connect socket (now async but we don't need to await)
      connectSocket().catch(err => console.error('[Socket] Connection error:', err));
      
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
          // Small delay to ensure DOM is ready
          setTimeout(() => {
            createSnowflakes();
          }, 100);
        } else {
          removeSnowflakes();
        }
      });
      
      // Check initial state immediately (get current value from store)
      const currentSnowState = get(snowEffect);
      if (currentSnowState) {
        setTimeout(() => {
          createSnowflakes();
        }, 300);
      }
      
      // Check for reduced motion preference
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const isMobile = window.innerWidth < 768;
      
      // Subscribe to room theme effects (respect reduced motion)
      const sparklesUnsubscribe = sparklesEnabled.subscribe((enabled) => {
        showSparkles = enabled && !prefersReducedMotion;
      });
      
      const iciclesUnsubscribe = iciclesEnabled.subscribe((enabled) => {
        showIcicles = enabled && !prefersReducedMotion && !isMobile;
      });
      
      const frostUnsubscribe = frostPatternEnabled.subscribe((enabled) => {
        showFrost = enabled && !prefersReducedMotion;
      });
      
      const colorSchemeUnsubscribe = colorScheme.subscribe((scheme) => {
        currentColorScheme = scheme;
        applyColorScheme(scheme);
      });
      
      // Check initial theme state (respect reduced motion)
      const currentTheme = get(roomTheme);
      if (currentTheme) {
        showSparkles = currentTheme.sparkles && !prefersReducedMotion;
        showIcicles = currentTheme.icicles && !prefersReducedMotion && !isMobile;
        showFrost = currentTheme.frostPattern && !prefersReducedMotion;
        currentColorScheme = currentTheme.colorScheme;
        applyColorScheme(currentTheme.colorScheme);
      }

      // Cleanup on destroy
      return () => {
        snowUnsubscribe();
        audioUnsubscribe();
        sparklesUnsubscribe();
        iciclesUnsubscribe();
        frostUnsubscribe();
        colorSchemeUnsubscribe();
        removeSnowflakes();
      };
    }
  });
  
  function applyColorScheme(scheme: string) {
    if (!browser) return;
    const root = document.documentElement;
    root.setAttribute('data-theme', scheme);
    root.classList.remove('theme-traditional', 'theme-winter', 'theme-mixed');
    root.classList.add(`theme-${scheme}`);
  }

  function createSnowflakes() {
    if (!browser) return;
    
    // Remove existing snowflakes first
    removeSnowflakes();
    
      // Adjust snowflake count based on screen size and reduced motion preference
      const isMobile = window.innerWidth < 768;
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const snowflakeCount = prefersReducedMotion ? 0 : (isMobile ? 30 : 60);
    const container = document.body;
    if (!container) return;

    const snowflakeChars = ['❄', '❅', '❆', '✻', '✼', '✽', '✾', '✿'];
    
    for (let i = 0; i < snowflakeCount; i++) {
      const snowflake = document.createElement('div');
      
      // Random size category
      const sizeRand = Math.random();
      let sizeClass = 'small';
      let baseSize = 10;
      if (sizeRand > 0.7) {
        sizeClass = 'large';
        baseSize = 20;
      } else if (sizeRand > 0.4) {
        sizeClass = 'medium';
        baseSize = 15;
      }
      
      // Add glow effect to some snowflakes for glinting effect
      const shouldGlow = Math.random() > 0.7;
      snowflake.className = `snowflake ${sizeClass}${shouldGlow ? ' glow' : ''}`;
      
      // Random snowflake character
      snowflake.innerHTML = snowflakeChars[Math.floor(Math.random() * snowflakeChars.length)];
      
      // Random horizontal position
      snowflake.style.left = Math.random() * 100 + '%';
      
      // Random animation duration (slower = bigger flakes fall slower)
      const duration = baseSize === 20 ? Math.random() * 4 + 8 : baseSize === 15 ? Math.random() * 3 + 6 : Math.random() * 2 + 4;
      snowflake.style.animationDuration = duration + 's';
      
      // Random delay so they don't all start at once
      snowflake.style.animationDelay = Math.random() * 3 + 's';
      
      // Random horizontal drift
      const drift = (Math.random() - 0.5) * 30;
      snowflake.style.setProperty('--drift', drift + 'px');
      
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

<!-- Theme Effects -->
{#if showSparkles}
  <SparklesEffect enabled={showSparkles} count={20} />
{/if}

{#if showIcicles}
  <IciclesEffect enabled={showIcicles} count={8} />
{/if}

{#if showFrost}
  <FrostPattern enabled={showFrost} intensity={0.3} />
{/if}

<slot />
