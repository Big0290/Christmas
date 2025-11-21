# Direct Socket Emit Audit - Bypassing SyncEngine ACK System

## 🔴 CRITICAL ISSUES - Direct emits that bypass ACK tracking

### ✅ FIXED - `room_update` fallback emits
- **Location**: `apps/server/src/socket/host-handlers.ts:462` ✅ FIXED
  - Removed fallback emit, SyncEngine handles fallbacks internally
  
- **Location**: `apps/server/src/socket/player-handlers.ts:289` ✅ FIXED
  - Removed fallback emit, SyncEngine handles errors internally

### ✅ FIXED - Direct SyncEngine calls
- **Location**: `apps/server/src/socket/handlers.ts:253, 258, 270` ✅ FIXED
  - Replaced direct `syncEngine.syncPlayers()` and `syncEngine.syncState()` calls with RoomEngine methods

## ⚠️ POTENTIAL ISSUES - Notification events (should verify)

### 2. `player_joined` notification
- **Location**: `apps/server/src/socket/player-handlers.ts:192`
- **Status**: Notification event, player list synced separately via SyncEngine
- **Action**: OK - notification events don't need ACK tracking

### 3. `player_left` notification
- **Location**: `apps/server/src/socket/host-handlers.ts:1108`
- **Status**: Notification event, player list synced separately via SyncEngine
- **Action**: OK - notification events don't need ACK tracking

### 4. `game_started` notification
- **Location**: `apps/server/src/socket/host-handlers.ts:888`
- **Status**: Notification event, state synced separately via SyncEngine
- **Action**: OK - notification events don't need ACK tracking

### 5. `game_ended` notification
- **Location**: `apps/server/src/socket/host-handlers.ts:989, 1016`
- **Status**: Notification event, state synced separately via SyncEngine
- **Action**: OK - notification events don't need ACK tracking

## 📋 SETTINGS/UI EVENTS (Review needed)

### 6. `room_settings_updated`
- **Location**: `apps/server/src/socket/host-handlers.ts:1803`
- **Status**: Settings update, might need ACK tracking for consistency
- **Action**: REVIEW - Consider adding ACK tracking if settings are critical

### 7. `jukebox_state`
- **Location**: `apps/server/src/socket/host-handlers.ts:487, 1917`
- **Status**: UI state, not critical game state
- **Action**: OK - UI state doesn't need ACK tracking

### 8. `sound_event`
- **Location**: `apps/server/src/socket/handlers.ts:406`
- **Status**: Also handled by SyncEngine's handleStateTransitions
- **Action**: REVIEW - Duplicate emit, SyncEngine should handle this

### 9. `bingo_item_called`
- **Location**: `apps/server/src/socket/handlers.ts:463`
- **Status**: UI notification, state synced separately via SyncEngine
- **Action**: OK - UI notification doesn't need ACK tracking

## ✅ OK - Error/Notification events (no ACK needed)

- `error` - Error messages
- `kicked_from_room` - Notification
- `player_reconnected` - Notification
- `player_disconnected` - Notification
- `host_left` - Notification
- `room_deleted` - Notification
- `connection_keepalive_ack` - Keep-alive response

## Summary

**Must Fix:**
1. Remove fallback `room_update` emits in host-handlers.ts and player-handlers.ts
2. Let SyncEngine handle all fallbacks internally

**Review:**
1. Consider if `room_settings_updated` needs ACK tracking
2. Remove duplicate `sound_event` emit (SyncEngine handles it)

**OK:**
- Notification events (player_joined, player_left, game_started, game_ended)
- UI state events (jukebox_state, bingo_item_called)
- Error/notification events

