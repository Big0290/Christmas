# API Reference

## Overview

This document provides a comprehensive reference for all public APIs in the game engine.

## Intent System

### IntentManager

**Location**: `apps/server/src/engine/intent-manager.ts`

#### Methods

- `submitIntent(intent: Intent): string`
  - Submit an intent for processing
  - Returns intent ID

- `validateIntent(intent: Intent): { valid: boolean; error?: string }`
  - Validate an intent before processing

- `processIntent(intentId: string, roomCode: string): Promise<IntentResult>`
  - Process an intent and generate event

- `getPendingIntents(roomCode: string): Intent[]`
  - Get pending intents for a room

- `getIntentResult(intentId: string): IntentResult | null`
  - Get result for a processed intent

## FSM System

### FSMEngine

**Location**: `apps/server/src/engine/fsm-engine.ts`

#### Methods

- `getState(): FSMState`
  - Get current FSM state

- `canTransition(to: FSMState): boolean`
  - Check if transition is valid

- `transition(to: FSMState, reason?: string): boolean`
  - Transition to new state

- `getStateHistory(): FSMTransition[]`
  - Get state transition history

- `replayTransitions(transitions: FSMTransition[]): void`
  - Replay transitions from history

## Plugin System

### GamePlugin Interface

**Location**: `packages/core/src/plugin-api.ts`

#### Required Methods

- `init(roomState: Room): void`
- `onIntent(intent: Intent, ctx: PluginContext): Promise<IntentResult>`
- `validate(intent: Intent, ctx: PluginContext): boolean`
- `applyEvent(event: GameEvent, ctx: PluginContext): void`
- `serializeState(roomState: Room): BaseGameState`
- `cleanup(roomState: Room): void`
- `getRenderDescriptor(): RenderDescriptor`

### PluginRegistry

**Location**: `apps/server/src/plugins/registry.ts`

#### Methods

- `register(gameType: GameType, plugin: GamePlugin, metadata?: {...}): void`
- `get(gameType: GameType): GamePlugin | null`
- `has(gameType: GameType): boolean`
- `loadFromDirectory(directory: string): Promise<number>`

## Synchronization

### SyncEngine

**Location**: `apps/server/src/engine/sync-engine.ts`

#### Methods

- `syncState(roomCode: string, state: any, options?: SyncOptions): void`
- `sendSnapshot(roomCode: string, socketId: string): Promise<boolean>`
- `sendReplay(roomCode: string, socketId: string, fromVersion?: number): void`
- `handleReplayRequest(...): void`
- `addEventToReplayBuffer(event: GameEvent): void`

### ReplayBuffer

**Location**: `apps/server/src/engine/replay-buffer.ts`

#### Methods

- `addEvent(event: GameEvent): void`
- `getEvents(roomCode: string): GameEvent[]`
- `getEventsSince(roomCode: string, version: number): GameEvent[]`
- `getLatestEvent(roomCode: string): GameEvent | null`

### SnapshotManager

**Location**: `apps/server/src/engine/snapshot-manager.ts`

#### Methods

- `createSnapshot(roomCode: string, room: Room, gameState: BaseGameState | null): Promise<RoomSnapshot>`
- `getSnapshot(roomCode: string, version: number): Promise<RoomSnapshot | null>`
- `getLatestSnapshot(roomCode: string): Promise<RoomSnapshot | null>`
- `shouldCreateSnapshot(roomCode: string, currentVersion: number): boolean`

### DeltaEngine

**Location**: `apps/server/src/engine/delta-engine.ts`

#### Methods

- `calculateDelta(previousState: any, currentState: any): Delta`
- `applyDelta(baseState: any, delta: Delta): any`
- `mergeDeltas(deltas: Delta[]): Delta`
- `isEmpty(delta: Delta): boolean`

## Security & Validation

### MessageValidator

**Location**: `apps/server/src/engine/message-validator.ts`

#### Methods

- `validateMessage(data: unknown): ValidationResult<Message>`
- `validateIntent(data: unknown): ValidationResult`
- `validateEvent(data: unknown): ValidationResult`
- `validateStateSync(data: unknown): ValidationResult`

### RoleValidator

**Location**: `apps/server/src/engine/role-validator.ts`

#### Methods

- `hasPermission(role: ClientRole, action: string): boolean`
- `validateRoleAndAction(role: string, action: string): { valid: boolean; error?: string }`
- `isHostRole(role: ClientRole): boolean`
- `isControlRole(role: ClientRole): boolean`

