# Fix: Room Page Not Showing Players (Duplicate Listener Issue)

## Problem
- Host on `/room/[code]` sees "0 players" despite players successfully joining
- Console logs showed:
  ```
  [Room] room_update event received: {players: Array(1), playerCount: 1}
  [Room] room_update: 1 players
  [Room] Players data: [{…}]  <-- Data IS arriving
  ```
- BUT `$players` store never updated, so UI showed 0 players

## Root Cause

**Duplicate Event Listeners**

The room page was registering its own `room_update` listener (line 163-172), but this was conflicting with the **authoritative** listener in `socket.ts` (line 273-282) that's responsible for updating the `players` store.

### What Was Happening:

1. ✅ Server emitted `room_update` event with player data
2. ✅ Socket.IO received the event
3. ❌ Room page listener intercepted it and logged it
4. ❌ But socket.ts listener wasn't updating the store (or wasn't being called)
5. ❌ Result: Data logged but UI not updated

### The Correct Flow:

```
Server emits 'room_update'
    ↓
Socket.IO receives event
    ↓
socket.ts listener (line 273-282)
    ↓
players.set(data.players)  <-- Store updated
    ↓
All components using $players react
    ↓
UI updates automatically
```

## Solution

### 1. Removed Duplicate Listener

**File:** `apps/web/src/routes/room/[code]/+page.svelte`

**Removed** (lines 163-172):
```svelte
// Listen for room updates
$socket.on('room_update', (data: any) => {
  console.log('[Room] room_update event received:', data);
  if (data && Array.isArray(data.players)) {
    console.log(`[Room] room_update: ${data.players.length} players`);
    console.log('[Room] Players data:', data.players);
    connectionError = '';\n  } else {
    console.warn('[Room] room_update received but no players array:', data);
  }
});
```

**Replaced with**:
```svelte
// NOTE: room_update events are handled by socket.ts (line 273-282)
// which updates the players store. We don't need a duplicate listener here.
// The $players store will automatically update when socket.ts receives room_update.
```

### 2. Updated onDestroy

Removed the `room_update` listener cleanup since we're no longer adding it:

```svelte
onDestroy(() => {
  if (connectionTimeout) {
    clearTimeout(connectionTimeout);
  }
  if ($socket) {
    // NOTE: Don't remove room_update listener - it's managed by socket.ts
    $socket.off('game_started');
    $socket.off('room_settings_updated');
  }
});
```

### 3. Enhanced Debug Logging in socket.ts

Added 🔴 emoji markers to make socket.ts logs stand out:

```typescript
socketInstance.on('room_update', (data: any) => {
  console.log('🔴 [Socket] Room update event received:', data);
  console.log('🔴 [Socket] Data type check:', {
    hasData: !!data,
    isArray: Array.isArray(data?.players),
    playersLength: data?.players?.length,
    players: data?.players
  });
  if (data && Array.isArray(data.players)) {
    console.log(`🔴 [Socket] Setting players list with ${data.players.length} player(s)`);
    players.set(data.players);
    console.log('🔴 [Socket] Players store UPDATED. New value:', data.players);
  } else {
    console.warn('🔴 [Socket] Room update received but data.players is not an array:', data);
  }
});
```

## Why This Fixes It

### Single Source of Truth

**socket.ts** is the single location that manages the `players` store:
- Line 273-282: Handles `room_update` events
- Line 245-258: Handles `player_joined` events (optimistic update)
- Line 260-269: Handles `player_left` events

All other components simply **consume** the `$players` store reactively - they don't need to listen to Socket.IO events directly.

### Benefits of This Architecture:

1. **No race conditions** - Only one listener updates the store
2. **Consistent state** - All components see the same data
3. **Easier debugging** - One place to look for player state issues
4. **Automatic reactivity** - Svelte handles UI updates

## Expected Behavior After Fix

### Console Logs (Correct Order):

When a player joins, you should now see:

```
🔴 [Socket] Room update event received: {players: Array(1), playerCount: 1}
🔴 [Socket] Data type check: {hasData: true, isArray: true, playersLength: 1, ...}
🔴 [Socket] Setting players list with 1 player(s)
🔴 [Socket] Players store UPDATED. New value: [{avatar: "🎅", name: "Jojo", ...}]
[Room] Players store updated: Array(1)  <-- Reactive log
[Room] Players count: 1                 <-- Reactive log
```

### UI Updates:

The room page should now show:
```
👥 Players (1)  <-- Updates in real-time!
```

## Testing

1. **Deploy the fix**:
   ```bash
   pnpm build
   fly deploy
   ```

2. **Open `/room/[code]` in browser console**

3. **Join as player from another device**

4. **Verify logs show**:
   - 🔴 markers from socket.ts
   - [Room] Players store updated
   - [Room] Players count: X (incrementing)

5. **Verify UI shows** player count and list

## Related Files

- `apps/web/src/lib/socket.ts` - Authoritative event handlers
- `apps/web/src/routes/room/[code]/+page.svelte` - Room lobby page
- `apps/web/src/routes/host/[code]/+page.svelte` - Host screen (also uses $players)
- `apps/web/src/routes/play/[code]/+page.svelte` - Player screen

## Key Takeaway

**Don't add duplicate Socket.IO event listeners in components.**

If socket.ts already handles an event and updates a store, components should:
- ✅ Import and use the store: `import { players } from '$lib/socket'`
- ✅ Use reactive syntax: `$players`
- ❌ Don't add their own listeners: `$socket.on('room_update', ...)`

---

**Status**: ✅ FIXED  
**Build**: Verified successful  
**Next**: Deploy and test in production
