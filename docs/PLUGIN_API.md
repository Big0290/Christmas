# Plugin API Reference

## Overview

This document provides a complete reference for the Plugin API used to create new games for the Christmas Party Game Suite.

## GamePlugin Interface

All game plugins must implement the `GamePlugin` interface:

```typescript
interface GamePlugin<TState extends BaseGameState = BaseGameState> {
  gameType: string;
  initialState: (players: Map<string, Player>, settings: any) => TState;
  
  init: (context: PluginContext<TState>) => void;
  cleanup: (context: PluginContext<TState>) => void;
  
  onIntent: (intent: Intent, context: PluginContext<TState>) => IntentResult;
  validateIntent: (intent: Intent, context: PluginContext<TState>) => boolean;
  
  serializeState: (state: TState, playerId: string) => any;
  getRenderDescriptor: (state: TState) => RenderDescriptor;
}
```

## PluginContext

The `PluginContext` provides access to game state and utilities:

```typescript
interface PluginContext<TState extends BaseGameState> {
  roomCode: string;
  players: Map<string, Player>;
  currentState: TState;
  dispatch: (event: any) => void;
  broadcast: (state: TState, eventName?: string) => void;
  log: (...args: any[]) => void;
  transitionFSM: (event: string) => FSMState;
}
```

## Required Methods

### `init(context: PluginContext)`

Called when the plugin is initialized. Use this to:
- Set up initial game state
- Load game-specific data
- Initialize timers or intervals

**Example:**
```typescript
init(context: PluginContext): void {
  this.gameState = {
    gameType: GameType.MY_GAME,
    state: GameState.LOBBY,
    round: 0,
    maxRounds: 5,
    startedAt: 0,
    scores: {},
  };
  context.log(`[MyGamePlugin] Initialized for room ${context.roomCode}`);
}
```

### `onIntent(intent: Intent, context: PluginContext): IntentResult`

Handle player intents. This is where game logic processes player actions.

**Parameters:**
- `intent`: The intent submitted by the player
- `context`: Plugin context with room state and utilities

**Returns:** `IntentResult` with success status and event ID

**Example:**
```typescript
async onIntent(intent: Intent, context: PluginContext): Promise<IntentResult> {
  if (!this.validateIntent(intent, context)) {
    return {
      success: false,
      intentId: intent.id,
      error: 'Invalid intent',
    };
  }

  switch (intent.action) {
    case 'answer':
      return this.handleAnswer(intent, context);
    default:
      return {
        success: false,
        intentId: intent.id,
        error: 'Unknown action',
      };
  }
}
```

### `validateIntent(intent: Intent, context: PluginContext): boolean`

Validate an intent before processing. Check:
- Game state allows the action
- Player is in the game
- Action data is valid
- Timing constraints

**Example:**
```typescript
validateIntent(intent: Intent, context: PluginContext): boolean {
  // Check game is in playing state
  if (context.currentState.state !== GameState.PLAYING) {
    return false;
  }

  // Check player exists
  if (!context.players.has(intent.playerId)) {
    return false;
  }

  // Check action-specific validation
  if (intent.action === 'answer') {
    const answerIndex = intent.data?.answerIndex;
    if (typeof answerIndex !== 'number' || answerIndex < 0) {
      return false;
    }
  }

  return true;
}
```

### `serializeState(state: TState, playerId: string): any`

Serialize game state for a specific player. Can filter or personalize state.

**Example:**
```typescript
serializeState(state: TState, playerId: string): any {
  // Return full state for host, filtered for players
  const isHost = this.isHost(playerId);
  
  if (isHost) {
    return state; // Full state
  } else {
    // Filtered state for players
    return {
      ...state,
      // Hide sensitive information
      correctAnswer: undefined,
    };
  }
}
```

### `getRenderDescriptor(state: TState): RenderDescriptor`

Define how the game should be rendered on the host display.

**Example:**
```typescript
getRenderDescriptor(state: TState): RenderDescriptor {
  return {
    layout: 'grid',
    components: [
      {
        type: 'question-display',
        position: { x: 0, y: 0, width: 100, height: 60 },
        props: { question: state.currentQuestion },
      },
      {
        type: 'answer-options',
        position: { x: 0, y: 60, width: 100, height: 40 },
        props: { options: state.options },
      },
    ],
    config: {
      gridColumns: 1,
      gridRows: 2,
    },
  };
}
```

### `cleanup(context: PluginContext): void`

Clean up resources when the game ends or room is destroyed.

**Example:**
```typescript
cleanup(context: PluginContext): void {
  // Clear timers
  if (this.timer) {
    clearInterval(this.timer);
    this.timer = null;
  }

  // Reset state
  this.gameState = null;
  
  context.log(`[MyGamePlugin] Cleaned up for room ${context.roomCode}`);
}
```

## RenderDescriptor

The `RenderDescriptor` defines the UI layout:

```typescript
interface RenderDescriptor {
  layout: 'grid' | 'canvas' | 'list' | 'scoreboard' | 'custom';
  components: RenderComponent[];
  config?: Record<string, any>;
}

interface RenderComponent {
  type: string;
  position?: {
    x: number;
    y: number;
    width?: number;
    height?: number;
  };
  props?: Record<string, any>;
}
```

### Layout Types

- **grid**: Grid-based layout with rows and columns
- **canvas**: Canvas-based layout for drawing games
- **list**: List-based layout for text-based games
- **scoreboard**: Scoreboard layout for score display
- **custom**: Custom layout with absolute positioning

## Intent Types

Standard intent types:

- `PLAYER_ANSWER`: Player submits an answer
- `PLAYER_MOVE`: Player moves (for movement-based games)
- `PLAYER_PICK`: Player picks an item
- `PLAYER_VOTE`: Player votes
- `PLAYER_GUESS`: Player makes a guess
- `PLAYER_MARK`: Player marks something (e.g., bingo)
- `PLAYER_UPGRADE`: Player upgrades something

## Best Practices

1. **Always validate intents** before processing
2. **Use FSM states** to control game flow
3. **Increment room version** on state changes
4. **Generate events** for all processed intents
5. **Clean up resources** in cleanup method
6. **Log important events** for debugging
7. **Handle errors gracefully** with clear error messages

## Examples

See `docs/PLUGIN_DEVELOPMENT.md` for complete examples and step-by-step guides.

## Type Definitions

All types are exported from `@christmas/core`:

- `GamePlugin`
- `PluginContext`
- `RenderDescriptor`
- `Intent`
- `IntentResult`
- `BaseGameState`
- `GameType`
- `GameState`
- `FSMState`

