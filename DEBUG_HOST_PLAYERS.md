# Debugging: Host Cannot See Active Players

## Problem
The host screen is not displaying the list of connected players in the room.

## Quick Diagnostic Steps

### Step 1: Check Browser Console Logs

Open the **host screen** (`/host/[code]`) and open the browser console (F12 or Cmd+Option+I).

Look for these specific log messages:

#### ✅ Good Signs:
```
[Socket] Connected
[Host] Component mounted, connecting socket...
[Host] Socket connected, attempting host reconnect...
[Host] Reconnect response: {success: true, room: {...}}
[Host] Set X player(s) from reconnect response
[Room] Emitted room_update to room XXXX with X player(s)
[Socket] Room update event received: {players: Array(X), playerCount: X}
[Socket] Setting players list with X player(s)
```

#### ❌ Bad Signs:
```
[Host] ❌ Reconnect failed: Invalid host token
[Host] Socket not connected
[Socket] Connection timeout
```

### Step 2: Check if Players Store Has Data

In the browser console on the **host screen**, run:

```javascript
// Import the stores (they're in window for debugging)
// Check current players value
console.log('Players in store:', window.__svelte_stores__?.players?.value);
```

Or add this temporary code to `HostLobbyScreen.svelte`:

```svelte
<script lang="ts">
  import { players } from '$lib/socket';
  import { goto } from '$app/navigation';
  import { t } from '$lib/i18n';

  export let roomCode: string;
  
  // TEMPORARY DEBUG
  $: console.log('[HostLobby] Players store value:', $players);
  $: console.log('[HostLobby] Players count:', $players.length);
</script>
```

### Step 3: Check Server Logs

In the **server terminal** (where you ran `pnpm dev:server`), check for:

#### ✅ Good Signs:
```
[Room] Host reconnected to XXXX, socket abc123 joined room, 3 player(s)
[Room] Emitted room_update to room XXXX with 3 player(s)
[Room] Socket rooms before: abc123, after: abc123,XXXX
```

#### ❌ Bad Signs:
```
[Room] ❌ Invalid host token
[Room] ❌ Room not found
```

---

## Common Issues & Fixes

### Issue 1: Host Token Missing/Invalid

**Symptoms:**
- Console shows: `[Host] ❌ Reconnect failed: Invalid host token`
- Players list is empty

**Fix:**
Go back to the room page first (`/room/[code]`) to regenerate the host token, then navigate to `/host/[code]`.

**Root Cause:**
The host token is stored in `localStorage` as `christmas_hostToken`. If it's missing or expired, the host cannot reconnect.

---

### Issue 2: Socket Not Connected

**Symptoms:**
- Console shows: `[Host] Socket not connected`
- No `room_update` events are received

**Fix:**
1. Refresh the page
2. Check that the server is running (`pnpm dev:server`)
3. Check for CORS issues in console

**Root Cause:**
Socket.IO connection failed to establish.

---

### Issue 3: Room Update Events Not Reaching Client

**Symptoms:**
- Server logs show: `[Room] Emitted room_update...`
- Client console shows NO `[Socket] Room update event received:`

**Fix:**
Check if socket event listeners are properly registered. Look for:
```
[Socket] Registering event listeners
```

If missing, the socket listeners weren't set up properly.

---

### Issue 4: Players Store Not Updating

**Symptoms:**
- Console shows: `[Socket] Room update event received: {players: Array(3), playerCount: 3}`
- Console shows: `[Socket] Setting players list with 3 player(s)`
- BUT the UI still shows 0 players

**Fix:**
This indicates a Svelte reactivity issue. Try:

1. **Check if store is being imported correctly** in `HostLobbyScreen.svelte`:
   ```svelte
   import { players } from '$lib/socket';
   ```

2. **Verify the store subscription is working**:
   Add this to the component:
   ```svelte
   <script>
     import { players } from '$lib/socket';
     let playersArray = [];
     $: playersArray = $players;
     $: console.log('Reactive update:', playersArray);
   </script>
   ```

---

## Quick Fix: Force Refresh Players

Add this button to `HostLobbyScreen.svelte` for testing:

```svelte
<button on:click={() => {
  console.log('Current players:', $players);
  if ($socket) {
    $socket.emit('get_room_state', roomCode, (response) => {
      console.log('Room state:', response);
    });
  }
}}>
  🔍 Debug Players
</button>
```

