/**
 * Metrics data structure
 */
export interface RoomMetrics {
  roomCode: string;
  eventRate: number; // Events per second
  snapshotRate: number; // Snapshots per minute
  ackLatency: number; // Average ACK latency in ms
  roomHealth: 'healthy' | 'degraded' | 'unhealthy';
  playerCount: number;
  gameState: string;
  lastUpdate: number;
}

/**
 * MetricsCollector tracks system metrics for observability.
 * 
 * Responsibilities:
 * - Track event rate
 * - Track snapshot rate
 * - Track ACK latency
 * - Track room health
 * - Export metrics to Prometheus format (optional)
 */
export class MetricsCollector {
  // Room metrics: Map<roomCode, RoomMetrics>
  private roomMetrics: Map<string, RoomMetrics> = new Map();
  
  // Event counters: Map<roomCode, { count: number; windowStart: number }>
  private eventCounters: Map<string, { count: number; windowStart: number }> = new Map();
  
  // Snapshot counters: Map<roomCode, { count: number; windowStart: number }>
  private snapshotCounters: Map<string, { count: number; windowStart: number }> = new Map();
  
  // ACK latency samples: Map<roomCode, number[]>
  private ackLatencies: Map<string, number[]> = new Map();
  
  // Metrics collection window (1 minute)
  private windowMs: number = 60000;

  /**
   * Record an event for a room
   */
  recordEvent(roomCode: string): void {
    const now = Date.now();
    const counter = this.eventCounters.get(roomCode) || { count: 0, windowStart: now };
    
    // Reset counter if window expired
    if (now - counter.windowStart > this.windowMs) {
      counter.count = 0;
      counter.windowStart = now;
    }
    
    counter.count++;
    this.eventCounters.set(roomCode, counter);
    
    this.updateRoomMetrics(roomCode);
  }

  /**
   * Record a snapshot for a room
   */
  recordSnapshot(roomCode: string): void {
    const now = Date.now();
    const counter = this.snapshotCounters.get(roomCode) || { count: 0, windowStart: now };
    
    // Reset counter if window expired
    if (now - counter.windowStart > this.windowMs) {
      counter.count = 0;
      counter.windowStart = now;
    }
    
    counter.count++;
    this.snapshotCounters.set(roomCode, counter);
    
    this.updateRoomMetrics(roomCode);
  }

  /**
   * Record ACK latency for a room
   */
  recordAckLatency(roomCode: string, latencyMs: number): void {
    if (!this.ackLatencies.has(roomCode)) {
      this.ackLatencies.set(roomCode, []);
    }
    
    const latencies = this.ackLatencies.get(roomCode)!;
    latencies.push(latencyMs);
    
    // Keep only last 100 samples
    if (latencies.length > 100) {
      latencies.shift();
    }
    
    this.updateRoomMetrics(roomCode);
  }

  /**
   * Update room metrics
   */
  private updateRoomMetrics(roomCode: string): void {
    const eventCounter = this.eventCounters.get(roomCode);
    const snapshotCounter = this.snapshotCounters.get(roomCode);
    const latencies = this.ackLatencies.get(roomCode) || [];
    
    const now = Date.now();
    const eventWindowSeconds = eventCounter ? (now - eventCounter.windowStart) / 1000 : 1;
    const eventRate = eventCounter && eventWindowSeconds > 0 
      ? eventCounter.count / eventWindowSeconds 
      : 0;
    
    const snapshotWindowMinutes = snapshotCounter ? (now - snapshotCounter.windowStart) / 60000 : 1;
    const snapshotRate = snapshotCounter && snapshotWindowMinutes > 0
      ? snapshotCounter.count / snapshotWindowMinutes
      : 0;
    
    const avgLatency = latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : 0;
    
    // Determine room health
    let roomHealth: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (avgLatency > 500 || eventRate > 100) {
      roomHealth = 'unhealthy';
    } else if (avgLatency > 300 || eventRate > 50) {
      roomHealth = 'degraded';
    }
    
    const metrics: RoomMetrics = {
      roomCode,
      eventRate,
      snapshotRate,
      ackLatency: avgLatency,
      roomHealth,
      playerCount: 0, // Will be updated by caller
      gameState: 'unknown',
      lastUpdate: now,
    };
    
    this.roomMetrics.set(roomCode, metrics);
  }

  /**
   * Get metrics for a room
   */
  getRoomMetrics(roomCode: string): RoomMetrics | null {
    this.updateRoomMetrics(roomCode);
    return this.roomMetrics.get(roomCode) || null;
  }

  /**
   * Get all room metrics
   */
  getAllMetrics(): RoomMetrics[] {
    // Update all metrics
    for (const roomCode of this.roomMetrics.keys()) {
      this.updateRoomMetrics(roomCode);
    }
    
    return Array.from(this.roomMetrics.values());
  }

  /**
   * Update room metadata (player count, game state)
   */
  updateRoomMetadata(roomCode: string, playerCount: number, gameState: string): void {
    const metrics = this.roomMetrics.get(roomCode);
    if (metrics) {
      metrics.playerCount = playerCount;
      metrics.gameState = gameState;
      metrics.lastUpdate = Date.now();
    }
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheusFormat(): string {
    const lines: string[] = [];
    
    for (const metrics of this.getAllMetrics()) {
      lines.push(`# Room: ${metrics.roomCode}`);
      lines.push(`game_engine_event_rate{room="${metrics.roomCode}"} ${metrics.eventRate}`);
      lines.push(`game_engine_snapshot_rate{room="${metrics.roomCode}"} ${metrics.snapshotRate}`);
      lines.push(`game_engine_ack_latency_ms{room="${metrics.roomCode}"} ${metrics.ackLatency}`);
      lines.push(`game_engine_room_health{room="${metrics.roomCode}",health="${metrics.roomHealth}"} 1`);
      lines.push(`game_engine_player_count{room="${metrics.roomCode}"} ${metrics.playerCount}`);
      lines.push('');
    }
    
    return lines.join('\n');
  }

  /**
   * Cleanup metrics for a room
   */
  cleanupRoom(roomCode: string): void {
    this.roomMetrics.delete(roomCode);
    this.eventCounters.delete(roomCode);
    this.snapshotCounters.delete(roomCode);
    this.ackLatencies.delete(roomCode);
  }

  /**
   * Cleanup old metrics
   */
  cleanup(maxAgeMs: number = 3600000): void {
    const now = Date.now();
    
    for (const [roomCode, metrics] of this.roomMetrics) {
      if (now - metrics.lastUpdate > maxAgeMs) {
        this.cleanupRoom(roomCode);
      }
    }
  }
}

