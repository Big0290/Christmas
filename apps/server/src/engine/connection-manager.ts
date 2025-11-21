import { Socket } from 'socket.io';

/**
 * ConnectionManager handles socket connection/disconnection lifecycle
 * and maintains socket-to-room mappings.
 */
export class ConnectionManager {
  // Track which room each socket is connected to (as host or player)
  private socketToRoom: Map<string, string> = new Map();
  
  // Track connection state
  private socketStates: Map<string, {
    connected: boolean;
    lastSeen: number;
    isHost: boolean;
    role?: 'player' | 'host-control' | 'host-display';
  }> = new Map();
  
  // Track operations in progress to prevent race conditions
  private operationsInProgress: Map<string, Promise<any>> = new Map();
  
  // Track reconnection attempts per socket
  private reconnectionAttempts: Map<string, {
    count: number;
    lastAttempt: number;
    backoffMs: number;
  }> = new Map();
  
  private readonly MAX_RECONNECTION_ATTEMPTS = 5;
  private readonly INITIAL_BACKOFF_MS = 1000; // 1 second
  private readonly MAX_BACKOFF_MS = 30000; // 30 seconds

  /**
   * Register a socket connection
   */
  registerConnection(socketId: string, roomCode: string, isHost: boolean, role?: 'player' | 'host-control' | 'host-display'): void {
    // Check if already registered (might be reconnection or update)
    const existingState = this.socketStates.get(socketId);
    const wasDisconnected = existingState && !existingState.connected;
    
    this.socketToRoom.set(socketId, roomCode);
    this.socketStates.set(socketId, {
      connected: true, // Always mark as connected when registering
      lastSeen: Date.now(),
      isHost,
      role: role || (isHost ? 'host-control' : 'player'), // Default role based on isHost
    });
    
    // Reset reconnection attempts on successful registration
    this.resetReconnectionAttempts(socketId);
    
    if (wasDisconnected) {
      console.log(`[ConnectionManager] Socket ${socketId.substring(0, 8)} reconnected during registration`);
    }
    console.log(`[ConnectionManager] Registered ${isHost ? 'host' : 'player'} socket ${socketId.substring(0, 8)} to room ${roomCode} with role ${this.socketStates.get(socketId)?.role || 'unknown'}`);
  }

  /**
   * Update socket-to-room mapping (for reconnection or role change)
   */
  updateSocketRoom(socketId: string, roomCode: string, isHost: boolean, role?: 'player' | 'host-control' | 'host-display'): void {
    const wasDisconnected = this.socketStates.get(socketId)?.connected === false;
    this.socketToRoom.set(socketId, roomCode);
    const state = this.socketStates.get(socketId);
    if (state) {
      state.isHost = isHost;
      state.lastSeen = Date.now();
      state.connected = true; // Always mark as connected when updating
      if (role !== undefined) {
        state.role = role;
      } else if (!state.role) {
        state.role = isHost ? 'host-control' : 'player'; // Default role if not set
      }
      // Reset reconnection attempts on successful connection
      this.resetReconnectionAttempts(socketId);
      if (wasDisconnected) {
        console.log(`[ConnectionManager] Socket ${socketId.substring(0, 8)} reconnected from disconnected state`);
      }
    } else {
      this.socketStates.set(socketId, {
        connected: true,
        lastSeen: Date.now(),
        isHost,
        role: role || (isHost ? 'host-control' : 'player'),
      });
      // Reset reconnection attempts on successful connection
      this.resetReconnectionAttempts(socketId);
    }
    console.log(`[ConnectionManager] Updated socket ${socketId.substring(0, 8)} mapping: room ${roomCode}, isHost: ${isHost}, role: ${this.socketStates.get(socketId)?.role || 'unknown'}`);
  }

  /**
   * Get socket role
   */
  getSocketRole(socketId: string): 'player' | 'host-control' | 'host-display' | undefined {
    return this.socketStates.get(socketId)?.role;
  }

  /**
   * Execute operation with lock to prevent race conditions
   */
  private async executeWithLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    // Check if operation is already in progress
    const existingOperation = this.operationsInProgress.get(key);
    if (existingOperation) {
      // Wait for existing operation to complete
      try {
        await existingOperation;
      } catch (error) {
        // Ignore errors from previous operation
      }
    }
    
    // Execute new operation
    const promise = operation().finally(() => {
      // Remove from in-progress map when done
      this.operationsInProgress.delete(key);
    });
    
