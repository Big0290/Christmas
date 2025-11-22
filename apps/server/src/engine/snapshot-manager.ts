import { Room, BaseGameState } from '@christmas/core';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * Snapshot of room state at a specific version
 */
export interface RoomSnapshot {
  roomCode: string;
  version: number;
  timestamp: number;
  roomState: Room;
  gameState: BaseGameState | null;
  compressed: boolean;
  data: Buffer | any; // Compressed or uncompressed data
}

/**
 * SnapshotManager creates and manages full state snapshots.
 * 
 * Responsibilities:
 * - Store snapshots periodically (configurable interval, default: every 10 state changes)
 * - Store snapshots on critical transitions (game start, round end, game end)
 * - Compress snapshots for storage efficiency
 * - Provide methods to retrieve snapshots for late joiners
 */
export class SnapshotManager {
  // Store snapshots per room: Map<roomCode, Map<version, RoomSnapshot>>
  private snapshots: Map<string, Map<number, RoomSnapshot>> = new Map();
  
  // Snapshot interval (default: every 10 state changes)
  private snapshotInterval: number;
  
  // Track last snapshot version per room: Map<roomCode, version>
  private lastSnapshotVersion: Map<string, number> = new Map();
  
  // Enable compression (default: true)
  private compressionEnabled: boolean;
  
  // Maximum snapshots per room (default: 10)
  private maxSnapshotsPerRoom: number;

  constructor(
    snapshotInterval: number = 10,
    compressionEnabled: boolean = true,
    maxSnapshotsPerRoom: number = 10
  ) {
    this.snapshotInterval = snapshotInterval;
    this.compressionEnabled = compressionEnabled;
    this.maxSnapshotsPerRoom = maxSnapshotsPerRoom;
  }

  /**
   * Create a snapshot for a room
   */
  async createSnapshot(
    roomCode: string,
    room: Room,
    gameState: BaseGameState | null
  ): Promise<RoomSnapshot> {
    const version = room.version;
    const timestamp = Date.now();

    // Prepare snapshot data
    const snapshotData = {
      roomCode: room.code,
      hostId: room.hostId,
      createdAt: room.createdAt,
      expiresAt: room.expiresAt,
      currentGame: room.currentGame,
      gameState: room.gameState,
      players: Array.from(room.players.entries()).map(([id, player]) => {
        // Ensure id matches the map key
        if (player.id !== id) {
          return { ...player, id };
        }
        return player;
      }),
      settings: room.settings,
      version: room.version,
      lastStateMutation: room.lastStateMutation,
      gameStateData: gameState,
    };

    let data: Buffer | any = snapshotData;
    let compressed = false;

    // Compress if enabled
    if (this.compressionEnabled) {
      try {
        const jsonString = JSON.stringify(snapshotData);
        data = await gzip(Buffer.from(jsonString, 'utf-8'));
        compressed = true;
      } catch (error) {
        console.warn(`[SnapshotManager] Failed to compress snapshot for room ${roomCode}, storing uncompressed:`, error);
        compressed = false;
      }
    }

    const snapshot: RoomSnapshot = {
      roomCode,
      version,
      timestamp,
      roomState: room,
      gameState,
      compressed,
      data,
    };

    // Store snapshot
    if (!this.snapshots.has(roomCode)) {
      this.snapshots.set(roomCode, new Map());
    }

    const roomSnapshots = this.snapshots.get(roomCode)!;
    roomSnapshots.set(version, snapshot);
    this.lastSnapshotVersion.set(roomCode, version);

    // Limit snapshots per room
    if (roomSnapshots.size > this.maxSnapshotsPerRoom) {
      const versions = Array.from(roomSnapshots.keys()).sort((a, b) => a - b);
      const toRemove = versions.slice(0, versions.length - this.maxSnapshotsPerRoom);
      for (const v of toRemove) {
        roomSnapshots.delete(v);
      }
    }

    console.log(
      `[SnapshotManager] Created snapshot v${version} for room ${roomCode} (compressed: ${compressed})`
    );

    return snapshot;
  }

