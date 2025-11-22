import { GameEvent } from '@christmas/core';

/**
 * EventDeduplicator prevents double-processing of events.
 * 
 * Responsibilities:
 * - Track processed event IDs per room
 * - Prevent double-processing on retries
 * - Store event IDs with timestamps
 * - Cleanup old event IDs (TTL: 1 hour)
 */
export class EventDeduplicator {
  // Track processed events per room: Map<roomCode, Map<eventId, timestamp>>
  private processedEvents: Map<string, Map<string, number>> = new Map();
  
  // TTL for event IDs in milliseconds (default: 1 hour)
  private ttlMs: number;

  constructor(ttlMs: number = 3600000) {
    this.ttlMs = ttlMs;
  }

  /**
   * Check if an event has already been processed
   */
  isProcessed(eventId: string, roomCode: string): boolean {
    const roomEvents = this.processedEvents.get(roomCode);
    if (!roomEvents) {
      return false;
    }

    const timestamp = roomEvents.get(eventId);
    if (timestamp === undefined) {
      return false;
    }

    // Check if event is still within TTL
    const now = Date.now();
    if (now - timestamp > this.ttlMs) {
      // Event expired - remove it
      roomEvents.delete(eventId);
      return false;
    }

    return true;
  }

  /**
   * Mark an event as processed
   */
  markProcessed(event: GameEvent): void {
    const { id, roomCode } = event;
    const timestamp = Date.now();

    if (!this.processedEvents.has(roomCode)) {
      this.processedEvents.set(roomCode, new Map());
    }

    const roomEvents = this.processedEvents.get(roomCode)!;
    roomEvents.set(id, timestamp);

    console.log(`[EventDeduplicator] Marked event ${id} as processed for room ${roomCode}`);
  }

  /**
   * Mark an event as processed by ID
   */
  markProcessedById(eventId: string, roomCode: string): void {
    const timestamp = Date.now();

    if (!this.processedEvents.has(roomCode)) {
      this.processedEvents.set(roomCode, new Map());
    }

    const roomEvents = this.processedEvents.get(roomCode)!;
    roomEvents.set(eventId, timestamp);
  }

  /**
   * Remove an event from processed list (for testing or manual cleanup)
   */
  removeProcessed(eventId: string, roomCode: string): void {
    const roomEvents = this.processedEvents.get(roomCode);
    if (roomEvents) {
      roomEvents.delete(eventId);
    }
  }

  /**
   * Cleanup expired events
   */
  cleanupExpired(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [roomCode, roomEvents] of this.processedEvents) {
      const toRemove: string[] = [];

      for (const [eventId, timestamp] of roomEvents) {
        if (now - timestamp > this.ttlMs) {
          toRemove.push(eventId);
        }
      }

      for (const eventId of toRemove) {
        roomEvents.delete(eventId);
        cleanedCount++;
      }

      // Remove room entry if empty
      if (roomEvents.size === 0) {
        this.processedEvents.delete(roomCode);
      }
    }

    if (cleanedCount > 0) {
      console.log(`[EventDeduplicator] Cleaned up ${cleanedCount} expired event(s)`);
    }
  }

  /**
   * Clear all processed events for a room
   */
  clearRoom(roomCode: string): void {
    this.processedEvents.delete(roomCode);
    console.log(`[EventDeduplicator] Cleared processed events for room ${roomCode}`);
  }

  /**
   * Get count of processed events for a room
   */
  getProcessedCount(roomCode: string): number {
    const roomEvents = this.processedEvents.get(roomCode);
    return roomEvents ? roomEvents.size : 0;
  }

  /**
   * Set TTL for event IDs
   */
  setTTL(ttlMs: number): void {
    this.ttlMs = ttlMs;
  }

  /**
   * Get TTL
   */
  getTTL(): number {
    return this.ttlMs;
  }

  /**
   * Start periodic cleanup (call this on server startup)
   */
  startPeriodicCleanup(intervalMs: number = 300000): NodeJS.Timeout {
    return setInterval(() => {
      this.cleanupExpired();
    }, intervalMs);
  }
}

