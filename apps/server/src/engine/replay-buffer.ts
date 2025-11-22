import { GameEvent } from '@christmas/core';

/**
 * ReplayBuffer stores the last N events per room for reconnecting clients.
 * 
 * Responsibilities:
 * - Store events with metadata (id, type, timestamp, version, data, roomCode)
 * - Configurable buffer size (default: 100 events)
 * - Circular buffer implementation
 * - Provide methods to retrieve events for replay
 */
export class ReplayBuffer {
  // Store events per room: Map<roomCode, GameEvent[]>
  private buffers: Map<string, GameEvent[]> = new Map();
  
  // Buffer size per room (default: 100)
  private bufferSize: number;

  constructor(bufferSize: number = 100) {
    this.bufferSize = bufferSize;
  }

  /**
   * Add an event to the replay buffer
   */
  addEvent(event: GameEvent): void {
    const { roomCode } = event;
    
    // Initialize buffer for room if needed
    if (!this.buffers.has(roomCode)) {
      this.buffers.set(roomCode, []);
    }

    const buffer = this.buffers.get(roomCode)!;
    
    // Add event
    buffer.push(event);
    
    // Maintain buffer size (circular buffer)
    if (buffer.length > this.bufferSize) {
      buffer.shift(); // Remove oldest event
    }

    console.log(
      `[ReplayBuffer] Added event ${event.id} to room ${roomCode} buffer (${buffer.length}/${this.bufferSize})`
    );
  }

  /**
   * Get all events for a room
   */
  getEvents(roomCode: string): GameEvent[] {
    const buffer = this.buffers.get(roomCode);
    return buffer ? [...buffer] : [];
  }

  /**
   * Get events since a specific version
   */
  getEventsSince(roomCode: string, version: number): GameEvent[] {
    const buffer = this.buffers.get(roomCode);
    if (!buffer) {
      return [];
    }

    return buffer.filter(event => event.version >= version);
  }

  /**
   * Get events since a specific timestamp
   */
  getEventsSinceTimestamp(roomCode: string, timestamp: number): GameEvent[] {
    const buffer = this.buffers.get(roomCode);
    if (!buffer) {
      return [];
    }

    return buffer.filter(event => event.timestamp >= timestamp);
  }

  /**
   * Get events between two versions
   */
  getEventsBetween(roomCode: string, fromVersion: number, toVersion: number): GameEvent[] {
    const buffer = this.buffers.get(roomCode);
    if (!buffer) {
      return [];
    }

    return buffer.filter(
      event => event.version >= fromVersion && event.version <= toVersion
    );
  }

  /**
   * Get the latest event for a room
   */
  getLatestEvent(roomCode: string): GameEvent | null {
    const buffer = this.buffers.get(roomCode);
    if (!buffer || buffer.length === 0) {
      return null;
    }

    return buffer[buffer.length - 1];
  }

  /**
   * Get the latest version in the buffer for a room
   */
  getLatestVersion(roomCode: string): number {
    const latest = this.getLatestEvent(roomCode);
    return latest ? latest.version : 0;
  }

  /**
   * Clear buffer for a room
   */
  clear(roomCode: string): void {
    this.buffers.delete(roomCode);
    console.log(`[ReplayBuffer] Cleared buffer for room ${roomCode}`);
  }

  /**
   * Get buffer size for a room
   */
  getBufferSize(roomCode: string): number {
    const buffer = this.buffers.get(roomCode);
    return buffer ? buffer.length : 0;
  }

  /**
   * Set buffer size (applies to new events)
   */
  setBufferSize(size: number): void {
    this.bufferSize = size;
    
    // Trim existing buffers if needed
    for (const [roomCode, buffer] of this.buffers) {
      if (buffer.length > size) {
        this.buffers.set(roomCode, buffer.slice(-size));
      }
    }
  }

  /**
   * Cleanup old events (remove events older than specified TTL in ms)
   */
  cleanupOldEvents(ttlMs: number = 3600000): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [roomCode, buffer] of this.buffers) {
      const initialLength = buffer.length;
      const filtered = buffer.filter(event => now - event.timestamp < ttlMs);
      
      if (filtered.length < initialLength) {
        this.buffers.set(roomCode, filtered);
        cleanedCount += initialLength - filtered.length;
      }
    }

    if (cleanedCount > 0) {
      console.log(`[ReplayBuffer] Cleaned up ${cleanedCount} old event(s)`);
    }
  }

  /**
   * Get statistics for a room's buffer
   */
  getStats(roomCode: string): {
    eventCount: number;
    oldestVersion: number;
    latestVersion: number;
    oldestTimestamp: number;
    latestTimestamp: number;
  } | null {
    const buffer = this.buffers.get(roomCode);
    if (!buffer || buffer.length === 0) {
      return null;
    }

    const versions = buffer.map(e => e.version);
    const timestamps = buffer.map(e => e.timestamp);

    return {
      eventCount: buffer.length,
      oldestVersion: Math.min(...versions),
      latestVersion: Math.max(...versions),
      oldestTimestamp: Math.min(...timestamps),
      latestTimestamp: Math.max(...timestamps),
    };
  }
}