  /**
   * Get a snapshot by version
   */
  async getSnapshot(roomCode: string, version: number): Promise<RoomSnapshot | null> {
    const roomSnapshots = this.snapshots.get(roomCode);
    if (!roomSnapshots) {
      return null;
    }

    const snapshot = roomSnapshots.get(version);
    if (!snapshot) {
      return null;
    }

    // Decompress if needed
    if (snapshot.compressed && Buffer.isBuffer(snapshot.data)) {
      try {
        const decompressed = await gunzip(snapshot.data);
        snapshot.data = JSON.parse(decompressed.toString('utf-8'));
        snapshot.compressed = false;
      } catch (error) {
        console.error(`[SnapshotManager] Failed to decompress snapshot:`, error);
        return null;
      }
    }

    return snapshot;
  }

  /**
   * Get the latest snapshot for a room
   */
  async getLatestSnapshot(roomCode: string): Promise<RoomSnapshot | null> {
    const lastVersion = this.lastSnapshotVersion.get(roomCode);
    if (lastVersion === undefined) {
      return null;
    }

    return this.getSnapshot(roomCode, lastVersion);
  }

  /**
   * Get snapshot closest to a specific version (for late joiners)
   */
  async getSnapshotClosestToVersion(roomCode: string, targetVersion: number): Promise<RoomSnapshot | null> {
    const roomSnapshots = this.snapshots.get(roomCode);
    if (!roomSnapshots || roomSnapshots.size === 0) {
      return null;
    }

    // Find closest snapshot version
    const versions = Array.from(roomSnapshots.keys()).sort((a, b) => a - b);
    
    // Find snapshot with version <= targetVersion
    let closestVersion = 0;
    for (const version of versions) {
      if (version <= targetVersion && version > closestVersion) {
        closestVersion = version;
      }
    }

    if (closestVersion === 0) {
      // No snapshot <= targetVersion, return earliest
      closestVersion = versions[0];
    }

    return this.getSnapshot(roomCode, closestVersion);
  }

  /**
   * Check if a snapshot should be created based on interval
   */
  shouldCreateSnapshot(roomCode: string, currentVersion: number): boolean {
    const lastVersion = this.lastSnapshotVersion.get(roomCode) || 0;
    const versionDiff = currentVersion - lastVersion;
    return versionDiff >= this.snapshotInterval;
  }

  /**
   * Check if snapshot should be created for critical transition
   */
  shouldCreateSnapshotForTransition(
    roomCode: string,
    transition: string
  ): boolean {
    const criticalTransitions = [
      'game_start',
      'round_end',
      'game_end',
      'round_start',
    ];
    return criticalTransitions.includes(transition);
  }

  /**
   * Clear snapshots for a room
   */
  clearSnapshots(roomCode: string): void {
    this.snapshots.delete(roomCode);
    this.lastSnapshotVersion.delete(roomCode);
    console.log(`[SnapshotManager] Cleared snapshots for room ${roomCode}`);
  }

  /**
   * Get snapshot count for a room
   */
  getSnapshotCount(roomCode: string): number {
    const roomSnapshots = this.snapshots.get(roomCode);
    return roomSnapshots ? roomSnapshots.size : 0;
  }

  /**
   * Get latest snapshot version for a room
   */
  getLatestSnapshotVersion(roomCode: string): number {
    return this.lastSnapshotVersion.get(roomCode) || 0;
  }

  /**
   * Set snapshot interval
   */
  setSnapshotInterval(interval: number): void {
    this.snapshotInterval = interval;
  }

  /**
   * Cleanup old snapshots (remove snapshots older than specified TTL in ms)
   */
  cleanupOldSnapshots(ttlMs: number = 3600000): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [roomCode, roomSnapshots] of this.snapshots) {
      const toRemove: number[] = [];
      
      for (const [version, snapshot] of roomSnapshots) {
        if (now - snapshot.timestamp > ttlMs) {
          toRemove.push(version);
        }
      }

      for (const version of toRemove) {
        roomSnapshots.delete(version);
        cleanedCount++;
      }

      if (roomSnapshots.size === 0) {
        this.snapshots.delete(roomCode);
        this.lastSnapshotVersion.delete(roomCode);
      }
    }

    if (cleanedCount > 0) {
      console.log(`[SnapshotManager] Cleaned up ${cleanedCount} old snapshot(s)`);
    }
  }
}