### AntiSpam

**Location**: `apps/server/src/engine/anti-spam.ts`

#### Methods

- `isAllowed(intent: Intent): { allowed: boolean; reason?: string }`
- `isBanned(playerId: string): boolean`
- `banPlayer(playerId: string, durationMs: number, reason: string): void`
- `unbanPlayer(playerId: string): void`

### SecurityLogger

**Location**: `apps/server/src/engine/security-logger.ts`

#### Methods

- `log(type: SecurityEventType, details: Record<string, any>, severity: 'low' | 'medium' | 'high' | 'critical', ...): void`
- `logHostAction(action: string, roomCode: string, socketId: string, details?: Record<string, any>): void`
- `logValidationFailure(reason: string, roomCode?: string, socketId?: string, details?: Record<string, any>): void`
- `logRateLimitViolation(roomCode: string, socketId: string, action?: string, details?: Record<string, any>): void`

## Performance

### BatchManager

**Location**: `apps/server/src/engine/batch-manager.ts`

#### Methods

- `registerRoom(roomCode: string, flushCallback: (updates: BatchedUpdate[]) => void): void`
- `addUpdate(roomCode: string, data: any, priority?: 'low' | 'normal' | 'high'): void`
- `flushBatch(roomCode: string): void`
- `flushAll(): void`

### RateLimiter

**Location**: `packages/core/src/utils.ts`

#### Methods

- `isAllowed(key: string, actionType?: string, roomCode?: string, clientId?: string): boolean`
- `isAllowedForClient(clientId: string, actionType?: string): boolean`
- `isAllowedForRoom(roomCode: string, actionType?: string): boolean`
- `isAllowedForAction(actionType: string, clientId?: string, roomCode?: string): boolean`

## Metrics & Observability

### MetricsCollector

**Location**: `apps/server/src/engine/metrics.ts`

#### Methods

- `recordEvent(roomCode: string): void`
- `recordSnapshot(roomCode: string): void`
- `recordAckLatency(roomCode: string, latencyMs: number): void`
- `getRoomMetrics(roomCode: string): RoomMetrics | null`
- `exportPrometheusFormat(): string`

## Scalability

### ShardManager

**Location**: `apps/server/src/engine/shard-manager.ts`

#### Methods

- `assignRoom(roomCode: string): string`
- `getRoomShard(roomCode: string): string | null`
- `isRoomOnThisShard(roomCode: string): boolean`

### ConnectionPool

**Location**: `apps/server/src/engine/connection-pool.ts`

#### Methods

- `joinRoom(socketId: string, roomCode: string): void`
- `leaveRoom(socketId: string, roomCode: string): void`
- `getSocketsInRoom(roomCode: string): string[]`
- `getStats(): {...}`

## Message Types

### Socket Events

#### Client to Server

- `intent`: Submit player intent
- `state_ack`: Acknowledge state update
- `replay_request`: Request replay events
- `handshake`: Initial connection handshake

#### Server to Client

- `intent_result`: Intent processing result
- `intent_rejected`: Intent rejection notification
- `state_sync`: State synchronization
- `replay_response`: Replay events response
- `fsm_transition`: FSM state transition
- `error`: Error message

## Type Definitions

### Intent

```typescript
interface Intent {
  id: string;
  type: string;
  playerId: string;
  roomCode: string;
  action: string;
  data: any;
  timestamp: number;
  version?: number;
  status: IntentStatus;
}
```

### IntentResult

```typescript
interface IntentResult {
  success: boolean;
  intentId: string;
  eventId?: string;
  error?: string;
  version?: number;
}
```

### GameEvent

```typescript
interface GameEvent {
  id: string;
  type: string;
  roomCode: string;
  timestamp: number;
  version: number;
  data: any;
  intentId?: string;
}
```

### PluginContext

```typescript
interface PluginContext {
  room: Room;
  gameState: BaseGameState;
  players: Map<string, Player>;
  gameType: GameType;
  fsmState: FSMState;
  round: number;
  maxRounds: number;
}
```

## Error Handling

All APIs return structured error responses:

```typescript
{
  success: false,
  error: string,
  details?: any
}
```

## Best Practices

1. Always validate intents before processing
2. Use idempotent action IDs for host actions
3. Handle ACK timeouts gracefully
4. Monitor metrics for room health
5. Use delta updates for frequent state changes
6. Request snapshots for late joiners
7. Clean up resources on room destruction

