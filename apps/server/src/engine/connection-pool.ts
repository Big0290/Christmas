import { Server, Socket } from 'socket.io';

/**
 * Connection pool optimization for Socket.IO room management.
 * 
 * Responsibilities:
 * - Optimize Socket.IO room management
 * - Pre-allocate room sockets (conceptual)
 * - Connection reuse tracking
 * - Reduce memory overhead
 */
export class ConnectionPool {
  private io: Server | null = null;
  
  // Track room memberships: Map<roomCode, Set<socketId>>
  private roomMemberships: Map<string, Set<string>> = new Map();
  
  // Track socket rooms: Map<socketId, Set<roomCode>>
  private socketRooms: Map<string, Set<string>> = new Map();
  
  // Connection reuse tracking: Map<socketId, { connectedAt: number; lastUsed: number }>
  private connectionInfo: Map<string, { connectedAt: number; lastUsed: number }> = new Map();

  constructor(io: Server) {
    this.io = io;
  }

  /**
   * Add socket to room (optimized)
   */
  joinRoom(socketId: string, roomCode: string): void {
    if (!this.roomMemberships.has(roomCode)) {
      this.roomMemberships.set(roomCode, new Set());
    }
    
    this.roomMemberships.get(roomCode)!.add(socketId);
    
    if (!this.socketRooms.has(socketId)) {
      this.socketRooms.set(socketId, new Set());
    }
    
    this.socketRooms.get(socketId)!.add(roomCode);
    
    // Update connection info
    const now = Date.now();
    if (!this.connectionInfo.has(socketId)) {
      this.connectionInfo.set(socketId, { connectedAt: now, lastUsed: now });
    } else {
      const info = this.connectionInfo.get(socketId)!;
      info.lastUsed = now;
    }
  }

  /**
   * Remove socket from room
   */
  leaveRoom(socketId: string, roomCode: string): void {
    const roomMembers = this.roomMemberships.get(roomCode);
    if (roomMembers) {
      roomMembers.delete(socketId);
      if (roomMembers.size === 0) {
        this.roomMemberships.delete(roomCode);
      }
    }
    
    const socketRooms = this.socketRooms.get(socketId);
    if (socketRooms) {
      socketRooms.delete(roomCode);
      if (socketRooms.size === 0) {
        this.socketRooms.delete(socketId);
      }
    }
  }

  /**
   * Get sockets in a room
   */
  getSocketsInRoom(roomCode: string): string[] {
    const members = this.roomMemberships.get(roomCode);
    return members ? Array.from(members) : [];
  }

  /**
   * Get rooms for a socket
   */
  getRoomsForSocket(socketId: string): string[] {
    const rooms = this.socketRooms.get(socketId);
    return rooms ? Array.from(rooms) : [];
  }

  /**
   * Check if socket is in room
   */
  isSocketInRoom(socketId: string, roomCode: string): boolean {
    const members = this.roomMemberships.get(roomCode);
    return members ? members.has(socketId) : false;
  }

  /**
   * Remove socket completely (cleanup on disconnect)
   */
  removeSocket(socketId: string): void {
    const rooms = this.socketRooms.get(socketId);
    if (rooms) {
      for (const roomCode of rooms) {
        const members = this.roomMemberships.get(roomCode);
        if (members) {
          members.delete(socketId);
          if (members.size === 0) {
            this.roomMemberships.delete(roomCode);
          }
        }
      }
    }
    
    this.socketRooms.delete(socketId);
    this.connectionInfo.delete(socketId);
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    totalSockets: number;
    totalRooms: number;
    averageRoomsPerSocket: number;
    averageSocketsPerRoom: number;
  } {
    const totalSockets = this.socketRooms.size;
    const totalRooms = this.roomMemberships.size;
    
    let totalRoomMemberships = 0;
    for (const members of this.roomMemberships.values()) {
      totalRoomMemberships += members.size;
    }
    
    const averageRoomsPerSocket = totalSockets > 0 ? totalRoomMemberships / totalSockets : 0;
    const averageSocketsPerRoom = totalRooms > 0 ? totalRoomMemberships / totalRooms : 0;
    
    return {
      totalSockets,
      totalRooms,
      averageRoomsPerSocket,
      averageSocketsPerRoom,
    };
  }

  /**
   * Cleanup old connections
   */
  cleanup(maxIdleMs: number = 3600000): void {
    const now = Date.now();
    const toRemove: string[] = [];
    
    for (const [socketId, info] of this.connectionInfo) {
      if (now - info.lastUsed > maxIdleMs) {
        toRemove.push(socketId);
      }
    }
    
    for (const socketId of toRemove) {
      this.removeSocket(socketId);
    }
    
    if (toRemove.length > 0) {
      console.log(`[ConnectionPool] Cleaned up ${toRemove.length} idle connection(s)`);
    }
  }
}

