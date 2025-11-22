import { Intent, IntentResult, IntentStatus, GameEvent, Room, GameState } from '@christmas/core';
import type { RoomManager } from '../managers/room-manager.js';
import type { GameManager } from './game-manager.js';
import type { SyncEngine } from './sync-engine.js';

/**
 * IntentManager handles intent processing, validation, and queuing.
 * 
 * Responsibilities:
 * - Store pending intents per room with unique IDs
 * - Validate intents before processing
 * - Queue intents for host controller approval
 * - Track intent status (pending, approved, rejected, processed)
 * - Generate events from approved intents
 */
export class IntentManager {
  // Store pending intents per room: Map<roomCode, Map<intentId, Intent>>
  private pendingIntents: Map<string, Map<string, Intent>> = new Map();
  
  // Store processed intents for deduplication: Map<roomCode, Set<intentId>>
  private processedIntents: Map<string, Set<string>> = new Map();
  
  // Store intent results: Map<intentId, IntentResult>
  private intentResults: Map<string, IntentResult> = new Map();
  
  // Track events generated from intents: Map<eventId, intentId>
  private eventToIntent: Map<string, string> = new Map();

  private syncEngine?: SyncEngine;

  constructor(
    private roomManager: RoomManager,
    private gameManager: GameManager,
    syncEngine?: SyncEngine
  ) {
    this.syncEngine = syncEngine;
  }

  /**
   * Submit an intent for processing
   * Returns immediately with intent ID, processing happens asynchronously
   */
  submitIntent(intent: Intent): string {
    const { roomCode, id } = intent;
    
    // Check if intent already processed (deduplication)
    const processed = this.processedIntents.get(roomCode);
    if (processed && processed.has(id)) {
      console.warn(`[IntentManager] Intent ${id} already processed, ignoring duplicate`);
      return id;
    }

    // Initialize room's intent maps if needed
    if (!this.pendingIntents.has(roomCode)) {
      this.pendingIntents.set(roomCode, new Map());
    }
    if (!this.processedIntents.has(roomCode)) {
      this.processedIntents.set(roomCode, new Set());
    }

    // Set initial status
    intent.status = 'pending';
    
    // Get current room version
    const room = this.roomManager.getRoom(roomCode);
    if (room) {
      intent.version = room.version;
    }

    // Store intent
    this.pendingIntents.get(roomCode)!.set(id, intent);
    
    console.log(`[IntentManager] Intent ${id} submitted for room ${roomCode} by player ${intent.playerId.substring(0, 8)}`);
    
    return id;
  }

  /**
   * Validate an intent
   * Returns true if valid, false otherwise
   */
  validateIntent(intent: Intent): { valid: boolean; error?: string } {
    // Basic validation
    if (!intent.id || !intent.type || !intent.playerId || !intent.roomCode || !intent.action) {
      return { valid: false, error: 'Missing required intent fields' };
    }

    // Check room exists
    const room = this.roomManager.getRoom(intent.roomCode);
    if (!room) {
      return { valid: false, error: 'Room not found' };
    }

    // Check player exists in room
    if (!room.players.has(intent.playerId)) {
      return { valid: false, error: 'Player not in room' };
    }

    // Check if game exists and is in a valid state for intents
    const game = this.gameManager.getGame(intent.roomCode);
    if (!game) {
      return { valid: false, error: 'No active game' };
    }

    const gameState = game.getState();
    if (gameState.state !== GameState.PLAYING) {
      return { valid: false, error: 'Game not in playing state' };
    }

    return { valid: true };
  }

