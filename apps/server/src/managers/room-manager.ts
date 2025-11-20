import {
  Room,
  GameState,
  GameType,
  PlayerStatus,
  GlobalSettingsSchema,
  generateRoomCode,
  isExpired,
} from '@christmas/core';
import { SupabaseClient } from '@supabase/supabase-js';

/**
 * RoomManager handles room CRUD, persistence, and metadata.
 * Game/Player/Host management has been moved to specialized managers.
 */
export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private supabase: SupabaseClient | null = null;
  // Jukebox state per room (room metadata)
  private jukeboxState: Map<string, { currentTrack: number; isPlaying: boolean; shuffle: boolean; repeat: 'none' | 'one' | 'all'; volume: number }> = new Map();
  // Track disconnected hosts for TTL management
  private disconnectedHosts: Set<string> = new Set();

  setSupabaseClient(supabase: SupabaseClient | null) {
    this.supabase = supabase;
  }

  /**
   * Create a new room (called by HostManager)
   */
  createRoom(hostId: string, hostName: string, hostUserId?: string): Room {
    const code = this.generateUniqueCode();
    const now = Date.now();
    const expiresAt = now + 24 * 60 * 60 * 1000; // default 24 hours; tightened dynamically when empty

    // Host is NOT added to players list - they manage the room separately
    const settings = GlobalSettingsSchema.parse({ theme: {} });
    const room: Room = {
      code,
      hostId,
      createdAt: now,
      expiresAt,
      currentGame: null,
      gameState: GameState.LOBBY,
      players: new Map(), // Empty player list - host is separate
      settings,
    };
    
    // Save room to database if available (host token managed by HostManager)
    if (this.supabase) {
      Promise.resolve(this.supabase.from('rooms').insert({
        code,
        host_id: hostId,
        host_user_id: hostUserId || null,
        host_token: null, // Will be set by HostManager
        expires_at: new Date(expiresAt).toISOString(),
        last_accessed_at: new Date(now).toISOString(),
        room_name: null,
        description: null,
        player_count: 0,
        is_active: true,
      })).then(({ error }) => {
        if (error) {
          console.error('[Room] Failed to save room to database:', error);
        } else {
          console.log(`[Room] Saved room ${code} to database with host_user_id: ${hostUserId || 'none'}`);
        }
      }).catch((err: any) => {
        console.error('[Room] Failed to save room to database:', err);
      });
    }

    this.rooms.set(code, room);

    // Initialize jukebox state
    this.jukeboxState.set(code, {
      currentTrack: 0,
      isPlaying: false,
      shuffle: false,
      repeat: 'all',
      volume: 0.3,
    });

    return room;
  }


  /**
   * Load a room from the database by room code.
   * Reconstructs the Room object from database fields.
   * Returns null if room not found, expired, or inactive.
   * Returns room and host token if found.
   */
  async loadRoomFromDatabase(code: string): Promise<{ room: Room; hostToken?: string } | null> {
    if (!this.supabase) return null;

    try {
      const { data, error } = await this.supabase
        .from('rooms')
        .select('*')
        .eq('code', code)
        .single();

      if (error || !data) {
        return null;
      }

      // Check if room is active
      if (!data.is_active) {
        return null;
      }

      // Check expiration
      const expiresAt = new Date(data.expires_at).getTime();
      if (isExpired(expiresAt)) {
        return null;
      }

      // Parse settings from JSONB
      let settings;
      try {
        settings = GlobalSettingsSchema.parse(data.settings || {});
      } catch (parseError) {
        console.warn(`[Room] Failed to parse settings for room ${code}, using defaults:`, parseError);
        settings = GlobalSettingsSchema.parse({ theme: {} });
      }

      // Determine game state from current_game
      let gameState = GameState.LOBBY;
      if (data.current_game) {
        // If there's a current game, assume it's in progress
        // We can't fully restore game state, so default to LOBBY
        // The host will need to restart the game if needed
        gameState = GameState.LOBBY;
      }

      // Reconstruct Room object
      const room: Room = {
        code: data.code,
        hostId: data.host_id, // Note: This will be the original host_id, may need updating
        createdAt: new Date(data.created_at).getTime(),
        expiresAt,
        currentGame: data.current_game as GameType | null,
        gameState,
        players: new Map(), // Player list is not persisted, starts empty
        settings,
      };

      return { room, hostToken: data.host_token || undefined };
    } catch (error) {
      console.error(`[Room] Failed to load room ${code} from database:`, error);
      return null;
    }
  }

  /**
   * Restore a room to memory (add to rooms map).
   * Host tokens are managed by HostManager.
   */
  restoreRoomToMemory(room: Room, hostToken?: string): void {
    this.rooms.set(room.code, room);
    // Initialize jukebox state if not present
    if (!this.jukeboxState.has(room.code)) {
      this.jukeboxState.set(room.code, {
        currentTrack: 0,
        isPlaying: false,
        shuffle: false,
        repeat: 'all',
        volume: 0.3,
      });
    }
    console.log(`[Room] Restored room ${room.code} to memory`);
  }

  /**
   * Restore all active, non-expired rooms from the database.
   * Called on server startup to restore room persistence.
   * Note: Host and player token restoration should be handled by HostManager and PlayerManager after rooms are restored.
   */
  async restoreActiveRooms(): Promise<Array<{ room: Room; hostToken?: string }>> {
    if (!this.supabase) {
      console.log('[Room] Database not available, skipping room restoration');
      return [];
    }

    try {
      const now = new Date().toISOString();
      const { data, error } = await this.supabase
        .from('rooms')
        .select('*')
        .eq('is_active', true)
        .gt('expires_at', now);

      if (error) {
        console.error('[Room] Failed to load active rooms from database:', error);
        return [];
      }

      if (!data || data.length === 0) {
        console.log('[Room] No active rooms to restore');
        return [];
      }

      const restoredRooms: Array<{ room: Room; hostToken?: string }> = [];
      for (const roomData of data) {
        try {
          const expiresAt = new Date(roomData.expires_at).getTime();
          
          // Double-check expiration
          if (isExpired(expiresAt)) {
            continue;
          }

          // Parse settings
          let settings;
          try {
            settings = GlobalSettingsSchema.parse(roomData.settings || {});
          } catch (parseError) {
            console.warn(`[Room] Failed to parse settings for room ${roomData.code}, using defaults:`, parseError);
            settings = GlobalSettingsSchema.parse({ theme: {} });
          }

          // Reconstruct Room object
          const room: Room = {
            code: roomData.code,
            hostId: roomData.host_id,
            createdAt: new Date(roomData.created_at).getTime(),
            expiresAt,
            currentGame: roomData.current_game as GameType | null,
            gameState: GameState.LOBBY, // Always start in LOBBY after restart
            players: new Map(), // Player list starts empty
            settings,
          };

          // Restore room with token from database
          const hostToken = roomData.host_token || undefined;
          this.restoreRoomToMemory(room, hostToken);
          
          restoredRooms.push({ room, hostToken });

        } catch (roomError) {
          console.error(`[Room] Failed to restore room ${roomData.code}:`, roomError);
        }
      }

      console.log(`[Room] Restored ${restoredRooms.length} active room(s) from database`);
      return restoredRooms;
    } catch (error) {
      console.error('[Room] Failed to restore active rooms:', error);
      return [];
    }
  }

  // ========================================================================
  // Player operations moved to PlayerManager
  // ========================================================================
  
  // joinRoom, leaveRoom, player token management moved to PlayerManager

  // ========================================================================
  // Room CRUD Operations
  // ========================================================================

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  // getRoomByPlayer moved to PlayerManager

  getRoomByHost(hostId: string): Room | undefined {
    for (const room of this.rooms.values()) {
      if (room.hostId === hostId) {
        return room;
      }
    }
    return undefined;
  }

  // getRoomBySocketId, updatePlayerLastSeen moved to RoomEngine/ConnectionManager

  // ========================================================================
  // Game operations moved to GameManager
  // ========================================================================
  
  // startGame, endGame, getGame, session leaderboards moved to GameManager

  // Cleanup
  cleanupExpiredRooms(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms.entries()) {
      if (isExpired(room.expiresAt)) {
        this.deleteRoom(code);
      }
    }
  }

  private deleteRoom(code: string): void {
    const room = this.rooms.get(code);
    if (!room) return;

    // Mark room as inactive in database (so host can create a new room)
    if (this.supabase) {
      (async () => {
        try {
          const { error } = await this.supabase!
            .from('rooms')
            .update({ is_active: false })
            .eq('code', code);
          
          if (error) {
            console.error('[Room] Failed to mark room as inactive in database:', error);
          } else {
            console.log(`[Room] Marked room ${code} as inactive in database`);
          }
        } catch (err: any) {
          console.error('[Room] Error marking room as inactive:', err);
        }
      })();
    }

    // Cleanup disconnected hosts tracking
    this.disconnectedHosts.delete(code);

    // Cleanup jukebox state
    this.jukeboxState.delete(code);

    // Remove room from memory
    // Note: Player/game/token cleanup handled by PlayerManager, GameManager, HostManager
    this.rooms.delete(code);
  }

  private generateUniqueCode(): string {
    let code: string;
    do {
      code = generateRoomCode(4);
    } while (this.rooms.has(code));
    return code;
  }

  getActiveRoomCount(): number {
    return this.rooms.size;
  }

  getTotalPlayerCount(): number {
    let total = 0;
    for (const room of this.rooms.values()) {
      total += room.players.size;
    }
    return total;
  }

  // ========================================================================
  // Host operations moved to HostManager (kept for backward compatibility)
  // ========================================================================
  
  // Host token methods, room settings, deactivate/reactivate/regenerate moved to HostManager
  // These methods are kept but should be accessed through RoomEngine/HostManager

  /**
   * Update last accessed timestamp for a room
   */
  async updateLastAccessed(code: string): Promise<void> {
    if (!this.supabase) return;

    try {
      await this.supabase
        .from('rooms')
        .update({ last_accessed_at: new Date().toISOString() })
        .eq('code', code);
    } catch (error) {
      // Silently fail - not critical
      console.error('[Room] Failed to update last_accessed_at:', error);
    }
  }

  // ==============================
  // Jukebox state management
  // ==============================

  getJukeboxState(roomCode: string): { currentTrack: number; isPlaying: boolean; shuffle: boolean; repeat: 'none' | 'one' | 'all'; volume: number } | null {
    return this.jukeboxState.get(roomCode) || null;
  }

  setJukeboxState(roomCode: string, state: { currentTrack: number; isPlaying: boolean; shuffle: boolean; repeat: 'none' | 'one' | 'all'; volume: number }): void {
    this.jukeboxState.set(roomCode, state);
  }

  updateJukeboxState(roomCode: string, updates: Partial<{ currentTrack: number; isPlaying: boolean; shuffle: boolean; repeat: 'none' | 'one' | 'all'; volume: number }>): void {
    const current = this.jukeboxState.get(roomCode);
    if (current) {
      this.jukeboxState.set(roomCode, { ...current, ...updates });
    }
  }

  // ==============================
  // TTL utilities
  // ==============================
  updateRoomExpiryOnActivity(roomCode: string): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    const anyConnectedPlayers = Array.from(room.players.values()).some(p => p.status === PlayerStatus.CONNECTED);
    const hostDisconnected = this.disconnectedHosts.has(roomCode);
    const now = Date.now();
    if (!anyConnectedPlayers && hostDisconnected) {
      // No one connected - set TTL to 30 minutes to give players more time to reconnect
      room.expiresAt = now + 30 * 60 * 1000;
      console.log(`[Room] Room ${roomCode} has no connected players and host is disconnected, setting expiration to 30 minutes`);
    } else {
      // Active room - extend out to 24h
      room.expiresAt = now + 24 * 60 * 60 * 1000;
    }
    // Persist change best-effort
    if (this.supabase) {
      Promise.resolve(this.supabase.from('rooms').update({
        expires_at: new Date(room.expiresAt).toISOString(),
      }).eq('code', roomCode)).catch(() => {});
    }
  }
}
