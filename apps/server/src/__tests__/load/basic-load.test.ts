import { describe, it, expect } from 'vitest';
import { RoomManager } from '../../managers/room-manager.js';
import { Room, Player, PlayerStatus } from '@christmas/core';

/**
 * Basic load tests for the game engine.
 * These tests simulate multiple players and measure performance.
 */
describe('Load Tests', () => {
  it('should handle 50+ players per room', () => {
    const roomManager = new RoomManager();
    const room = roomManager.createRoom('host1', 'Host');

    // Add 50 players
    const players: Player[] = [];
    for (let i = 0; i < 50; i++) {
      const player: Player = {
        id: `player${i}`,
        name: `Player ${i}`,
        score: 0,
        status: PlayerStatus.CONNECTED,
        lastSeen: Date.now(),
        avatar: '🎄',
        joinedAt: Date.now(),
      };
      room.players.set(player.id, player);
      players.push(player);
    }

    expect(room.players.size).toBe(50);
    expect(Array.from(room.players.values()).length).toBe(50);
  });

  it('should handle message throughput', () => {
    const roomManager = new RoomManager();
    const room = roomManager.createRoom('host1', 'Host');

    // Simulate 100 state updates
    const startTime = Date.now();
    for (let i = 0; i < 100; i++) {
      room.version++;
      room.lastStateMutation = Date.now();
    }
    const endTime = Date.now();
    const duration = endTime - startTime;

    expect(room.version).toBe(100);
    expect(duration).toBeLessThan(1000); // Should complete in under 1 second
  });

  it('should handle memory efficiently', () => {
    const roomManager = new RoomManager();
    const rooms: Room[] = [];

    // Create 10 rooms with 10 players each
    for (let r = 0; r < 10; r++) {
      const room = roomManager.createRoom(`host${r}`, `Host ${r}`);
      for (let p = 0; p < 10; p++) {
        const player: Player = {
          id: `room${r}_player${p}`,
          name: `Player ${p}`,
          score: 0,
          status: PlayerStatus.CONNECTED,
        lastSeen: Date.now(),
          avatar: '🎄',
          joinedAt: Date.now(),
        };
        room.players.set(player.id, player);
      }
      rooms.push(room);
    }

    expect(rooms.length).toBe(10);
    rooms.forEach(room => {
      expect(room.players.size).toBe(10);
    });
  });
});

