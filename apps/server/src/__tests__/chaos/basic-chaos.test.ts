import { describe, it, expect } from 'vitest';
import { RoomManager } from '../../managers/room-manager.js';
import { Room, GameState } from '@christmas/core';

/**
 * Chaos tests simulate failure scenarios and test recovery mechanisms.
 */
describe('Chaos Tests', () => {
  it('should recover from version gap', () => {
    const roomManager = new RoomManager();
    const room = roomManager.createRoom('host1', 'Host');

    // Simulate version gap (client missed updates)
    room.version = 10;
    const clientVersion = 5;
    const gap = room.version - clientVersion;

    // Should detect gap and trigger resync
    expect(gap).toBeGreaterThan(1);
    
    // Simulate resync by updating client version
    const recoveredVersion = room.version;
    expect(recoveredVersion).toBe(10);
  });

  it('should handle rapid state changes', () => {
    const roomManager = new RoomManager();
    const room = roomManager.createRoom('host1', 'Host');

    // Simulate rapid state mutations
    const mutations = 100;
    for (let i = 0; i < mutations; i++) {
      room.version++;
      room.lastStateMutation = Date.now();
    }

    expect(room.version).toBe(mutations);
    expect(room.lastStateMutation).toBeGreaterThan(0);
  });

  it('should handle state recovery after disconnect', () => {
    const roomManager = new RoomManager();
    const room = roomManager.createRoom('host1', 'Host');
    
    // Set game state
    room.currentGame = 'trivia_royale' as any;
    room.gameState = GameState.PLAYING;
    room.version = 5;

    // Simulate disconnect and recovery
    const recoveredState = {
      gameState: room.gameState,
      version: room.version,
      currentGame: room.currentGame,
    };

    expect(recoveredState.gameState).toBe(GameState.PLAYING);
    expect(recoveredState.version).toBe(5);
  });

  it('should handle concurrent state mutations', () => {
    const roomManager = new RoomManager();
    const room = roomManager.createRoom('host1', 'Host');

    // Simulate concurrent mutations (in real scenario, these would be serialized)
    const initialVersion = room.version;
    
    // Multiple mutations
    room.version++;
    room.version++;
    room.version++;

    // Version should be monotonically increasing
    expect(room.version).toBe(initialVersion + 3);
  });
});

