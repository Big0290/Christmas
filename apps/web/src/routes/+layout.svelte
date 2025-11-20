<script lang="ts">
  import '../app.css';
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { snowEffect, initializeSettings } from '$lib/settings';
  import { connectSocket, socket, connected } from '$lib/socket';
  import { getAudioManager, startBackgroundMusic } from '$lib/audio';
  import { initializeAuth, authUser, getAccessToken } from '$lib/supabase';
  import { get } from 'svelte/store';
  import { roomTheme, sparklesEnabled, iciclesEnabled, frostPatternEnabled, colorScheme } from '$lib/theme';
  import SparklesEffect from '$lib/components/SparklesEffect.svelte';
  import IciclesEffect from '$lib/components/IciclesEffect.svelte';
  import FrostPattern from '$lib/components/FrostPattern.svelte';

  // Params are accessed via $page.params in SvelteKit, not as a prop

  let snowflakes: HTMLElement[] = [];
  let showSparkles = false;
  let showIcicles = false;
  let showFrost = false;
  let currentColorScheme = 'mixed';
  let checkedForRoom = false;
  let isRedirecting = false;

  onMount(() => {
    if (browser) {
      // Check if we're on a public page (like guessing game) that doesn't need auth
      const currentPath = window.location.pathname;
      const isPublicPage = currentPath.startsWith('/guess/');
      
      // Only initialize auth and socket for pages that need them
      // Guessing game is public and doesn't require authentication
      if (!isPublicPage) {
        // Initialize auth first
        initializeAuth();
        // Connect socket (now async but we don't need to await)
        connectSocket().catch(err => console.error('[Socket] Connection error:', err));
      } else {
        console.log('[Layout] Skipping auth/socket initialization for public page:', currentPath);
      }
      
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

  // Check for active room and redirect if needed (global check for all authenticated users)
  async function checkAndRedirectToActiveRoom() {
    if (!browser || isRedirecting || checkedForRoom) return;
    
    // Get current route
    const currentPath = $page.url.pathname;
    
    // CRITICAL: Check for public pages FIRST - guessing game should NEVER trigger this function
    // Don't redirect if already on room-related pages or auth pages
    const roomRelatedPaths = ['/room/', '/play/', '/host/', '/guess/'];
    const authPaths = ['/auth/', '/login', '/signup'];
    const shouldSkip = 
      roomRelatedPaths.some(path => currentPath.startsWith(path)) ||
      authPaths.some(path => currentPath.startsWith(path));
    
    if (shouldSkip) {
      return;
    }

    // Check if user is authenticated and socket is connected
    if (!$authUser || !$connected || !$socket) {
      return;
    }

    // Mark as checked to prevent multiple simultaneous checks
    checkedForRoom = true;

    try {
      // Get auth token
      const authToken = await getAccessToken();
      if (!authToken) {
        checkedForRoom = false; // Reset if no token
        return;
      }

      // Check for active room
      $socket.emit('get_my_room', (response: any) => {
        if (response && response.success && response.room && response.room.isActive) {
          const roomCode = response.room.code;
          const hostToken = response.room.hostToken;
          
          // Check again if we should redirect (in case route changed)
          const currentPath = window.location.pathname;
          const roomRelatedPaths = ['/room/', '/play/', '/host/', '/guess/'];
          const authPaths = ['/auth/', '/login', '/signup'];
          const shouldSkip = 
            roomRelatedPaths.some(path => currentPath.startsWith(path)) ||
            authPaths.some(path => currentPath.startsWith(path));
          
          if (shouldSkip) {
            checkedForRoom = false; // Reset for next check
            return;
          }

          // Store room info and redirect
          console.log('[Layout] Found active room, redirecting to:', roomCode);
          isRedirecting = true;
          
          // Store room info
          const savedName = localStorage.getItem('christmas_playerName') || 'Host';
          localStorage.setItem('christmas_playerName', savedName);
          localStorage.setItem('christmas_role', 'host');
          localStorage.setItem('christmas_roomCode', roomCode);
          localStorage.setItem('christmas_hostToken', hostToken);
          sessionStorage.setItem(`host_${roomCode}`, 'true');
          sessionStorage.setItem('just_created_room', roomCode); // Mark as just connected
          
          // Redirect to room
          goto(`/room/${roomCode}`);
        } else {
          checkedForRoom = false; // Reset if no room found
        }
      });
    } catch (error) {
      console.error('[Layout] Error checking for active room:', error);
      checkedForRoom = false; // Reset on error
    }
  }

  // Check for active room when auth and socket are ready
  // Skip this check for public pages like guessing game - MUST check path FIRST
  $: {
    // CRITICAL: Check if we're on a public page FIRST before ANY auth store access
    // This prevents any auth-related reactive logic from running on guessing game routes
    if (browser) {
      const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
      const isPublicPage = currentPath && currentPath.startsWith('/guess/');
      
      // EARLY EXIT: Do not run ANY auth checks on public pages like guessing game
      // Don't even access auth stores if we're on a public page
      if (!isPublicPage) {
        // Only proceed with auth checks if NOT on a public page
        if ($authUser && $connected && $socket && !isRedirecting) {
          // Small delay to ensure everything is initialized
          setTimeout(() => {
            checkAndRedirectToActiveRoom();
          }, 500);
        } else if (!$authUser || !$connected) {
          // Reset check flag when disconnected or logged out
          checkedForRoom = false;
          isRedirecting = false;
        }
      }
      // If isPublicPage is true, do nothing - no auth checks, no redirects
    }
  }

  // Check when route changes (but skip if already checked)
  // CRITICAL: Check for public pages FIRST to prevent any auth-related logic
  $: {
    const path = $page.url.pathname;
    
    // Skip ALL processing for public pages like guessing game
    // Only proceed with route checks if NOT on a public page
    if (!path.startsWith('/guess/')) {
      // Reset check flag when navigating to non-room pages
      if (!path.startsWith('/room/') && !path.startsWith('/play/') && !path.startsWith('/host/')) {
        // Small delay before checking again (to avoid race conditions)
        setTimeout(() => {
          if (!$page.url.pathname.startsWith('/auth/')) {
            checkedForRoom = false;
          }
        }, 100);
      }
    }
  }
  
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
