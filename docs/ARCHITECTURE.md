# Game Engine Architecture

## Overview

The Christmas Party Game Suite uses an authoritative state management system with intent-based actions, FSM-driven game lifecycle, and comprehensive synchronization features.

## Authoritative State System

### Host Controller as Single Source of Truth

The Host Controller is the **single authoritative source** for all state mutations per room. Players cannot directly change game state - they can only submit **intents** that are validated and processed by the host controller.

### State Flow

```
Player Action → Intent Submission → Intent Validation → Host Controller Processing → Event Generation → State Mutation → State Sync
```

### Room Versioning

Every room maintains a **monotonically increasing version number** that increments with each state mutation:

- `Room.version`: Current version number
- `Room.lastStateMutation`: Timestamp of last state change

This versioning enables:
- Conflict detection
- State synchronization
- Replay buffer management
- Snapshot versioning

## Intent System

### Intent Lifecycle

1. **Submission**: Player submits intent via `intent` socket event
2. **Validation**: IntentManager validates intent (immediate validation)
3. **Queuing**: Valid intents are queued for host controller processing
4. **Processing**: Host controller processes intent and generates event
5. **Result**: IntentResult sent back to player

### Intent Structure

```typescript
interface Intent {
  id: string;              // Unique intent ID
  type: string;            // Intent type
  playerId: string;        // Player who submitted
  roomCode: string;        // Room code
  action: string;          // Action name
  data: any;              // Action data
  timestamp: number;       // Creation timestamp
  version?: number;        // Room version when submitted
  status: IntentStatus;    // pending | approved | rejected | processed
}
```

### Intent Processing

- **Immediate Validation**: Intents are validated at socket level before queuing
- **Host Authority**: Only host controller can approve/process intents
- **Event Generation**: Processed intents generate events with unique IDs
- **Deduplication**: Event IDs prevent double-processing

## FSM System

### Standard FSM States

```
LOBBY → SETUP → ROUND_START → ROUND_END → SCOREBOARD → NEXT_ROUND → GAME_END → LOBBY
```

### State Transitions

- **Validated**: FSMEngine validates all transitions before applying
- **Tracked**: State history maintained for replay
- **Mapped**: Game states mapped to FSM states automatically

### FSM Wrapper

Games are wrapped with `GameFSMWrapper` which:
- Intercepts game state changes
- Maps to FSM states
- Validates transitions
- Emits `fsm_transition` events

## Scaling & Redis Pub/Sub

### Horizontal Scaling Architecture

The game engine supports horizontal scaling via Redis Pub/Sub for Socket.IO clustering.

**Single Instance (No Redis):**
- Uses in-memory Socket.IO adapter
- All connections handled by one server instance
- Suitable for development and small deployments

**Multiple Instances (With Redis):**
- Uses Redis adapter for Socket.IO clustering
- Multiple server instances share Socket.IO events via Redis Pub/Sub
- Players can connect to any instance
- Game state broadcasts reach all instances
- Room events synchronized across instances

### Redis Configuration

**Connection:**
- Redis URL provided via `REDIS_URL` environment variable
- Supports Upstash Redis (TLS) and standard Redis
- Automatic fallback to in-memory adapter if Redis unavailable

**Socket.IO Adapter:**
- Uses `@socket.io/redis-adapter` with `ioredis` client
- Separate pub/sub clients for optimal performance
- Automatic reconnection and error handling

**State Management:**
- Game state remains in-memory per instance (acceptable for Socket.IO clustering)
- Room state persisted to Supabase (shared across instances)
- Socket.IO events shared via Redis Pub/Sub
- Each instance maintains its own game engine state

### Deployment Considerations

**Fly.io:**
- Set `min_machines_running = 2` or higher in `fly.toml`
- Provision Upstash Redis via `fly redis create`
- Set `REDIS_URL` secret
- Scale instances: `fly scale count 2`

**Health Checks:**
- `/health` endpoint reports Redis connection status
- Logs indicate adapter type (Redis vs in-memory)
- Graceful degradation if Redis unavailable

## Plugin Architecture

### GamePlugin Interface

All games implement the `GamePlugin` interface:

```typescript
interface GamePlugin {
  init(roomState: Room): void;
  onIntent(intent: Intent, ctx: PluginContext): Promise<IntentResult>;
  validate(intent: Intent, ctx: PluginContext): boolean;
  applyEvent(event: GameEvent, ctx: PluginContext): void;
  serializeState(roomState: Room): BaseGameState;
  cleanup(roomState: Room): void;
  getRenderDescriptor(): RenderDescriptor;
}
```

### Plugin Context

Plugins receive a `PluginContext` with:
- Room state
- Game state
- Players map
- FSM state
- Round information

### Render Descriptors

Plugins define how games are rendered via `RenderDescriptor`:
- Layout types: `grid`, `canvas`, `list`, `scoreboard`, `custom`
- Component definitions
- Configuration options

## Synchronization System

### ACK System

- Every state update requires ACK from all clients
- Missing ACKs trigger retry logic
- ACK latency tracked for monitoring

### Replay Buffer

- Stores last N events per room (default: 100)
- Used for reconnecting clients
- Circular buffer implementation

### Snapshot System

- Full state snapshots created periodically (every 10 versions)
- Snapshots on critical transitions (game start, round end, game end)
- Compressed for storage efficiency
- Used for late joiners

### Delta Updates

- Deep diffing calculates only changed properties
- Delta updates for frequent state changes (PLAYING state)
- Full snapshots periodically or on request
- Reduces network load significantly

## Message Protocol

### Standardized Message Types

- `handshake`: Initial connection handshake
- `intent`: Player intent submission
- `event`: Game event
- `state_sync`: State synchronization
- `ack`: Acknowledgment
- `replay_request`: Request for replay events
- `replay_response`: Replay events response
- `fsm_transition`: FSM state transition
- `error`: Error message

### Message Validation

All messages validated using Zod schemas:
- Type safety
- Security validation
- Error reporting

## Security & Validation

### Role-Based Access Control

- `player`: Can submit game action intents
- `host-control`: Can control games, manage room
- `host-display`: Read-only display view

### Rate Limiting

- Per-client rate limits
- Per-room rate limits
- Per-action-type rate limits
- Burst protection

### Event Deduplication

- Unique event IDs prevent double-processing
- TTL-based cleanup (1 hour default)

## Room Lifecycle

### Room Creation

- Created by host controller
- Initialized with version 0
- TTL: 24 hours (configurable)

### Room Management

- Automatic garbage collection of inactive rooms
- Host migration on disconnect
- Room pause/resume support

### Room Cleanup

- Expired rooms cleaned up automatically
- Replay buffers cleared
- Snapshots cleaned up
- Event deduplication cleared

## Performance Optimizations

### Update Batching

- Frequent updates batched (10-20 Hz for movement)
- Configurable batch size and interval
- Priority-based batching

### Delta Compression

- Only changed properties sent
- Deep diffing for nested objects
- Significant bandwidth reduction

### Memory Management

- Limited replay buffer size per room
- Old snapshots cleaned up
- Inactive rooms garbage collected

## Scalability

### Horizontal Scaling Support

- Room sharding infrastructure (foundation)
- Cross-shard communication stub
- Stateless design where possible

### Connection Pooling

- Socket.IO room optimization
- Connection reuse
- Reduced memory overhead

## Testing & Observability

### Metrics

- Event rate
- Snapshot rate
- ACK latency
- Room health

### Logging

- Critical host actions logged
- Validation failures logged
- Rate limit violations logged
- Structured logging format

