/**
 * Batched update entry
 */
export interface BatchedUpdate {
  roomCode: string;
  data: any;
  timestamp: number;
  priority: 'low' | 'normal' | 'high';
}

/**
 * BatchManager batches frequent updates to reduce network load.
 * 
 * Responsibilities:
 * - Batch frequent updates (10-20 Hz for movement)
 * - Configurable batch size and interval
 * - Flush batches on state transitions
 * - Priority-based batching
 */
export class BatchManager {
  // Pending batches per room: Map<roomCode, BatchedUpdate[]>
  private batches: Map<string, BatchedUpdate[]> = new Map();
  
  // Batch intervals per room: Map<roomCode, NodeJS.Timeout>
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  
  // Flush callbacks: Map<roomCode, (updates: BatchedUpdate[]) => void>
  private flushCallbacks: Map<string, (updates: BatchedUpdate[]) => void> = new Map();
  
  // Batch interval in milliseconds (default: 50ms = 20 Hz)
  private batchIntervalMs: number;
  
  // Maximum batch size before forced flush
  private maxBatchSize: number;

  constructor(batchIntervalMs: number = 50, maxBatchSize: number = 100) {
    this.batchIntervalMs = batchIntervalMs;
    this.maxBatchSize = maxBatchSize;
  }

  /**
   * Register a room for batching
   */
  registerRoom(
    roomCode: string,
    flushCallback: (updates: BatchedUpdate[]) => void
  ): void {
    if (this.batches.has(roomCode)) {
      // Already registered
      return;
    }

    this.batches.set(roomCode, []);
    this.flushCallbacks.set(roomCode, flushCallback);

    // Start batch interval
    const interval = setInterval(() => {
      this.flushBatch(roomCode);
    }, this.batchIntervalMs);

    this.intervals.set(roomCode, interval);

    console.log(`[BatchManager] Registered room ${roomCode} for batching (${this.batchIntervalMs}ms interval)`);
  }

  /**
   * Unregister a room (stop batching)
   */
  unregisterRoom(roomCode: string): void {
    const interval = this.intervals.get(roomCode);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(roomCode);
    }

    // Flush any pending updates
    this.flushBatch(roomCode);

    this.batches.delete(roomCode);
    this.flushCallbacks.delete(roomCode);

    console.log(`[BatchManager] Unregistered room ${roomCode}`);
  }

  /**
   * Add an update to the batch
   */
  addUpdate(
    roomCode: string,
    data: any,
    priority: 'low' | 'normal' | 'high' = 'normal'
  ): void {
    if (!this.batches.has(roomCode)) {
      console.warn(`[BatchManager] Room ${roomCode} not registered, cannot batch update`);
      return;
    }

    const batch = this.batches.get(roomCode)!;
    const update: BatchedUpdate = {
      roomCode,
      data,
      timestamp: Date.now(),
      priority,
    };

    batch.push(update);

    // Force flush if batch is too large
    if (batch.length >= this.maxBatchSize) {
      console.log(`[BatchManager] Batch size exceeded for room ${roomCode}, forcing flush`);
      this.flushBatch(roomCode);
    }

    // Immediate flush for high priority updates
    if (priority === 'high') {
      this.flushBatch(roomCode);
    }
  }

  /**
   * Flush batch for a room
   */
  flushBatch(roomCode: string): void {
    const batch = this.batches.get(roomCode);
    if (!batch || batch.length === 0) {
      return;
    }

    const callback = this.flushCallbacks.get(roomCode);
    if (!callback) {
      console.warn(`[BatchManager] No flush callback for room ${roomCode}`);
      return;
    }

    // Sort by priority (high -> normal -> low) and timestamp
    const sortedBatch = [...batch].sort((a, b) => {
      const priorityOrder = { high: 0, normal: 1, low: 2 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return a.timestamp - b.timestamp;
    });

    // Clear batch
    this.batches.set(roomCode, []);

    // Call flush callback
    callback(sortedBatch);

    console.log(`[BatchManager] Flushed ${sortedBatch.length} update(s) for room ${roomCode}`);
  }

  /**
   * Flush all batches (useful on state transitions)
   */
  flushAll(): void {
    for (const roomCode of this.batches.keys()) {
      this.flushBatch(roomCode);
    }
  }

  /**
   * Get pending update count for a room
   */
  getPendingCount(roomCode: string): number {
    const batch = this.batches.get(roomCode);
    return batch ? batch.length : 0;
  }

  /**
   * Set batch interval for a room
   */
  setBatchInterval(roomCode: string, intervalMs: number): void {
    const existingInterval = this.intervals.get(roomCode);
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    const interval = setInterval(() => {
      this.flushBatch(roomCode);
    }, intervalMs);

    this.intervals.set(roomCode, interval);
    this.batchIntervalMs = intervalMs;
  }

  /**
   * Get batch interval
   */
  getBatchInterval(): number {
    return this.batchIntervalMs;
  }

  /**
   * Cleanup all batches and intervals
   */
  cleanup(): void {
    for (const [roomCode, interval] of this.intervals) {
      clearInterval(interval);
      this.flushBatch(roomCode);
    }

    this.batches.clear();
    this.intervals.clear();
    this.flushCallbacks.clear();
  }
}

