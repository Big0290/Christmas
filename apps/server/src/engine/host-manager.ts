import { Room, isExpired } from '@christmas/core';
import { SupabaseClient } from '@supabase/supabase-js';
import type { RoomManager } from '../managers/room-manager.js';

/**
 * HostManager handles all host-specific operations:
 * - Room creation/deletion
 * - Host authentication & token management
 * - Host reconnection handling
 * - Host-specific room operations (reactivate, regenerate token, etc.)
 */
export class HostManager {
  private roomToHostToken: Map<string, string> = new Map();
  private hostTokenToRoom: Map<string, string> = new Map();
  private disconnectedHosts: Set<string> = new Set(); // room codes with disconnected host
  private supabase: SupabaseClient | null = null;

  constructor(private roomManager: RoomManager) {}

  setSupabaseClient(supabase: SupabaseClient | null) {
    this.supabase = supabase;
  }

  /**
   * Get room by host user ID (for one-room-per-host architecture)
   */
  async getRoomByHostUserId(userId: string): Promise<Room | null> {
    if (!this.supabase || !userId) return null;

    try {
      const { data, error } = await this.supabase
        .from('rooms')
        .select('*')
        .eq('host_user_id', userId)
        .eq('is_active', true)
        .order('last_accessed_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        return null;
      }

      // Check if room is already in memory
      const existingRoom = this.roomManager.getRoom(data.code);
      if (existingRoom) {
        return existingRoom;
      }

      // Load room from database
      const loaded = await (this.roomManager as any).loadRoomFromDatabase(data.code);
      if (loaded) {
        (this.roomManager as any).restoreRoomToMemory(loaded.room, loaded.hostToken);
        if (loaded.hostToken) {
          this.roomToHostToken.set(data.code, loaded.hostToken);
          this.hostTokenToRoom.set(loaded.hostToken, data.code);
        }
        return loaded.room;
      }

      return null;
    } catch (error) {
      console.error('[HostManager] Error getting room by host user ID:', error);
      return null;
    }
  }

  /**
   * Create or get existing room for host
   */
  async createOrGetRoom(hostId: string, hostName: string, hostUserId?: string): Promise<Room> {
    // First, check for in-memory room by socket ID (hostId)
    const inMemoryRoom = this.roomManager.getRoomByHost(hostId);
    if (inMemoryRoom) {
      // Reactivate if expired
      if (isExpired(inMemoryRoom.expiresAt)) {
        const newExpiresAt = Date.now() + 24 * 60 * 60 * 1000;
        inMemoryRoom.expiresAt = newExpiresAt;
        await (this.roomManager as any).updateLastAccessed(inMemoryRoom.code);
        console.log(`[HostManager] Reactivated expired room ${inMemoryRoom.code} for host ${hostId}`);
      }

      // Ensure room is marked as active in database
      if (this.supabase) {
        this.supabase
          .from('rooms')
          .update({ is_active: true, last_accessed_at: new Date().toISOString() })
          .eq('code', inMemoryRoom.code)
          .then(({ error }) => {
            if (error) {
              console.error('[HostManager] Failed to reactivate room in database:', error);
            }
          });
      }

      console.log(`[HostManager] Restored existing in-memory room ${inMemoryRoom.code} for host ${hostId}`);
      return inMemoryRoom;
    }

    // Second, check database for active room by user_id (if provided)
    if (hostUserId && this.supabase) {
      const dbRoom = await this.getRoomByHostUserId(hostUserId);
      if (dbRoom) {
        // Reactivate if expired
        if (isExpired(dbRoom.expiresAt)) {
          const newExpiresAt = Date.now() + 24 * 60 * 60 * 1000;
          dbRoom.expiresAt = newExpiresAt;
          await (this.roomManager as any).updateLastAccessed(dbRoom.code);
          console.log(`[HostManager] Reactivated expired room ${dbRoom.code} for host ${hostUserId}`);
        }

        // Update host socket ID if changed
        if (dbRoom.hostId !== hostId) {
          dbRoom.hostId = hostId;
          console.log(`[HostManager] Updated host socket ID for room ${dbRoom.code}`);
        }

        console.log(`[HostManager] Restored existing database room ${dbRoom.code} for host ${hostUserId}`);
        return dbRoom;
      }
    }

    // No active room found - host can create a new room
    console.log(`[HostManager] No active room found for host ${hostId} (user: ${hostUserId || 'none'}), creating new room`);
    return this.createRoom(hostId, hostName, hostUserId);
  }

