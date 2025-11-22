import { describe, it, expect, beforeEach } from 'vitest';
import { SnapshotManager } from '../../engine/snapshot-manager.js';
import { Room, GameState } from '@christmas/core';
import { GameType } from '@christmas/core';

describe('SnapshotManager', () => {
  let snapshotManager: SnapshotManager;
  const roomCode = 'TEST';

  beforeEach(() => {
    snapshotManager = new SnapshotManager(10, false, 10); // No compression for tests
  });

  it('should create snapshot', async () => {
    const room: Room = {
      code: roomCode,
      hostId: 'host1',
      createdAt: Date.now(),
      expiresAt: Date.now() + 3600000,
      currentGame: GameType.TRIVIA_ROYALE,
      gameState: GameState.PLAYING,
      players: new Map(),
      settings: {} as any,
      version: 5,
      lastStateMutation: Date.now(),
    };

    const gameState = {
      gameType: GameType.TRIVIA_ROYALE,
      state: GameState.PLAYING,
      round: 1,
      maxRounds: 5,
      startedAt: Date.now(),
      scores: {},
    };

    const snapshot = await snapshotManager.createSnapshot(roomCode, room, gameState);
    
    expect(snapshot.roomCode).toBe(roomCode);
    expect(snapshot.version).toBe(5);
    expect(snapshot.compressed).toBe(false);
  });

  it('should retrieve snapshot by version', async () => {
    const room: Room = {
      code: roomCode,
      hostId: 'host1',
      createdAt: Date.now(),
      expiresAt: Date.now() + 3600000,
      currentGame: GameType.TRIVIA_ROYALE,
      gameState: GameState.PLAYING,
      players: new Map(),
      settings: {} as any,
      version: 5,
      lastStateMutation: Date.now(),
    };

    const gameState = {
      gameType: GameType.TRIVIA_ROYALE,
      state: GameState.PLAYING,
      round: 1,
      maxRounds: 5,
      startedAt: Date.now(),
      scores: {},
    };

    await snapshotManager.createSnapshot(roomCode, room, gameState);
    const snapshot = await snapshotManager.getSnapshot(roomCode, 5);
    
    expect(snapshot).not.toBeNull();
    expect(snapshot!.version).toBe(5);
  });

  it('should get latest snapshot', async () => {
    const room1: Room = {
      code: roomCode,
      hostId: 'host1',
      createdAt: Date.now(),
      expiresAt: Date.now() + 3600000,
      currentGame: GameType.TRIVIA_ROYALE,
      gameState: GameState.PLAYING,
      players: new Map(),
      settings: {} as any,
      version: 5,
      lastStateMutation: Date.now(),
    };

    const room2: Room = {
      ...room1,
      version: 10,
    };

    const gameState = {
      gameType: GameType.TRIVIA_ROYALE,
      state: GameState.PLAYING,
      round: 1,
      maxRounds: 5,
      startedAt: Date.now(),
      scores: {},
    };

    await snapshotManager.createSnapshot(roomCode, room1, gameState);
    await snapshotManager.createSnapshot(roomCode, room2, gameState);
    
    const latest = await snapshotManager.getLatestSnapshot(roomCode);
    expect(latest).not.toBeNull();
    expect(latest!.version).toBe(10);
  });

  it('should check if snapshot should be created', () => {
    const room: Room = {
      code: roomCode,
      hostId: 'host1',
      createdAt: Date.now(),
      expiresAt: Date.now() + 3600000,
      currentGame: GameType.TRIVIA_ROYALE,
      gameState: GameState.PLAYING,
      players: new Map(),
      settings: {} as any,
      version: 5,
      lastStateMutation: Date.now(),
    };

    // Create snapshot at version 5
    snapshotManager.createSnapshot(roomCode, room, null);
    
    // Should create snapshot at version 15 (5 + 10 interval)
    expect(snapshotManager.shouldCreateSnapshot(roomCode, 15)).toBe(true);
    expect(snapshotManager.shouldCreateSnapshot(roomCode, 12)).toBe(false);
  });

  it('should check critical transitions', () => {
    expect(snapshotManager.shouldCreateSnapshotForTransition(roomCode, 'game_start')).toBe(true);
    expect(snapshotManager.shouldCreateSnapshotForTransition(roomCode, 'round_end')).toBe(true);
    expect(snapshotManager.shouldCreateSnapshotForTransition(roomCode, 'game_end')).toBe(true);
    expect(snapshotManager.shouldCreateSnapshotForTransition(roomCode, 'other')).toBe(false);
  });

  it('should limit snapshots per room', async () => {
    const maxSnapshots = 5;
    const limitedManager = new SnapshotManager(1, false, maxSnapshots);
    
    for (let i = 1; i <= 10; i++) {
      const room: Room = {
        code: roomCode,
        hostId: 'host1',
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000,
        currentGame: GameType.TRIVIA_ROYALE,
        gameState: GameState.PLAYING,
        players: new Map(),
        settings: {} as any,
        version: i,
        lastStateMutation: Date.now(),
      };
      
      await limitedManager.createSnapshot(roomCode, room, null);
    }
    
    const count = limitedManager.getSnapshotCount(roomCode);
    expect(count).toBe(maxSnapshots);
  });

  it('should clear snapshots', async () => {
    const room: Room = {
      code: roomCode,
      hostId: 'host1',
      createdAt: Date.now(),
      expiresAt: Date.now() + 3600000,
      currentGame: GameType.TRIVIA_ROYALE,
      gameState: GameState.PLAYING,
      players: new Map(),
      settings: {} as any,
      version: 5,
      lastStateMutation: Date.now(),
    };

    await snapshotManager.createSnapshot(roomCode, room, null);
    snapshotManager.clearSnapshots(roomCode);
    
    const count = snapshotManager.getSnapshotCount(roomCode);
    expect(count).toBe(0);
  });
});

