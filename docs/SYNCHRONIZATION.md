# Synchronization Guide

## Overview

The synchronization system ensures all clients (players, host-control, host-display) receive consistent game state updates with reliability guarantees.

## ACK System

### How It Works

1. **State Update Sent**: Server sends state update with version number
2. **ACK Expected**: Server tracks which sockets should ACK
3. **ACK Received**: Client sends `state_ack` with version number
4. **Missing ACK Detection**: Server detects missing ACKs after timeout (2 seconds)
5. **Retry Logic**: Missing ACKs trigger resync

### ACK Message Format

```typescript
{
  version: number;
  messageType: 'state' | 'player_list' | 'settings';
  timestamp?: number; // Client timestamp for latency calculation
}
```

### ACK Tracking

- **Pending ACKs**: Map<roomCode, Map<version, Set<socketId>>>
- **Received ACKs**: Map<roomCode, Map<socketId, Set<version>>>
- **Missing ACKs**: Map<roomCode, Map<socketId, Set<version>>>

### ACK Metrics

Tracked per room:
- Total sent
- Total ACKed
- Total missing
- Average latency
- ACK rate percentage

## Replay Buffer

### Purpose

Store last N events per room for:
- Reconnecting clients
- Late joiners
- State recovery

### Configuration

- **Buffer Size**: Default 100 events per room
- **TTL**: Events older than 1 hour cleaned up
- **Circular Buffer**: Oldest events removed when full

### Event Storage

```typescript
interface GameEvent {
  id: string;           // Unique event ID
  type: string;        // Event type
  roomCode: string;
  timestamp: number;
  version: number;     // Room version after event
  data: any;
  intentId?: string;   // Related intent ID
}
```

### Replay Request

Clients can request replay events:

```typescript
{
  type: 'replay_request',
  roomCode: string,
  fromVersion?: number,
  fromTimestamp?: number,
  toVersion?: number,
  toTimestamp?: number
}
```

### Replay Response

Server responds with events and optional snapshot:

```typescript
{
  type: 'replay_response',
  roomCode: string,
  events: GameEvent[],
  snapshot?: any,
  snapshotVersion?: number
}
```

## Snapshot System

### When Snapshots Are Created

1. **Periodic**: Every N state changes (default: 10)
2. **Critical Transitions**: Game start, round end, game end
3. **On Request**: Late joiners can request snapshot

### Snapshot Structure

```typescript
interface RoomSnapshot {
  roomCode: string;
  version: number;
  timestamp: number;
  roomState: Room;
  gameState: BaseGameState | null;
  compressed: boolean;
  data: Buffer | any;
}
```

### Snapshot Compression

- Snapshots compressed using gzip
- Significant storage reduction
- Decompressed on retrieval

### Snapshot Retrieval

- **Latest Snapshot**: `getLatestSnapshot(roomCode)`
- **Snapshot by Version**: `getSnapshot(roomCode, version)`
- **Closest Snapshot**: `getSnapshotClosestToVersion(roomCode, targetVersion)`

### Late Joiner Flow

1. Client connects and requests snapshot
2. Server sends latest snapshot
3. Client requests replay events since snapshot version
4. Client applies snapshot + replay events = current state

## Delta Updates

### When Deltas Are Used

- **Frequent Updates**: PLAYING state uses deltas
- **State Transitions**: Full state on transitions
- **Configurable**: Can be disabled per sync

### Delta Calculation

Deep diffing algorithm:
- Compares nested objects recursively
- Only changed properties included
- Deleted properties tracked separately

### Delta Structure

```typescript
interface Delta {
  [key: string]: any;    // Changed properties
  _deleted?: string[];   // Deleted property keys
}
```

### Delta Application

Clients apply deltas to reconstruct state:
1. Start with base state (snapshot or previous state)
2. Apply delta changes
3. Remove deleted properties
4. Result is current state

### Delta vs Full State

- **Delta**: Smaller, faster, requires base state
- **Full State**: Larger, slower, self-contained
- **Strategy**: Deltas for frequent updates, full state periodically

## State Synchronization Flow

### Normal Flow

1. Game state changes
2. SyncEngine calculates delta (if applicable)
3. State version incremented
4. State sent to all clients with version
5. Clients ACK with version
6. Server tracks ACKs

### Reconnection Flow

1. Client reconnects
2. Client sends last known version
3. Server detects version gap
4. Server sends snapshot + replay events
5. Client applies snapshot + events
6. Client ACKs all versions

### Late Joiner Flow

1. Client joins room
2. Client requests snapshot
3. Server sends latest snapshot
4. Client requests replay since snapshot version
5. Server sends replay events
6. Client applies snapshot + events
7. Client ACKs all versions

## Version Gap Detection

### Client-Side Detection

Clients detect version gaps:
- Receive state with version N
- Last known version was M
- Gap detected if N > M + 1

### Server-Side Detection

Server detects missing ACKs:
- State sent with version N
- ACK timeout (2 seconds)
- Missing ACKs trigger resync

### Resync Process

1. Detect gap or missing ACK
2. Send snapshot (if available)
3. Send replay events since snapshot
4. Client applies snapshot + events
5. Client ACKs all versions

## Best Practices

### For Game Developers

- Always increment room version on state changes
- Use delta updates for frequent state changes
- Create snapshots on critical transitions
- Add events to replay buffer

### For Client Developers

- Always ACK state updates
- Detect version gaps
- Request replay on gaps
- Handle delta updates correctly

### For Operations

- Monitor ACK rates
- Monitor replay buffer sizes
- Monitor snapshot creation rates
- Monitor delta compression ratios

## Troubleshooting

### Missing ACKs

- Check network connectivity
- Check client ACK implementation
- Check server ACK tracking
- Review ACK metrics

### Version Gaps

- Check replay buffer size
- Check snapshot frequency
- Review reconnection logic
- Check event deduplication

### State Inconsistencies

- Verify snapshot + replay application
- Check delta application logic
- Review event ordering
- Verify version tracking

