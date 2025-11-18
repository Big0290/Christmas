# Fix: Host Cannot See Active Players

## Problem
When the game starts on the host screen, the browser console showed:
```
Uncaught (in promise) ReferenceError: Cannot access 'X' before initialization
```

This caused the host page to crash and prevented players from being displayed.

## Root Cause
**Temporal Dead Zone (TDZ) Error** in `apps/web/src/routes/host/[code]/+page.svelte`

The issue was that reactive variables were being declared using reactive statements (`$:`) without first declaring them as regular `let` variables. This created a situation where:

1. Svelte tried to create reactive statements that referenced each other
2. Some variables were used before they were initialized
3. JavaScript's TDZ rules prevented access to these variables

### Problematic Code (Before):
```svelte
<script>
  // ... other declarations ...
  
  // These were declared using reactive statements ONLY
  $: currentState = $gameState?.state;
  $: currentGameType = $gameState?.gameType;
  $: scoreboard = $gameState?.scoreboard || [];
  $: round = $gameState?.round || 0;
  $: maxRounds = $gameState?.maxRounds || 0;
  $: startedAt = $gameState?.startedAt || 0;
  
  // These depended on the above variables
  $: isGameActive = currentState === GameState.PLAYING || ...;
  $: canPause = currentState === GameState.PLAYING && !isPaused;
  $: canResume = currentState === GameState.PAUSED || isPaused;
  
  // This was declared later in the file
  let confirmActionRef: (() => void) | null = null;
</script>
```

## Solution
Declare all variables with `let` statements **before** using them in reactive statements:

### Fixed Code (After):
```svelte
<script>
  // ... other declarations ...
  
  // Declare derived variables before reactive statements to avoid TDZ errors
  let currentState: GameState | undefined = undefined;
  let currentGameType: GameType | null = null;
  let scoreboard: any[] = [];
  let round = 0;
  let maxRounds = 0;
  let startedAt = 0;
  let isGameActive = false;
  let canPause = false;
  let canResume = false;
  let confirmActionRef: (() => void) | null = null;
  
  // Now reactive statements can safely update these variables
  $: currentState = $gameState?.state;
  $: currentGameType = $gameState?.gameType;
  $: scoreboard = $gameState?.scoreboard || [];
  $: round = $gameState?.round || 0;
  $: maxRounds = $gameState?.maxRounds || 0;
  $: startedAt = $gameState?.startedAt || 0;
  $: isGameActive = currentState === GameState.PLAYING || ...;
  $: canPause = currentState === GameState.PLAYING && !isPaused;
  $: canResume = currentState === GameState.PAUSED || isPaused;
</script>
```

## Changes Made

### File: `apps/web/src/routes/host/[code]/+page.svelte`

1. **Added variable declarations** (line 50-60):
   - Declared all reactive variables with initial values
   - Added type annotations for TypeScript safety

2. **Removed duplicate declaration** (line 688):
   - Removed the duplicate `let confirmActionRef` declaration that was later in the file

## Why This Fixes the Issue

1. **Initialization Order**: By declaring variables with `let` first, JavaScript knows about them before the reactive statements try to use them.

2. **No Circular Dependencies**: The reactive statements now clearly show the dependency chain:
   - `currentState` depends on `$gameState?.state`
   - `isGameActive` depends on `currentState` (which is already declared)

3. **Type Safety**: Added TypeScript types ensure the variables have the correct shape.

## Testing

After this fix:

1. **Build succeeds** without TDZ errors
2. **Host page loads** without crashing
3. **Players display** correctly when they join
4. **Game state updates** work as expected

## Verification Steps

1. Build the project:
   ```bash
   pnpm build
   ```

2. Start the servers:
   ```bash
   pnpm dev:server  # Terminal 1
   pnpm dev:web     # Terminal 2
   ```

3. Test the host screen:
   - Create a room
   - Navigate to `/host/[code]`
   - Check browser console - should see NO TDZ errors
   - Join as player from another device
   - Verify players appear in the host lobby

## Related Issues

This fix also resolves:
- Host screen not showing players in lobby
- Host screen crashing when navigating from room page
- Console errors about undefined variables during game start

## Production Deployment

After this fix, you can safely deploy to production:

```bash
pnpm build
fly deploy
```

The host screen will now work correctly with players displayed.

---

**Status**: ✅ FIXED
**Date**: 2025-11-17
**Build**: Verified successful
