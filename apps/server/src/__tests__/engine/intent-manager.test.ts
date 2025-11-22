import { describe, it, expect, beforeEach } from 'vitest';
import { IntentManager } from '../../engine/intent-manager.js';
import { RoomManager } from '../../managers/room-manager.js';
import { GameManager } from '../../engine/game-manager.js';
import { Intent, IntentStatus } from '@christmas/core';
import { GameType } from '@christmas/core';

describe('IntentManager', () => {
  let intentManager: IntentManager;
  let roomManager: RoomManager;
  let gameManager: GameManager;

  beforeEach(() => {
    roomManager = new RoomManager();
    gameManager = new GameManager(roomManager);
    intentManager = new IntentManager(roomManager, gameManager);
  });

  it('should submit intent successfully', () => {
    const room = roomManager.createRoom('host1', 'Host');
    const intent: Intent = {
      id: IntentManager.generateIntentId(),
      type: 'game_answer',
      playerId: 'player1',
      roomCode: room.code,
      action: 'answer',
      data: { answerIndex: 0 },
      timestamp: Date.now(),
      status: 'pending',
    };

    const intentId = intentManager.submitIntent(intent);
    expect(intentId).toBe(intent.id);
    
    const pending = intentManager.getPendingIntents(room.code);
    expect(pending.length).toBeGreaterThan(0);
  });

  it('should validate intent', () => {
    const room = roomManager.createRoom('host1', 'Host');
    const intent: Intent = {
      id: IntentManager.generateIntentId(),
      type: 'game_answer',
      playerId: 'player1',
      roomCode: room.code,
      action: 'answer',
      data: { answerIndex: 0 },
      timestamp: Date.now(),
      status: 'pending',
    };

    const validation = intentManager.validateIntent(intent);
    // Will fail because no game is active and player not in room
    expect(validation.valid).toBe(false);
  });

  it('should prevent duplicate intent processing', () => {
    const room = roomManager.createRoom('host1', 'Host');
    const intent: Intent = {
      id: IntentManager.generateIntentId(),
      type: 'game_answer',
      playerId: 'player1',
      roomCode: room.code,
      action: 'answer',
      data: { answerIndex: 0 },
      timestamp: Date.now(),
      status: 'pending',
    };

    intentManager.submitIntent(intent);
    const intentId = intent.id;
    
    // Submit again
    intentManager.submitIntent(intent);
    
    // Check if processed
    const isProcessed = intentManager.isIntentProcessed(intentId, room.code);
    // First submission should be pending, not processed yet
    expect(isProcessed).toBe(false);
  });

  it('should get intent result', async () => {
    const room = roomManager.createRoom('host1', 'Host');
    const intent: Intent = {
      id: IntentManager.generateIntentId(),
      type: 'game_answer',
      playerId: 'player1',
      roomCode: room.code,
      action: 'answer',
      data: { answerIndex: 0 },
      timestamp: Date.now(),
      status: 'pending',
    };

    const intentId = intentManager.submitIntent(intent);
    
    // Process intent (will fail without game, but should create result)
    const result = await intentManager.processIntent(intentId, room.code);
    
    expect(result.intentId).toBe(intentId);
    expect(result.success).toBe(false); // No game active
  });

  it('should cleanup room intents', () => {
    const room = roomManager.createRoom('host1', 'Host');
    const intent: Intent = {
      id: IntentManager.generateIntentId(),
      type: 'game_answer',
      playerId: 'player1',
      roomCode: room.code,
      action: 'answer',
      data: { answerIndex: 0 },
      timestamp: Date.now(),
      status: 'pending',
    };

    intentManager.submitIntent(intent);
    intentManager.cleanupRoom(room.code);
    
    const pending = intentManager.getPendingIntents(room.code);
    expect(pending.length).toBe(0);
  });
});

