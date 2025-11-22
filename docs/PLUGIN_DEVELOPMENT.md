# Plugin Development Guide

## Overview

This guide explains how to create new game plugins for the Christmas Party Game Suite using the plugin architecture.

## Quick Start

### 1. Generate Plugin Template

Use the CLI tool to generate a plugin template:

```bash
tsx scripts/create-game-plugin.ts my-game TRIVIA_ROYALE
```

This creates:
- `apps/server/src/plugins/my-game/MyGamePlugin.ts`
- `apps/server/src/plugins/my-game/MyGameAdapter.ts`
- `apps/server/src/plugins/my-game/MyGamePlugin.test.ts`

### 2. Implement Plugin Methods

Edit `MyGamePlugin.ts` and implement the required methods.

### 3. Register Plugin

Register your plugin in the game factory or plugin registry.

## Plugin Interface

### Required Methods

#### `init(roomState: Room): void`

Called when plugin is initialized with a room. Use this to:
- Set up initial game state
- Load game-specific data
- Initialize game engine

```typescript
init(roomState: Room): void {
  // Initialize game-specific state
  this.gameState = {
    // ... initial state
  };
}
```

#### `onIntent(intent: Intent, ctx: PluginContext): Promise<IntentResult>`

Handle player intents. This is where game logic processes player actions.

```typescript
async onIntent(intent: Intent, ctx: PluginContext): Promise<IntentResult> {
  // Validate intent
  if (!this.validate(intent, ctx)) {
    return {
      success: false,
      intentId: intent.id,
      error: 'Invalid intent',
    };
  }

  // Process intent
  switch (intent.action) {
    case 'answer':
      return this.handleAnswer(intent, ctx);
    case 'pick':
      return this.handlePick(intent, ctx);
    default:
      return {
        success: false,
        intentId: intent.id,
        error: 'Unknown action',
      };
  }
}
```

#### `validate(intent: Intent, ctx: PluginContext): boolean`

Validate an intent before processing. Default implementation checks basic fields.

```typescript
validate(intent: Intent, ctx: PluginContext): boolean {
  // Basic validation
  if (!super.validate(intent, ctx)) {
    return false;
  }

  // Game-specific validation
  if (ctx.fsmState !== FSMState.ROUND_START) {
    return false; // Can only act during round start
  }

  // Check player is in game
  if (!ctx.players.has(intent.playerId)) {
    return false;
  }

  return true;
}
```

#### `applyEvent(event: GameEvent, ctx: PluginContext): void`

Apply an event to game state. Called when intent is processed and generates an event.

```typescript
applyEvent(event: GameEvent, ctx: PluginContext): void {
  switch (event.type) {
    case 'game_answer':
      // Apply answer event to game state
      this.gameState.answers[event.data.playerId] = event.data.answerIndex;
      break;
    // ... other event types
  }
}
```

#### `serializeState(roomState: Room): BaseGameState`

Serialize game state for synchronization. Return the state object to be sent to clients.

```typescript
serializeState(roomState: Room): BaseGameState {
  const game = this.getGame(roomState);
  if (!game) {
    return {
      gameType: this.gameType,
      state: GameState.LOBBY,
      round: 0,
      maxRounds: 0,
      startedAt: 0,
      scores: {},
    };
  }

  return game.getState();
}
```

#### `cleanup(roomState: Room): void`

Cleanup when game ends or room is destroyed.

```typescript
cleanup(roomState: Room): void {
  // Clean up game-specific resources
  this.gameState = null;
  this.timers.forEach(timer => clearTimeout(timer));
  this.timers = [];
}
```

#### `getRenderDescriptor(): RenderDescriptor`

Define how the game should be rendered on host display.