  /**
   * Create a new room for a host
   */
  async createRoom(hostId: string, hostName: string, hostUserId?: string): Promise<Room> {
    // Delegate room creation to RoomManager but manage host tokens
    const room = (this.roomManager as any).createRoom(hostId, hostName, hostUserId);
    
    // Issue host token and store mapping
    const hostToken = this.generateToken();
    this.roomToHostToken.set(room.code, hostToken);
    this.hostTokenToRoom.set(hostToken, room.code);
    
    // Save room to database with host token if available
    if (this.supabase) {
      Promise.resolve(this.supabase.from('rooms').update({
        host_token: hostToken,
      }).eq('code', room.code)).then(({ error }) => {
        if (error) {
          console.error('[HostManager] Failed to save host token to database:', error);
        } else {
          console.log(`[HostManager] Saved host token for room ${room.code}`);
        }
      }).catch((err: any) => {
        console.error('[HostManager] Failed to save host token to database:', err);
      });
    }

    return room;
  }

  /**
   * Restore room to memory with host token
   */
  restoreRoomToMemory(room: Room, hostToken?: string): void {
    (this.roomManager as any).restoreRoomToMemory(room, hostToken);
    if (hostToken) {
      this.roomToHostToken.set(room.code, hostToken);
      this.hostTokenToRoom.set(hostToken, room.code);
    }
    console.log(`[HostManager] Restored room ${room.code} to memory with host token`);
  }

  /**
   * Get host token for a room
   */
  getHostToken(roomCode: string): string | undefined {
    return this.roomToHostToken.get(roomCode);
  }

  /**
   * Get room code by host token
   */
  getRoomCodeByHostToken(token: string): string | undefined {
    return this.hostTokenToRoom.get(token);
  }

  /**
   * Update host socket ID (for reconnection)
   */
  updateHostSocket(roomCode: string, newHostSocketId: string): void {
    const room = this.roomManager.getRoom(roomCode);
    if (!room) return;
    room.hostId = newHostSocketId;
    this.disconnectedHosts.delete(roomCode);
    // Activity resets TTL
    (this.roomManager as any).updateRoomExpiryOnActivity(roomCode);
    console.log(`[HostManager] Updated host socket ID for room ${roomCode} to ${newHostSocketId.substring(0, 8)}`);
  }

  /**
   * Mark host as disconnected
   */
  markHostDisconnected(roomCode: string): void {
    this.disconnectedHosts.add(roomCode);
    (this.roomManager as any).updateRoomExpiryOnActivity(roomCode);
    console.log(`[HostManager] Marked host as disconnected for room ${roomCode}`);
  }

  /**
   * Check if host is disconnected
   */
  isHostDisconnected(roomCode: string): boolean {
    return this.disconnectedHosts.has(roomCode);
  }

