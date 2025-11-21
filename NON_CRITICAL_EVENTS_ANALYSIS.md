# Non-Critical Events Analysis - ACK Tracking Assessment

## Current Non-Critical Events (No ACK Tracking)

### 1. `room_settings_updated` ⚠️ **SHOULD CONSIDER ACK TRACKING**
**Location**: `apps/server/src/socket/host-handlers.ts:1794`
**What it includes:**
- Room name
- Room description  
- Theme settings (backgroundMusic, snowEffect, sparkles, icicles, frostPattern, colorScheme)
- Language settings

**Impact if missed:**
- ❌ Players see different themes/colors
- ❌ Players see different room names
- ❌ Language mismatch between host and players
- ❌ Inconsistent UI experience

**Recommendation**: **CONSIDER ACK TRACKING**
- Not game-critical, but affects UX consistency
- Multiple clients need synchronized settings
- If a client misses an update, they'll have inconsistent UI
- Could be added to SyncEngine with a separate event type (`settings_update`)

### 2. `jukebox_state` ✅ **OK - No ACK Needed**
**Location**: `apps/server/src/socket/host-handlers.ts:478, 1908`
**What it includes:**
- Current track
- Play/pause state
- Shuffle/repeat settings
- Volume
- Progress

**Impact if missed:**
- ⚠️ Jukebox UI might be out of sync
- ✅ Not critical - purely UI state
- ✅ Can resync on next update

**Recommendation**: **OK - No ACK needed**
- Purely UI state
- Not critical for game functionality
- Can tolerate occasional misses

### 3. `sound_event` ✅ **OK - Handled by SyncEngine**
**Location**: `apps/server/src/socket/handlers.ts:402` (duplicate), `apps/server/src/engine/sync-engine.ts:1248` (primary)
**What it includes:**
- Sound type (gameStart, roundEnd, gameEnd)
- Timestamp

**Impact if missed:**
- ⚠️ Sound might not play
- ✅ Not critical - audio feedback only
- ✅ Already handled by SyncEngine.handleStateTransitions()

**Recommendation**: **OK - Already tracked indirectly**
- Handled by SyncEngine when state transitions occur
- Duplicate emit in handlers.ts is redundant but harmless
- Could remove duplicate for cleanliness

### 4. `bingo_item_called` ✅ **OK - No ACK Needed**
**Location**: `apps/server/src/socket/handlers.ts:459`
**What it includes:**
- Current bingo item
- Call number

**Impact if missed:**
- ⚠️ UI might not show current item immediately
- ✅ Actual state synced via SyncEngine with ACK tracking
- ✅ This is just a UI notification for immediate feedback

**Recommendation**: **OK - No ACK needed**
- UI notification only
- Actual state (`currentItem`) synced via SyncEngine with ACK
- Can tolerate occasional misses

### 5. Notification Events ✅ **OK - No ACK Needed**
**Events:**
- `game_started` - Notification, state synced separately ✅
- `game_ended` - Notification, state synced separately ✅
- `player_joined` - Notification, player list synced separately ✅
- `player_left` - Notification, player list synced separately ✅
- `player_reconnected` - Notification ✅
- `player_disconnected` - Notification ✅
- `host_left` - Notification ✅
- `room_deleted` - Notification ✅
- `kicked_from_room` - Notification ✅

**Impact if missed:**
- ⚠️ UI might not update immediately
- ✅ Actual state synced via SyncEngine with ACK tracking
- ✅ These are just notifications, not state

**Recommendation**: **OK - No ACK needed**
- Pure notifications
- Actual state synced separately with ACK tracking
- Can tolerate occasional misses

### 6. Error Events ✅ **OK - No ACK Needed**
**Event**: `error`
**What it includes:**
- Error message

**Impact if missed:**
- ⚠️ User might not see error
- ✅ Errors are typically followed by state updates
- ✅ Can retry operations

**Recommendation**: **OK - No ACK needed**
- Error messages don't need ACK tracking
- Usually followed by state updates

## Summary & Recommendations

### ✅ Current State is Good
Most non-critical events don't need ACK tracking because:
1. They're notifications (actual state synced separately)
2. They're UI-only (can tolerate occasional misses)
3. They're already handled by SyncEngine indirectly

### ⚠️ Potential Improvement: `room_settings_updated`

**Consider adding ACK tracking for `room_settings_updated`** because:
- Affects UX consistency across clients
- Multiple clients need synchronized settings
- Missing updates cause inconsistent UI
- Not game-critical but important for user experience

**Implementation options:**
1. Add to SyncEngine as a new event type (`settings_update`)
2. Include version tracking and ACK system
3. Resync on reconnect if missed

**Priority**: Medium (nice to have, not critical)

## Conclusion

**Current architecture is sound:**
- ✅ Critical state has ACK tracking
- ✅ Non-critical events are appropriately categorized
- ⚠️ `room_settings_updated` could benefit from ACK tracking for UX consistency

**Recommendation**: 
- Keep current architecture (it's working well)
- Consider adding ACK tracking for `room_settings_updated` as a future enhancement
- Remove duplicate `sound_event` emit in handlers.ts for cleanliness

