# Refactoring Games to Use Plugin API Directly

## Overview

This document explains how to refactor games from the wrapper/adapter pattern to use `PluginGameEngine` directly. This simplifies the architecture by eliminating wrapper layers.

## Current Architecture (Wrapper Pattern)

```
BaseGameEngine → GameFSMWrapper → Adapter → Game
```

**Issues:**
- 3 layers of indirection
- Wrapper overhead
- Complex state synchronization
- Harder to understand and maintain

## New Architecture (Plugin API)

```
PluginGameEngine → Game (implements plugin interface directly)
```

**Benefits:**
- Single layer (game extends PluginGameEngine)
- Built-in FSM management
- Direct plugin interface implementation
- Cleaner, more maintainable code

## Migration Steps

### Step 1: Update Imports

**Before:**
```typescript
import { BaseGameEngine, GameType, GameState, ... } from '@christmas/core';
```

**After:**
```typescript
import { 
  PluginGameEngine, 
  GameType, 
  GameState, 
  Room,
  RenderDescriptor,
  ... 
} from '@christmas/core';
```

### Step 2: Change Base Class

**Before:**
```typescript
export class TriviaRoyaleGame extends BaseGameEngine<TriviaGameState> {
  constructor(
    players: Map<string, Player>,
    customQuestions?: TriviaQuestion[],
    settings?: TriviaRoyaleSettings
  ) {
    super(GameType.TRIVIA_ROYALE, players);
    // ...
  }
}
```

**After:**
```typescript
export class TriviaRoyaleGame extends PluginGameEngine<TriviaGameState> {
  constructor(
    players: Map<string, Player>,
    roomCode: string,  // NEW: roomCode required
    customQuestions?: TriviaQuestion[],
    settings?: TriviaRoyaleSettings
  ) {
    super(GameType.TRIVIA_ROYALE, players, roomCode);  // NEW: pass roomCode
    // ...
  }
}
```

### Step 3: Rename handlePlayerAction

**Before:**
```typescript
handlePlayerAction(playerId: string, action: string, data: any): void {
  // Game logic here
}
```

**After:**
```typescript
protected handlePlayerActionImpl(playerId: string, action: string, data: any): void {
  // Game logic here (same code, just renamed)
}
```

### Step 4: Implement Plugin Interface Methods

Add these required methods:

```typescript
// Initialize plugin (called when room is set)
init(roomState: Room): void {
  console.log(`[TriviaRoyaleGame] Initialized for room ${roomState.code}`);
}

// Get render descriptor for display layouts
getRenderDescriptor(): RenderDescriptor {
  return {
    layout: 'grid',
    components: [
      {
        type: 'question-display',
        position: { x: 0, y: 0, width: 100, height: 60 },
        props: {},
      },
      // ... more components
    ],
    config: {
      gridColumns: 1,
      gridRows: 2,
    },
  };
}
```

### Step 5: Optional - Override Plugin Methods

You can override these for custom behavior:

```typescript
// Custom intent validation
validate(intent: Intent, ctx: PluginContext): boolean {
  // Add custom validation logic
  return super.validate(intent, ctx) && /* your checks */;
}

// Custom intent handling
async onIntent(intent: Intent, ctx: PluginContext): Promise<IntentResult> {
  // Custom intent processing
  // Default implementation delegates to handlePlayerActionImpl
  return super.onIntent(intent, ctx);
}
```

## What PluginGameEngine Provides

### Built-in Features

1. **FSM Management**
   - Automatic FSM state transitions
   - FSM state history tracking
   - FSM transition event emission

2. **State Synchronization**
   - Automatic FSM sync on state changes
   - Built-in transition validation

3. **Plugin Interface**
   - Intent processing
   - State serialization
   - Render descriptor support

4. **Lifecycle Hooks**
   - `start()` - transitions FSM and starts game
   - `end()` - transitions FSM and ends game
   - `pause()` / `resume()` - handled automatically
   - `nextRound()` - handles FSM transitions

## Example: Complete Migration

See `apps/server/src/games/trivia-royale.ts` for a complete example of a migrated game.

## Redis Pub/Sub

**Current Status:** Redis is NOT used in the codebase.

**When Redis Would Be Needed:**
- Horizontal scaling (multiple server instances)
- Shared state across instances
- Cross-instance Socket.IO pub/sub

**Current Architecture:**
- Single-instance deployment
- In-memory state management
- Direct Socket.IO communication

**Recommendation:** 
- Keep current architecture for now
- Add Redis only when horizontal scaling is needed
- Use Redis adapter for Socket.IO when scaling

## Migration Checklist

- [x] Create `PluginGameEngine` base class
- [x] Migrate `TriviaRoyaleGame` as example
- [ ] Migrate `BingoGame`
- [ ] Migrate `PriceIsRightGame`
- [ ] Migrate `NaughtyOrNiceGame`
- [ ] Migrate `EmojiCarolGame`
- [ ] Update `GameFactory` to use new pattern
- [ ] Remove adapter classes (after all games migrated)
- [ ] Remove `GameFSMWrapper` (after all games migrated)
- [ ] Update documentation

## Backward Compatibility

The refactor maintains backward compatibility:
- Legacy games still work with wrapper pattern
- `GameFactory` supports both patterns
- Gradual migration is possible

## Benefits Summary

1. **Simpler Architecture**: 1 layer instead of 3
2. **Better Performance**: No wrapper overhead
3. **Easier Maintenance**: Games are self-contained
4. **Direct Control**: Games control FSM directly
5. **Cleaner Code**: Less indirection, clearer intent