    this.operationsInProgress.set(key, promise);
    return promise;
  }

  /**
   * Handle socket disconnection (with locking to prevent race conditions)
   */
  async handleDisconnection(socketId: string): Promise<{
    roomCode: string | null;
    isHost: boolean;
  } | null> {
    return this.executeWithLock(`disconnect:${socketId}`, async () => {
      const roomCode = this.socketToRoom.get(socketId) || null;
      const state = this.socketStates.get(socketId);
      
      if (state) {
        state.connected = false;
        state.lastSeen = Date.now();
        console.log(`[ConnectionManager] Marked socket ${socketId.substring(0, 8)} as disconnected (room: ${roomCode || 'none'}, isHost: ${state.isHost})`);
        return { roomCode, isHost: state.isHost };
      }
      
      if (roomCode) {
        // Socket had a room but no state - return basic info
        console.log(`[ConnectionManager] Socket ${socketId.substring(0, 8)} disconnected (room: ${roomCode}, state unknown)`);
        return { roomCode, isHost: false };
      }
      
      return null;
    });
  }
  
  /**
   * Synchronous version of handleDisconnection for backwards compatibility
   * Use handleDisconnectionAsync for new code to avoid race conditions
   */
  handleDisconnectionSync(socketId: string): {
    roomCode: string | null;
    isHost: boolean;
  } | null {
    const roomCode = this.socketToRoom.get(socketId) || null;
    const state = this.socketStates.get(socketId);
    
    // Check if already marked as disconnected to avoid duplicate logging
    const alreadyDisconnected = state && !state.connected;
    
    if (state) {
      state.connected = false;
      state.lastSeen = Date.now();
      if (!alreadyDisconnected) {
        console.log(`[ConnectionManager] Marked socket ${socketId.substring(0, 8)} as disconnected (room: ${roomCode || 'none'}, isHost: ${state.isHost})`);
      }
      return { roomCode, isHost: state.isHost };
    }
    
    if (roomCode) {
      // Socket had a room but no state - return basic info
      console.log(`[ConnectionManager] Socket ${socketId.substring(0, 8)} disconnected (room: ${roomCode}, state unknown)`);
      return { roomCode, isHost: false };
    }
    
    return null;
  }

  /**
   * Remove socket completely (for explicit leave)
   */
  removeSocket(socketId: string): string | null {
    const roomCode = this.socketToRoom.get(socketId) || null;
    this.socketToRoom.delete(socketId);
    this.socketStates.delete(socketId);
    if (roomCode) {
      console.log(`[ConnectionManager] Removed socket ${socketId.substring(0, 8)} from room ${roomCode}`);
    }
    return roomCode;
  }

  /**
   * Get room code for a socket
   */
  getRoomForSocket(socketId: string): string | null {
    return this.socketToRoom.get(socketId) || null;
  }

  /**
   * Get room info for a socket (room code and whether it's a host)
   */
  getRoomInfoBySocketId(socketId: string): {
    roomCode: string;
    isHost: boolean;
  } | null {
    const roomCode = this.socketToRoom.get(socketId);
    if (!roomCode) {
      return null;
    }
    
    const state = this.socketStates.get(socketId);
    return {
      roomCode,
      isHost: state?.isHost || false,
    };
  }

  /**
   * Get connection info for a socket
   */
  getSocketInfo(socketId: string): {
    roomCode: string | null;
    isHost: boolean;
    connected: boolean;
    lastSeen: number;
  } | null {
    const roomCode = this.socketToRoom.get(socketId) || null;
    const state = this.socketStates.get(socketId);
    
    if (!state && !roomCode) {
      return null;
    }
    
    return {
      roomCode,
      isHost: state?.isHost || false,
      connected: state?.connected || false,
      lastSeen: state?.lastSeen || Date.now(),
    };
  }

  /**
   * Check if socket is connected
   */
  isSocketConnected(socketId: string): boolean {
    const state = this.socketStates.get(socketId);
    return state?.connected || false;
  }

  /**
   * Update last seen timestamp for a socket
   */
  updateLastSeen(socketId: string): void {
    const state = this.socketStates.get(socketId);
    if (state) {
      state.lastSeen = Date.now();
    }
  }

  /**
   * Get all sockets in a room
   */
  getSocketsInRoom(roomCode: string): string[] {
    const sockets: string[] = [];
    for (const [socketId, room] of this.socketToRoom.entries()) {
      if (room === roomCode) {
        sockets.push(socketId);
      }
    }
    return sockets;
  }

  /**
   * Sync ConnectionManager state with actual Socket.IO state
   * Removes orphaned connections that don't exist in Socket.IO
   * IMPORTANT: Only removes connections that are stale (no activity for 5+ minutes)
   * This prevents removing newly connected sockets that haven't registered yet
   */
  syncWithSocketIO(activeSockets: Set<string>): {
    removed: number;
    stale: number;
  } {
    let removed = 0;
    let stale = 0;
    const now = Date.now();
    const STALE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
    const MIN_AGE_FOR_REMOVAL = 30 * 1000; // 30 seconds - give new connections time to register
    
    // Find orphaned sockets (in ConnectionManager but not in Socket.IO)
    const orphaned: string[] = [];
    for (const socketId of this.socketToRoom.keys()) {
      if (!activeSockets.has(socketId)) {
        const state = this.socketStates.get(socketId);
        const age = state ? (now - state.lastSeen) : 0;
        
        // Only remove if connection is old enough (prevents removing newly registered sockets)
        // and either stale (no activity for threshold) or has no state record
        if (age > MIN_AGE_FOR_REMOVAL) {
          if (state && age > STALE_THRESHOLD) {
            orphaned.push(socketId);
            stale++;
          } else if (!state) {
            // No state record and old enough - consider orphaned
            orphaned.push(socketId);
            removed++;
          }
        }
        // If socket is newly registered (< 30 seconds), don't remove it yet
        // This prevents race conditions where socket connects, registers, but health check runs before Socket.IO updates
      }
    }
    
    // Remove orphaned sockets
    for (const socketId of orphaned) {
      this.socketToRoom.delete(socketId);
      this.socketStates.delete(socketId);
    }
    
    if (removed > 0 || stale > 0) {
      console.log(`[ConnectionManager] Synced with Socket.IO: removed ${removed} orphaned, ${stale} stale connections`);
    }
    
    return { removed, stale };
  }

  /**
   * Get all stale connections (no activity for X minutes)
   */
  getStaleConnections(thresholdMinutes: number = 5): string[] {
    const now = Date.now();
    const threshold = thresholdMinutes * 60 * 1000;
    const stale: string[] = [];
    
    for (const [socketId, state] of this.socketStates.entries()) {
      if (!state.connected && (now - state.lastSeen) > threshold) {
        stale.push(socketId);
      }
    }
    
    return stale;
  }

  /**
   * Clean up stale connections
   */
  cleanupStaleConnections(thresholdMinutes: number = 5): number {
    const stale = this.getStaleConnections(thresholdMinutes);
    for (const socketId of stale) {
      this.removeSocket(socketId);
    }
    return stale.length;
  }

  /**
   * Get connection health metrics
   */
  getHealthMetrics(): {
    totalConnections: number;
    connected: number;
    disconnected: number;
    stale: number;
  } {
    let connected = 0;
    let disconnected = 0;
    const now = Date.now();
    const STALE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
    let stale = 0;
    
    for (const state of this.socketStates.values()) {
      if (state.connected) {
        connected++;
      } else {
        disconnected++;
        if ((now - state.lastSeen) > STALE_THRESHOLD) {
          stale++;
        }
      }
    }
    
    return {
      totalConnections: this.socketStates.size,
      connected,
      disconnected,
      stale,
    };
  }

  /**
   * Record a reconnection attempt for a socket
   */
  recordReconnectionAttempt(socketId: string): { shouldRetry: boolean; backoffMs: number } {
    const now = Date.now();
    const attempt = this.reconnectionAttempts.get(socketId);
    
    if (!attempt) {
      // First attempt
      this.reconnectionAttempts.set(socketId, {
        count: 1,
        lastAttempt: now,
        backoffMs: this.INITIAL_BACKOFF_MS,
      });
      return { shouldRetry: true, backoffMs: this.INITIAL_BACKOFF_MS };
    }
    
    // Check if we've exceeded max attempts
    if (attempt.count >= this.MAX_RECONNECTION_ATTEMPTS) {
      console.warn(`[ConnectionManager] Socket ${socketId.substring(0, 8)} exceeded max reconnection attempts (${this.MAX_RECONNECTION_ATTEMPTS})`);
      return { shouldRetry: false, backoffMs: 0 };
    }
    
    // Calculate exponential backoff
    const newBackoff = Math.min(attempt.backoffMs * 2, this.MAX_BACKOFF_MS);
    attempt.count++;
    attempt.lastAttempt = now;
    attempt.backoffMs = newBackoff;
    
    this.reconnectionAttempts.set(socketId, attempt);
    
    return { shouldRetry: true, backoffMs: newBackoff };
  }

  /**
   * Reset reconnection attempts for a socket (on successful reconnection)
   */
  resetReconnectionAttempts(socketId: string): void {
    this.reconnectionAttempts.delete(socketId);
  }

  /**
   * Get reconnection attempt info for a socket
   */
  getReconnectionAttempts(socketId: string): { count: number; lastAttempt: number; backoffMs: number } | null {
    return this.reconnectionAttempts.get(socketId) || null;
  }

  /**
   * Check if socket can attempt reconnection
   */
  canAttemptReconnection(socketId: string): boolean {
    const attempt = this.reconnectionAttempts.get(socketId);
    if (!attempt) return true;
    
    if (attempt.count >= this.MAX_RECONNECTION_ATTEMPTS) {
      return false;
    }
    
    // Check if enough time has passed since last attempt
    const timeSinceLastAttempt = Date.now() - attempt.lastAttempt;
    return timeSinceLastAttempt >= attempt.backoffMs;
  }

  /**
   * Clear all data (for testing/cleanup)
   */
  clear(): void {
    this.socketToRoom.clear();
    this.socketStates.clear();
    this.operationsInProgress.clear();
    this.reconnectionAttempts.clear();
  }
}