  /**
   * Get all rooms created by a specific host user ID
   */
  async getRoomsByHostUserId(userId: string): Promise<Array<{
    code: string;
    room_name: string | null;
    description: string | null;
    is_active: boolean;
    player_count: number;
    created_at: string;
    last_accessed_at: string;
    expires_at: string;
    current_game: string | null;
  }>> {
    if (!this.supabase) return [];

    try {
      const { data, error } = await this.supabase
        .from('rooms')
        .select('code, room_name, description, is_active, player_count, created_at, last_accessed_at, expires_at, current_game')
        .eq('host_user_id', userId)
        .order('last_accessed_at', { ascending: false });

      if (error) {
        console.error('[HostManager] Failed to get rooms by host user ID:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('[HostManager] Error getting rooms by host user ID:', error);
      return [];
    }
  }

  /**
   * Get host token from database for a room
   */
  async getHostTokenFromDatabase(code: string, userId: string): Promise<string | null> {
    if (!this.supabase) return null;

    try {
      const { data, error } = await this.supabase
        .from('rooms')
        .select('host_token')
        .eq('code', code)
        .eq('host_user_id', userId)
        .eq('is_active', true)
        .single();

      if (error || !data || !data.host_token) {
        // If token not found, try to restore room anyway
        console.log(`[HostManager] Host token not found for room ${code}, attempting to restore room...`);
        const room = await this.getRoomByHostUserId(userId);
        if (room && room.code === code) {
          // Room restored, token might be missing - log warning
          console.warn(`[HostManager] Room ${code} restored but host token is missing`);
        }
        return null;
      }

      // Restore token to memory mappings
      const token = data.host_token;
      this.roomToHostToken.set(code, token);
      this.hostTokenToRoom.set(token, code);
      
      console.log(`[HostManager] Restored host token for room ${code} from database`);

      return token;
    } catch (error) {
      console.error('[HostManager] Failed to get host token from database:', error);
      return null;
    }
  }

  /**
   * Restore all host tokens from database (called on startup)
   */
  async restoreAllHostTokens(): Promise<number> {
    if (!this.supabase) return 0;

    try {
      const { data, error } = await this.supabase
        .from('rooms')
        .select('code, host_token')
        .eq('is_active', true)
        .not('host_token', 'is', null);

      if (error || !data || data.length === 0) {
        return 0;
      }

      let restoredCount = 0;
      for (const roomData of data) {
        if (roomData.host_token && !this.roomToHostToken.has(roomData.code)) {
          this.roomToHostToken.set(roomData.code, roomData.host_token);
          this.hostTokenToRoom.set(roomData.host_token, roomData.code);
          restoredCount++;
        }
      }

      if (restoredCount > 0) {
        console.log(`[HostManager] Restored ${restoredCount} host token(s) from database`);
      }

      return restoredCount;
    } catch (error) {
      console.error('[HostManager] Failed to restore all host tokens:', error);
      return 0;
    }
  }

  /**
   * Update room settings (host operation)
   */
  async updateRoomSettings(code: string, settings: {
    room_name?: string;
    description?: string;
  }): Promise<boolean> {
    return await (this.roomManager as any).updateRoomSettings(code, settings);
  }

  /**
   * Deactivate a room (soft delete)
   */
  async deactivateRoom(code: string, userId: string): Promise<boolean> {
    const room = this.roomManager.getRoom(code);
    if (!room) return false;

    // Verify user owns the room
    if (this.supabase) {
      const { data } = await this.supabase
        .from('rooms')
        .select('host_user_id')
        .eq('code', code)
        .single();

      if (!data || data.host_user_id !== userId) {
        return false;
      }
    }

    // Set inactive in database
    if (this.supabase) {
      try {
        const { error } = await this.supabase
          .from('rooms')
          .update({ is_active: false })
          .eq('code', code);

        if (error) {
          console.error('[HostManager] Failed to deactivate room:', error);
          return false;
        }
      } catch (error) {
        console.error('[HostManager] Error deactivating room:', error);
        return false;
      }
    }

    // Cleanup token mappings
    const hostToken = this.roomToHostToken.get(code);
    if (hostToken) {
      this.roomToHostToken.delete(code);
      this.hostTokenToRoom.delete(hostToken);
    }
    this.disconnectedHosts.delete(code);

    // Remove from memory via RoomManager
    (this.roomManager as any).deleteRoom(code);
    return true;
  }

  /**
   * Reactivate an expired or inactive room
   */
  async reactivateRoom(code: string, userId: string): Promise<{ success: boolean; token?: string; error?: string }> {
    if (!this.supabase) {
      return { success: false, error: 'Database not available' };
    }

    try {
      // Check if room exists and user owns it
      const { data: roomData, error: fetchError } = await this.supabase
        .from('rooms')
        .select('host_user_id, expires_at')
        .eq('code', code)
        .single();

      if (fetchError || !roomData) {
        return { success: false, error: 'Room not found' };
      }

      if (roomData.host_user_id !== userId) {
        return { success: false, error: 'Unauthorized' };
      }

      // Generate new token
      const newToken = this.generateToken();
      const newExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      // Update room in database
      const { error: updateError } = await this.supabase
        .from('rooms')
        .update({
          is_active: true,
          host_token: newToken,
          expires_at: newExpiresAt,
          last_accessed_at: new Date().toISOString(),
        })
        .eq('code', code);

      if (updateError) {
        console.error('[HostManager] Failed to reactivate room:', updateError);
        return { success: false, error: 'Failed to reactivate room' };
      }

      // Restore room to memory if not already there
      let room = this.roomManager.getRoom(code);
      if (!room) {
        const loaded = await (this.roomManager as any).loadRoomFromDatabase(code);
        if (loaded) {
          this.restoreRoomToMemory(loaded.room, loaded.hostToken);
          room = loaded.room;
        }
      }

      if (room) {
        // Update token mappings
        const oldToken = this.roomToHostToken.get(code);
        if (oldToken) {
          this.hostTokenToRoom.delete(oldToken);
        }
        this.roomToHostToken.set(code, newToken);
        this.hostTokenToRoom.set(newToken, code);
        room.expiresAt = new Date(newExpiresAt).getTime();
      }

      return { success: true, token: newToken };
    } catch (error) {
      console.error('[HostManager] Error reactivating room:', error);
      return { success: false, error: 'Failed to reactivate room' };
    }
  }

  /**
   * Regenerate host token for a room
   */
  async regenerateHostToken(code: string, userId: string): Promise<{ success: boolean; token?: string; error?: string }> {
    const room = this.roomManager.getRoom(code);
    if (!room && this.supabase) {
      // Try loading from database
      const loaded = await (this.roomManager as any).loadRoomFromDatabase(code);
      if (loaded) {
        this.restoreRoomToMemory(loaded.room, loaded.hostToken);
      }
    }

    if (!this.supabase) {
      return { success: false, error: 'Database not available' };
    }

    try {
      // Verify user owns the room
      const { data } = await this.supabase
        .from('rooms')
        .select('host_user_id')
        .eq('code', code)
        .single();

      if (!data || data.host_user_id !== userId) {
        return { success: false, error: 'Unauthorized' };
      }

      // Generate new token
      const newToken = this.generateToken();

      // Update database
      const { error } = await this.supabase
        .from('rooms')
        .update({ host_token: newToken })
        .eq('code', code);

      if (error) {
        console.error('[HostManager] Failed to regenerate host token:', error);
        return { success: false, error: 'Failed to regenerate token' };
      }

      // Update memory mappings
      const oldToken = this.roomToHostToken.get(code);
      if (oldToken) {
        this.hostTokenToRoom.delete(oldToken);
      }
      this.roomToHostToken.set(code, newToken);
      this.hostTokenToRoom.set(newToken, code);

      return { success: true, token: newToken };
    } catch (error) {
      console.error('[HostManager] Error regenerating host token:', error);
      return { success: false, error: 'Failed to regenerate token' };
    }
  }

  /**
   * Verify host token and get room code
   */
  verifyHostToken(token: string): string | null {
    const roomCode = this.hostTokenToRoom.get(token);
    return roomCode || null;
  }

  /**
   * Generate a unique host token
   */
  private generateToken(): string {
    return `tok_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }
}