  /**
   * Process an intent (called by host controller)
   * Validates, applies, and generates event
   */
  async processIntent(intentId: string, roomCode: string): Promise<IntentResult> {
    // Check if already processed
    const processed = this.processedIntents.get(roomCode);
    if (processed && processed.has(intentId)) {
      const existingResult = this.intentResults.get(intentId);
      if (existingResult) {
        return existingResult;
      }
    }

    // Get intent
    const pending = this.pendingIntents.get(roomCode);
    if (!pending || !pending.has(intentId)) {
      return {
        success: false,
        intentId,
        error: 'Intent not found',
      };
    }

    const intent = pending.get(intentId)!;
    
    // Validate intent
    const validation = this.validateIntent(intent);
    if (!validation.valid) {
      intent.status = 'rejected';
      const result: IntentResult = {
        success: false,
        intentId,
        error: validation.error,
      };
      this.intentResults.set(intentId, result);
      this.markIntentProcessed(roomCode, intentId);
      return result;
    }

    // Apply intent to game
    try {
      const room = this.roomManager.getRoom(roomCode);
      if (!room) {
        throw new Error('Room not found');
      }

      // Increment room version
      room.version++;
      room.lastStateMutation = Date.now();

      // Apply action to game
      this.gameManager.handlePlayerAction(roomCode, intent.playerId, intent.action, intent.data);

      // Generate event ID
      const eventId = this.generateEventId();

      // Create event
      const event: GameEvent = {
        id: eventId,
        type: `game_${intent.action}`,
        roomCode,
        timestamp: Date.now(),
        version: room.version,
        data: intent.data,
        intentId,
      };

      // Track event to intent mapping
      this.eventToIntent.set(eventId, intentId);

      // Add event to replay buffer for synchronization
      if (this.syncEngine) {
        this.syncEngine.addEventToReplayBuffer(event);
      }

      // Mark intent as processed
      intent.status = 'processed';
      const result: IntentResult = {
        success: true,
        intentId,
        eventId,
        version: room.version,
      };
      this.intentResults.set(intentId, result);
      this.markIntentProcessed(roomCode, intentId);

      console.log(`[IntentManager] Intent ${intentId} processed successfully, generated event ${eventId}`);

      return result;
    } catch (error: any) {
      intent.status = 'rejected';
      const result: IntentResult = {
        success: false,
        intentId,
        error: error.message || 'Failed to process intent',
      };
      this.intentResults.set(intentId, result);
      this.markIntentProcessed(roomCode, intentId);
      return result;
    }
  }

  /**
   * Reject an intent (called by host controller)
   */
  rejectIntent(intentId: string, roomCode: string, reason: string): void {
    const pending = this.pendingIntents.get(roomCode);
    if (pending && pending.has(intentId)) {
      const intent = pending.get(intentId)!;
      intent.status = 'rejected';
      const result: IntentResult = {
        success: false,
        intentId,
        error: reason,
      };
      this.intentResults.set(intentId, result);
      this.markIntentProcessed(roomCode, intentId);
      console.log(`[IntentManager] Intent ${intentId} rejected: ${reason}`);
    }
  }

  /**
   * Get pending intents for a room
   */
  getPendingIntents(roomCode: string): Intent[] {
    const pending = this.pendingIntents.get(roomCode);
    if (!pending) {
      return [];
    }
    return Array.from(pending.values()).filter(intent => intent.status === 'pending');
  }

  /**
   * Get intent result
   */
  getIntentResult(intentId: string): IntentResult | null {
    return this.intentResults.get(intentId) || null;
  }

  /**
   * Check if intent was already processed
   */
  isIntentProcessed(intentId: string, roomCode: string): boolean {
    const processed = this.processedIntents.get(roomCode);
    return processed ? processed.has(intentId) : false;
  }

  /**
   * Mark intent as processed
   */
  private markIntentProcessed(roomCode: string, intentId: string): void {
    const pending = this.pendingIntents.get(roomCode);
    if (pending) {
      pending.delete(intentId);
    }

    const processed = this.processedIntents.get(roomCode);
    if (processed) {
      processed.add(intentId);
    }
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Cleanup intents for a room
   */
  cleanupRoom(roomCode: string): void {
    this.pendingIntents.delete(roomCode);
    this.processedIntents.delete(roomCode);
    
    // Clean up intent results (keep last 1000)
    const resultsToKeep = new Set<string>();
    const processed = this.processedIntents.get(roomCode);
    if (processed) {
      Array.from(processed).slice(-1000).forEach(id => resultsToKeep.add(id));
    }
    
    // Remove old results
    for (const [intentId] of this.intentResults) {
      if (!resultsToKeep.has(intentId)) {
        this.intentResults.delete(intentId);
      }
    }
  }

  /**
   * Generate unique intent ID
   */
  static generateIntentId(): string {
    return `intent_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Cleanup expired rooms (remove intents for rooms that no longer exist)
   */
  cleanupExpiredRooms(activeRoomCodes: Set<string>): void {
    for (const roomCode of this.pendingIntents.keys()) {
      if (!activeRoomCodes.has(roomCode)) {
        this.cleanupRoom(roomCode);
      }
    }
  }

  /**
   * Cleanup old intents (remove intents older than TTL)
   */
  cleanupOldIntents(ttlMs: number): void {
    const now = Date.now();
    const cutoff = now - ttlMs;

    // Clean up old intent results
    for (const [intentId, result] of this.intentResults) {
      // Check if intent is old (we don't track timestamp in result, so use a heuristic)
      // Keep last 1000 results
      if (this.intentResults.size > 1000) {
        const oldestId = Array.from(this.intentResults.keys())[0];
        this.intentResults.delete(oldestId);
      }
    }
  }
}