```typescript
getRenderDescriptor(): RenderDescriptor {
  return {
    layout: 'grid', // or 'canvas', 'list', 'scoreboard', 'custom'
    components: [
      {
        type: 'question-display',
        position: { x: 0, y: 0, width: 100, height: 60 },
        props: {},
      },
      {
        type: 'answer-options',
        position: { x: 0, y: 60, width: 100, height: 40 },
        props: {},
      },
    ],
    config: {
      gridColumns: 2,
      gridRows: 2,
    },
  };
}
```

## Plugin Context

The `PluginContext` provides access to:

```typescript
interface PluginContext {
  room: Room;                    // Current room state
  gameState: BaseGameState;      // Current game state
  players: Map<string, Player>;  // Players in room
  gameType: GameType;            // Game type
  fsmState: FSMState;            // Current FSM state
  round: number;                 // Current round
  maxRounds: number;             // Maximum rounds
}
```

## Render Descriptors

### Layout Types

- **grid**: Grid-based layout (default)
- **canvas**: Canvas-based layout (for drawing games)
- **list**: List-based layout (for text-based games)
- **scoreboard**: Scoreboard layout (for score display)
- **custom**: Custom layout (define your own)

### Component Structure

```typescript
interface RenderComponent {
  type: string;                    // Component type
  position?: {                      // Position and size (percentage)
    x: number;
    y: number;
    width?: number;
    height?: number;
  };
  props?: Record<string, any>;     // Component props
}
```

### Example Render Descriptors

#### Grid Layout

```typescript
{
  layout: 'grid',
  components: [
    { type: 'question', position: { x: 0, y: 0, width: 100, height: 50 } },
    { type: 'answers', position: { x: 0, y: 50, width: 100, height: 50 } },
  ],
  config: { gridColumns: 1, gridRows: 2 },
}
```

#### Canvas Layout

```typescript
{
  layout: 'canvas',
  components: [
    { type: 'game-canvas', position: { x: 0, y: 0, width: 100, height: 100 } },
  ],
  config: { canvasWidth: 1920, canvasHeight: 1080 },
}
```

## Intent Handling Patterns

### Pattern 1: Simple Action

```typescript
async onIntent(intent: Intent, ctx: PluginContext): Promise<IntentResult> {
  if (intent.action === 'answer') {
    // Process answer
    const correct = this.checkAnswer(intent.data.answerIndex);
    
    // Update game state
    this.gameState.answers[intent.playerId] = intent.data.answerIndex;
    
    // Generate event
    const eventId = `evt_${Date.now()}`;
    
    return {
      success: true,
      intentId: intent.id,
      eventId,
      version: ctx.room.version + 1,
    };
  }
  
  return { success: false, intentId: intent.id, error: 'Unknown action' };
}
```

### Pattern 2: Validated Action

```typescript
async onIntent(intent: Intent, ctx: PluginContext): Promise<IntentResult> {
  // Validate first
  if (!this.validate(intent, ctx)) {
    return {
      success: false,
      intentId: intent.id,
      error: 'Validation failed',
    };
  }

  // Check game state
  if (ctx.fsmState !== FSMState.ROUND_START) {
    return {
      success: false,
      intentId: intent.id,
      error: 'Game not in round start state',
    };
  }

  // Process action
  // ...
}
```

### Pattern 3: Timed Action

```typescript
async onIntent(intent: Intent, ctx: PluginContext): Promise<IntentResult> {
  // Check timing
  const timeElapsed = Date.now() - ctx.gameState.roundStartTime;
  if (timeElapsed > ctx.gameState.timeLimit) {
    return {
      success: false,
      intentId: intent.id,
      error: 'Time limit exceeded',
    };
  }

  // Process action with timing
  // ...
}
```

## Common Patterns

### Score Updates

```typescript
// Update score in game state
this.gameState.scores[intent.playerId] = 
  (this.gameState.scores[intent.playerId] || 0) + points;

// Update room version
ctx.room.version++;
ctx.room.lastStateMutation = Date.now();
```

### Round Management

