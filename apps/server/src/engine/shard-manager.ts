/**
 * ShardManager provides foundation for horizontal scaling via room sharding.
 * 
 * Responsibilities:
 * - Assign rooms to shards
 * - Shard selection algorithm
 * - Cross-shard communication stub (for future)
 */
export class ShardManager {
  // Shard configuration
  private shardCount: number;
  private shardId: string;
  
  // Room to shard mapping: Map<roomCode, shardId>
  private roomShards: Map<string, string> = new Map();
  
  // Shard selection algorithm
  private algorithm: 'hash' | 'round-robin' | 'least-loaded';

  constructor(shardId: string = 'shard-1', shardCount: number = 1, algorithm: 'hash' | 'round-robin' | 'least-loaded' = 'hash') {
    this.shardId = shardId;
    this.shardCount = shardCount;
    this.algorithm = algorithm;
  }

  /**
   * Assign a room to a shard
   */
  assignRoom(roomCode: string): string {
    // Check if already assigned
    const existing = this.roomShards.get(roomCode);
    if (existing) {
      return existing;
    }

    let shardId: string;

    switch (this.algorithm) {
      case 'hash':
        // Hash-based assignment (consistent hashing)
        const hash = this.hashString(roomCode);
        shardId = `shard-${(hash % this.shardCount) + 1}`;
        break;
      
      case 'round-robin':
        // Round-robin assignment
        const index = this.roomShards.size % this.shardCount;
        shardId = `shard-${index + 1}`;
        break;
      
      case 'least-loaded':
        // Least-loaded assignment (stub - would need load metrics)
        shardId = this.shardId; // Default to current shard
        break;
      
      default:
        shardId = this.shardId;
    }

    this.roomShards.set(roomCode, shardId);
    console.log(`[ShardManager] Assigned room ${roomCode} to ${shardId}`);
    
    return shardId;
  }

  /**
   * Get shard for a room
   */
  getRoomShard(roomCode: string): string | null {
    return this.roomShards.get(roomCode) || null;
  }

  /**
   * Check if room belongs to this shard
   */
  isRoomOnThisShard(roomCode: string): boolean {
    const shard = this.getRoomShard(roomCode);
    return shard === this.shardId;
  }

  /**
   * Remove room from shard mapping
   */
  removeRoom(roomCode: string): void {
    this.roomShards.delete(roomCode);
  }

  /**
   * Hash string to number (simple hash function)
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Get current shard ID
   */
  getShardId(): string {
    return this.shardId;
  }

  /**
   * Get shard count
   */
  getShardCount(): number {
    return this.shardCount;
  }

  /**
   * Set shard count (for dynamic scaling)
   */
  setShardCount(count: number): void {
    this.shardCount = count;
  }

  /**
   * Cross-shard communication stub (for future implementation)
   */
  async sendToShard(targetShardId: string, message: any): Promise<void> {
    // Stub for future cross-shard communication
    // In production, this would use message queue or RPC
    console.log(`[ShardManager] Cross-shard message stub: ${targetShardId}`, message);
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalRooms: number;
    roomsPerShard: Record<string, number>;
  } {
    const roomsPerShard: Record<string, number> = {};
    
    for (const shardId of this.roomShards.values()) {
      roomsPerShard[shardId] = (roomsPerShard[shardId] || 0) + 1;
    }
    
    return {
      totalRooms: this.roomShards.size,
      roomsPerShard,
    };
  }
}

