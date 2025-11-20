<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';

  // ============================================================================
  // GUESSING GAME LAYOUT - COMPLETELY PUBLIC ROUTE
  // ============================================================================
  // This layout is specifically for the guessing game routes (/guess/[room]/[challengeId])
  // It ensures NO authentication, socket, or any protected route logic runs.
  // This is a completely public route that ANYONE can access without login.
  //
  // IMPORTANT: This layout completely isolates guessing game routes from parent
  // layout behavior. The parent layout has guards to skip auth for /guess/ paths,
  // but this child layout ensures complete isolation by:
  // 1. Not importing any auth-related stores (authUser, authLoading, etc.)
  // 2. Not initializing any socket connections
  // 3. Not running any auth checks or redirects
  // 4. Providing a clean, minimal layout just for guessing game pages
  //
  // This route must remain public because players don't have login accounts -
  // only hosts authenticate. Players access guessing challenges anonymously.

  onMount(() => {
    if (browser) {
      const currentPath = window.location.pathname;
      
      // Verify we're on a guessing game route (should always be true, but check anyway)
      if (!currentPath.startsWith('/guess/')) {
        console.warn('[Guess Layout] Warning: Layout loaded but path does not start with /guess/:', currentPath);
      } else {
        console.log('[Guess Layout] ✅ Public route confirmed - no auth required:', currentPath);
      }
      
      // Explicitly do nothing else - no auth, no socket, no checks
      // This ensures complete isolation from parent layout's auth/socket logic
    }
  });
</script>

<!-- Minimal layout - completely isolated from parent auth/socket logic -->
<!-- This slot renders guessing game content without any authentication barriers -->
<!-- Players can access this route anonymously - no login required -->
<slot />