```typescript
// Check if round should end
if (this.allPlayersAnswered()) {
  // Transition to round end
  this.fsm.transition(FSMState.ROUND_END);
  
  // Calculate scores
  this.calculateRoundScores();
}
```

### State Serialization

```typescript
serializeState(roomState: Room): BaseGameState {
  const game = this.getGame(roomState);
  if (!game) {
    return this.getLobbyState();
  }

  const state = game.getState();
  
  // Add game-specific data
  return {
    ...state,
    currentQuestion: this.currentQuestion,
    answers: this.answers,
    // ... other game-specific fields
  };
}
```

## Testing Plugins

### Unit Tests

```typescript
import { describe, it, expect } from 'vitest';
import { MyGamePlugin } from './MyGamePlugin';

describe('MyGamePlugin', () => {
  it('should validate intents correctly', () => {
    const plugin = new MyGamePlugin();
    const intent = {
      id: 'intent1',
      type: 'game_action',
      playerId: 'player1',
      roomCode: 'TEST',
      action: 'answer',
      data: { answerIndex: 0 },
      timestamp: Date.now(),
      status: 'pending' as const,
    };
    
    const ctx = createMockContext();
    expect(plugin.validate(intent, ctx)).toBe(true);
  });
});
```

### Integration Tests

Test plugin with FSM wrapper and game engine:

```typescript
describe('MyGamePlugin Integration', () => {
  it('should handle intent and generate event', async () => {
    const plugin = new MyGamePlugin();
    const game = createMockGame();
    const wrapper = new GameFSMWrapper(game, 'TEST');
    wrapper.setPlugin(plugin);
    
    const intent = createMockIntent();
    const ctx = createMockContext();
    
    const result = await plugin.onIntent(intent, ctx);
    expect(result.success).toBe(true);
    expect(result.eventId).toBeDefined();
  });
});
```

## Best Practices

### 1. Validate Early

Always validate intents before processing:

```typescript
async onIntent(intent: Intent, ctx: PluginContext): Promise<IntentResult> {
  // Validate immediately
  if (!this.validate(intent, ctx)) {
    return { success: false, intentId: intent.id, error: 'Invalid' };
  }
  
  // Then process
  // ...
}
```

### 2. Use FSM States

Check FSM state before processing:

```typescript
if (ctx.fsmState !== FSMState.ROUND_START) {
  return { success: false, intentId: intent.id, error: 'Wrong state' };
}
```

### 3. Increment Versions

Always increment room version on state changes:

```typescript
ctx.room.version++;
ctx.room.lastStateMutation = Date.now();
```

### 4. Generate Events

Always generate events for processed intents:

```typescript
const eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
// Add event to replay buffer
// ...
```

### 5. Handle Errors Gracefully

Return clear error messages:

```typescript
try {
  // Process intent
} catch (error: any) {
  return {
    success: false,
    intentId: intent.id,
    error: error.message || 'Processing failed',
  };
}
```

### 6. Clean Up Resources

Always clean up in `cleanup()`:

```typescript
cleanup(roomState: Room): void {
  // Clear timers
  // Clear intervals
  // Reset state
  // Release resources
}
```

## Examples

### Trivia Game Plugin

See `apps/server/src/games/trivia-royale.ts` for a complete example of a game that can be adapted to use the plugin interface.

### Bingo Game Plugin

See `apps/server/src/games/bingo.ts` for an example of a more complex game with multiple rounds.

## Troubleshooting

### Plugin Not Loading

- Check plugin file exports
- Verify game type matches
- Check plugin registry registration

### Intents Not Processing

- Verify intent validation
- Check FSM state
- Review intent submission flow

### State Not Syncing

- Check serializeState implementation
- Verify room version increment
- Review sync engine integration

### Render Issues

- Check render descriptor format
- Verify component types
- Review display layout implementation

## Next Steps

1. Implement your plugin methods
2. Create adapter class
3. Write tests
4. Register plugin
5. Test with real game
6. Deploy and monitor

