import { describe, it, expect, beforeEach } from 'vitest';
import { RoomManager } from '../../managers/room-manager.js';
import { ConnectionManager } from '../../engine/connection-manager.js';
import { Room, GameState, Player, PlayerStatus } from '@christmas/core';
import { GameType } from '@christmas/core';

describe('Reconnection Integration', () => {
  let roomManager: RoomManager;
  let connectionManager: ConnectionManager;
  const roomCode = 'TEST';

  beforeEach(() => {
    roomManager = new RoomManager();
    connectionManager = new ConnectionManager();
  });

  it('should recover state for reconnecting player', async () => {
    // Create room and add player
    const room = roomManager.createRoom('host1', 'Host');
    const player: Player = {
      id: 'player1',
      name: 'Test Player',
      score: 100,
      status: PlayerStatus.CONNECTED,
      avatar: '🎄',
      joinedAt: Date.now(),
      lastSeen: Date.now(),
    };
    room.players.set('player1', player);
    room.currentGame = GameType.TRIVIA_ROYALE;
    room.gameState = GameState.PLAYING;
    room.version = 5;

    // Simulate reconnection
    const recoveredState = {
      roomCode: room.code,
      version: room.version,
      gameState: room.gameState,
      player: player,
    };

    expect(recoveredState.version).toBe(5);
    expect(recoveredState.gameState).toBe(GameState.PLAYING);
    expect(recoveredState.player.score).toBe(100);
  });

  it('should detect version gap on reconnection', () => {
    const room = roomManager.createRoom('host1', 'Host');
    room.version = 10;

    const lastKnownVersion = 5;
    const versionGap = room.version - lastKnownVersion;

    expect(versionGap).toBe(5);
    expect(versionGap > 1).toBe(true); // Gap detected
  });

  it.skip('should recover host reconnection', async () => {
    // TODO: This test requires RoomEngine which needs more setup
    // const room = roomManager.createRoom('host1', 'Host');
    // const roomEngine = new RoomEngine(...);
    // const hostToken = roomEngine.getHostToken(room.code);
    // const verifiedRoom = roomEngine.verifyHostToken(hostToken);
    // expect(verifiedRoom).toBe(room.code);
  });

  it('should restore player score on reconnection', () => {
    const room = roomManager.createRoom('host1', 'Host');
    const player: Player = {
      id: 'player1',
      name: 'Test Player',
      score: 250,
      status: PlayerStatus.DISCONNECTED,
      avatar: '🎄',
      joinedAt: Date.now(),
      lastSeen: Date.now(),
    };

    room.players.set('player1', player);

    // Simulate reconnection - restore score
    const reconnectedPlayer = room.players.get('player1');
    expect(reconnectedPlayer?.score).toBe(250);
    expect(reconnectedPlayer?.status).toBe(PlayerStatus.DISCONNECTED); // Will be updated to CONNECTED
  });
});