---

## Code Inspection Points

### 1. Check `socket.ts` - Line 273-282

Verify `room_update` listener is registered:

```typescript
socketInstance.on('room_update', (data: any) => {
  console.log('[Socket] Room update event received:', data);
  if (data && Array.isArray(data.players)) {
    console.log(`[Socket] Setting players list with ${data.players.length} player(s)`);
    players.set(data.players);  // <-- This should update the store
  } else {
    console.warn('[Socket] Room update received but data.players is not an array:', data);
  }
});
```

### 2. Check `/host/[code]/+page.svelte` - Line 401-430

The `room_update` handler logs the data:

```svelte
($socket as any).on('room_update', (data: any) => {
  console.log('[Host] Room update received:', data);
  if (data && Array.isArray(data.players)) {
    console.log(`[Host] Room update: ${data.players.length} player(s) in room`);
  }
});
```

### 3. Check Server `handlers.ts` - Lines 361-365

After host reconnects, server should emit:

```typescript
io.to(codeNormalized).emit('room_update', {
  players: Array.from(room.players.values()),
  playerCount: room.players.size,
});
```

---

## Testing Steps

1. **Start fresh:**
   ```bash
   pnpm dev:server  # Terminal 1
   pnpm dev:web     # Terminal 2
   ```

2. **Create a room:**
   - Go to `http://localhost:5173`
   - Click "Create Room"
   - Note the room code (e.g., `AB12`)

3. **Join as player (different device/browser):**
   - Open `http://localhost:5173` in a different browser/incognito window
   - Click "Join Room"
   - Enter room code `AB12`
   - Enter player name
   - Click Join

4. **Check host screen:**
   - Go back to the first browser
   - Click "Start as Host" or navigate to `/host/AB12`
   - Check browser console for logs
   - Check if player appears in the UI

5. **Monitor both consoles:**
   - Browser console (F12)
   - Server terminal

---

## Temporary Debug Component

Create `apps/web/src/lib/components/DebugPlayersPanel.svelte`:

```svelte
<script lang="ts">
  import { players, connected, socket } from '$lib/socket';
  
  let debugInfo = '';
  
  function refresh() {
    debugInfo = JSON.stringify({
      connected: $connected,
      socketId: $socket?.id,
      playersCount: $players.length,
      players: $players.map(p => ({ name: p.name, id: p.id.substring(0, 8) }))
    }, null, 2);
  }
  
  $: refresh(), $players, $connected;
</script>

<div class="debug-panel">
  <h3>🔍 Debug Info</h3>
  <pre>{debugInfo}</pre>
  <button on:click={refresh}>Refresh</button>
</div>

<style>
  .debug-panel {
    position: fixed;
    bottom: 100px;
    right: 20px;
    background: rgba(0,0,0,0.9);
    color: #0f0;
    padding: 1rem;
    border-radius: 8px;
    font-family: monospace;
    font-size: 12px;
    max-width: 400px;
    z-index: 9999;
  }
  pre {
    margin: 10px 0;
    white-space: pre-wrap;
  }
  button {
    background: #0f0;
    color: #000;
    padding: 5px 10px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
</style>
```

Add to `host/[code]/+page.svelte`:

```svelte
<script>
  // ... existing imports
  import DebugPlayersPanel from '$lib/components/DebugPlayersPanel.svelte';
</script>

<!-- At the end of the template -->
{#if browser && import.meta.env.DEV}
  <DebugPlayersPanel />
{/if}
```

---

## Expected Behavior

When working correctly, you should see:

1. **Host navigates to `/host/[code]`**
2. Socket connects within 1-2 seconds
3. Host reconnects with token
4. Server emits `room_update` with current players
5. Client receives `room_update` and updates `players` store
6. UI reactively displays players from `$players`
7. When new player joins, another `room_update` is broadcast
8. UI updates to show new player

---

## Still Not Working?

If none of the above helps, please check:

1. **Browser console** - Copy all `[Socket]` and `[Host]` logs
2. **Server terminal** - Copy all `[Room]` and `[Socket]` logs
3. **Network tab** - Check if WebSocket connection is established (Filter: WS)
4. **localStorage** - Check if `christmas_hostToken` and `christmas_roomCode` exist

Share these logs for further debugging.
