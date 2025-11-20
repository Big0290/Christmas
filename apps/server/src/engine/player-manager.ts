import { Room, Player, PlayerStatus, generateAvatar, isExpired } from '@christmas/core';
import { SupabaseClient } from '@supabase/supabase-js';
import type { RoomManager } from '../managers/room-manager.js';
import type { GameManager } from './game-manager.js';

/**
 * PlayerManager handles all player-specific operations:
 * - Player join/leave operations
 * - Player token management
 * - Player reconnection handling
 * - Player profile management
 * - Player-to-room mappings
 */
export class PlayerManager {
  private playerToRoom: Map<string, string> = new Map();
  private playerIdToToken: Map<string, string> = new Map();
  private playerTokenToInfo: Map<string, { roomCode: string; name: string }> = new Map();
  private supabase: SupabaseClient | null = null;

  constructor(
    private roomManager: RoomManager,
    private gameManager?: GameManager
  ) {}

  setSupabaseClient(supabase: SupabaseClient | null) {
    this.supabase = supabase;
  }

  /**
   * Join a room as a player
   */
  async joinRoom(
    code: string,
    playerId: string,
    playerName: string,
    preferredAvatar?: string,
    language: 'en' | 'fr' = 'en'
  ): Promise<{ success: boolean; room?: Room; player?: Player; error?: string }> {
    let room = this.roomManager.getRoom(code);

    // If room not in memory, try loading from database
    if (!room) {
      const loaded = await (this.roomManager as any).loadRoomFromDatabase(code);
      if (loaded) {
        // Double-check if room was added by another concurrent request
        room = this.roomManager.getRoom(code);
        if (!room) {
          // Only restore if still not in memory (prevents race condition)
          room = loaded.room;
          (this.roomManager as any).restoreRoomToMemory(loaded.room, loaded.hostToken);
          console.log(`[PlayerManager] Restored room ${code} from database`);
        } else {
          console.log(`[PlayerManager] Room ${code} was already restored by concurrent request, using existing room`);
        }
      } else {
        return { success: false, error: 'Room not found' };
      }
    }

    // Ensure room exists before proceeding
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    if (isExpired(room.expiresAt)) {
      return { success: false, error: 'Room has expired' };
    }

    // CRITICAL FIX: Check if socket ID already exists first (primary identifier)
    // This prevents replacing active players when a different player joins
    const existingPlayerBySocketId = room.players.get(playerId);
    if (existingPlayerBySocketId) {
      // Socket ID already exists - player is already in room, just update status
      existingPlayerBySocketId.status = PlayerStatus.CONNECTED;
      existingPlayerBySocketId.lastSeen = Date.now();
      if (language) {
        existingPlayerBySocketId.language = language;
      }
      console.log(`[PlayerManager] Player ${playerName} (${playerId.substring(0, 8)}) already in room ${code} with same socket ID, updating status`);
      return { success: true, room, player: existingPlayerBySocketId };
    }

    // Check if player with same name already exists (for reconnection only)
    // Only match by name if we're looking for a disconnected player to reconnect
    let existingPlayerByName: Player | undefined;
    for (const player of room.players.values()) {
      if (player.name.toLowerCase() === playerName.toLowerCase()) {
        existingPlayerByName = player;
        break;
      }
    }

    if (existingPlayerByName) {
      // Player with same name exists - check if it's a reconnection scenario
      if (existingPlayerByName.id === playerId) {
        // Same socket ID - should have been caught above, but handle gracefully
        existingPlayerByName.status = PlayerStatus.CONNECTED;
        existingPlayerByName.lastSeen = Date.now();
        if (language) {
          existingPlayerByName.language = language;
        }
        console.log(`[PlayerManager] Player ${playerName} (${playerId.substring(0, 8)}) already in room ${code}, updating status`);
        return { success: true, room, player: existingPlayerByName };
      } else if (existingPlayerByName.status === PlayerStatus.DISCONNECTED) {
        // CRITICAL: Only replace if player is DISCONNECTED
        // Reconnecting disconnected player with different socket ID
        const oldPlayerId = existingPlayerByName.id;
        room.players.delete(oldPlayerId);
        this.playerToRoom.delete(oldPlayerId);
        
        // Clean up old socket from ConnectionManager (if it exists)
        // Note: This will be done by RoomEngine after we return, but we flag it for cleanup
        (this as any)._oldSocketIdToCleanup = oldPlayerId;

        existingPlayerByName.id = playerId;
        existingPlayerByName.status = PlayerStatus.CONNECTED;
        existingPlayerByName.lastSeen = Date.now();
        if (language) {
          existingPlayerByName.language = language;
        }

        room.players.set(playerId, existingPlayerByName);
        this.playerToRoom.set(playerId, code);

        console.log(`[PlayerManager] ✅ Player ${playerName} reconnected to room ${code} with new socket ID (old: ${oldPlayerId.substring(0, 8)}, new: ${playerId.substring(0, 8)})`);
        return { success: true, room, player: existingPlayerByName };
      } else {
        // CRITICAL FIX: Player with same name is CONNECTED with different socket ID
        // This is a different player trying to use the same name
        // We should reject this to prevent confusion, OR allow it if names can be duplicated
        // For now, we'll allow duplicate names (different socket IDs = different players)
        // But log a warning
        console.log(`[PlayerManager] ⚠️ Player ${playerName} already exists with different socket ID (existing: ${existingPlayerByName.id.substring(0, 8)}, new: ${playerId.substring(0, 8)}). Allowing both players with same name.`);
        // Continue to create new player below - don't replace the existing one
      }
    }

    // Validate socket ID uniqueness (defensive check - should already be unique)
    if (room.players.has(playerId)) {
      console.error(`[PlayerManager] ❌ Socket ID ${playerId.substring(0, 8)} already exists in room ${code} - this should not happen!`);
      return { success: false, error: 'Socket ID collision detected' };
    }

    // Check room capacity (only count connected players)
    const connectedPlayers = Array.from(room.players.values()).filter(
      p => p.status === PlayerStatus.CONNECTED
    );
    if (connectedPlayers.length >= room.settings.maxPlayers) {
      console.log(`[PlayerManager] Room ${code} is full (${connectedPlayers.length}/${room.settings.maxPlayers} connected players)`);
      return { success: false, error: 'Room is full' };
    }

    // Load player profile to get preferred avatar
    let avatar = preferredAvatar;
    let avatarStyle = room.settings.avatarStyle;
    
    if (!avatar) {
      const profile = await this.loadPlayerProfile(playerName);
      if (profile?.preferredAvatar) {
        avatar = profile.preferredAvatar;
        avatarStyle = (profile.avatarStyle as any) || room.settings.avatarStyle;
      } else {
        // Generate new avatar if no preference exists
        avatar = generateAvatar(room.settings.avatarStyle);
      }
    }

    const player: Player = {
      id: playerId,
      name: playerName,
      avatar: avatar,
      status: PlayerStatus.CONNECTED,
      score: 0,
      joinedAt: Date.now(),
      lastSeen: Date.now(),
      language: language,
    };

    room.players.set(playerId, player);
    this.playerToRoom.set(playerId, code);

    console.log(`[PlayerManager] ✅ New player ${playerName} (${playerId.substring(0, 8)}) added to room ${code}. Total players: ${room.players.size}, Connected: ${connectedPlayers.length + 1}`);

    // Save avatar preference to profile
    if (avatar && this.supabase) {
      this.savePlayerAvatar(playerName, avatar, avatarStyle).catch((err) => {
        console.error('[PlayerManager] Failed to save avatar preference:', err);
      });
    }

    // Update player count in database
    if (this.supabase) {
      const connectedCount = Array.from(room.players.values()).filter(
        p => p.status === PlayerStatus.CONNECTED
      ).length;
      Promise.resolve(this.supabase.from('rooms').update({
        player_count: connectedCount,
      }).eq('code', code)).then(({ error }) => {
        if (error) {
          console.error('[PlayerManager] Failed to update player count:', error);
        }
      }).catch((err: any) => {
        console.error('[PlayerManager] Failed to update player count:', err);
      });
    }

    // Update last accessed timestamp
    await (this.roomManager as any).updateLastAccessed(code);

    return { success: true, room, player };
  }

  /**
   * Leave a room (remove or mark as disconnected)
   */
  leaveRoom(playerId: string, markDisconnected: boolean = false): string | null {
    const roomCode = this.playerToRoom.get(playerId);
    if (!roomCode) {
      console.log(`[PlayerManager] Player ${playerId.substring(0, 8)} not found in playerToRoom mapping`);
      return null;
    }

    const room = this.roomManager.getRoom(roomCode);
    if (!room) {
      console.log(`[PlayerManager] Room ${roomCode} not found for player ${playerId.substring(0, 8)}`);
      // Clean up stale mapping
      this.playerToRoom.delete(playerId);
      return null;
    }

    if (markDisconnected) {
      // Mark player as disconnected IMMEDIATELY to prevent race conditions
      const player = room.players.get(playerId);
      if (player) {
        // Mark as disconnected immediately before any other operations
        player.status = PlayerStatus.DISCONNECTED;
        player.lastSeen = Date.now();
        console.log(`[PlayerManager] Marked player ${player.name} (${playerId.substring(0, 8)}) as DISCONNECTED in room ${roomCode}`);
        // Keep player in room for reconnection
      } else {
        console.warn(`[PlayerManager] Player ${playerId.substring(0, 8)} not found in room ${roomCode} players map, but exists in playerToRoom`);
      }
      // Don't remove from playerToRoom - keep mapping for reconnection
    } else {
      // Remove player completely
      const player = room.players.get(playerId);
      if (player) {
        console.log(`[PlayerManager] Removing player ${player.name} (${playerId.substring(0, 8)}) completely from room ${roomCode}`);
      }
      room.players.delete(playerId);
      this.playerToRoom.delete(playerId);
    }

    // Update TTL behavior whenever membership changes
    (this.roomManager as any).updateRoomExpiryOnActivity(roomCode);

    return roomCode;
  }

  /**
   * Get room by player ID
   */
  getRoomByPlayer(playerId: string): Room | undefined {
    const code = this.playerToRoom.get(playerId);
    return code ? this.roomManager.getRoom(code) : undefined;
  }

  /**
   * Update player last seen timestamp
   */
  updatePlayerLastSeen(playerId: string): void {
    const room = this.getRoomByPlayer(playerId);
    if (room) {
      const player = room.players.get(playerId);
      if (player) {
        player.lastSeen = Date.now();
      }
    }
  }

  /**
   * Issue a player token for reconnection
   */
  async issuePlayerToken(roomCode: string, playerId: string, playerName: string): Promise<string> {
    const existing = this.playerIdToToken.get(playerId);
    if (existing) {
      console.log(`[PlayerManager] Reusing existing token for player ${playerName} (${playerId.substring(0, 8)})`);
      return existing;
    }
    const token = this.generateToken();
    this.playerIdToToken.set(playerId, token);
    this.playerTokenToInfo.set(token, { roomCode, name: playerName });
    
    console.log(`[PlayerManager] ✅ Issued new token for player ${playerName} (${playerId.substring(0, 8)}) in room ${roomCode}, token: ${token.substring(0, 20)}...`);
    
    // Persist token to database
    if (this.supabase) {
      try {
        const { error } = await this.supabase
          .from('player_tokens')
          .upsert({
            room_code: roomCode,
            player_id: playerId,
            player_name: playerName,
            token,
            last_used_at: new Date().toISOString(),
            is_active: true,
          }, {
            onConflict: 'token',
          });
        
        if (error) {
          console.error('[PlayerManager] ❌ Failed to persist player token to database:', {
            error: error.message,
            code: error.code,
            details: error.details,
            playerName,
            roomCode,
            tokenPrefix: token.substring(0, 20)
          });
        } else {
          console.log(`[PlayerManager] ✅ Token persisted to database for player ${playerName}`);
        }
      } catch (error: any) {
        console.error('[PlayerManager] ❌ Exception persisting player token to database:', {
          error: error?.message || String(error),
          stack: error?.stack,
          playerName,
          roomCode
        });
        // Continue even if persistence fails - token is still in memory
      }
    } else {
      console.warn('[PlayerManager] ⚠️ Supabase client not available - token not persisted to database');
    }
    
    return token;
  }

  /**
   * Get player info by token
   */
  getPlayerInfoByToken(token: string): { roomCode: string; name: string } | undefined {
    return this.playerTokenToInfo.get(token);
  }

  /**
   * Restore player token from database (if not in memory)
   */
  async restorePlayerTokenFromDatabase(token: string): Promise<{ roomCode: string; playerId: string; playerName: string } | null> {
    if (!this.supabase) {
      console.log(`[PlayerManager] Cannot restore token from database - Supabase client not available`);
      return null;
    }
    
    try {
      const { data, error } = await this.supabase
        .from('player_tokens')
        .select('room_code, player_id, player_name')
        .eq('token', token)
        .eq('is_active', true)
        .single();
      
      if (error) {
        console.error(`[PlayerManager] Database error when restoring token:`, {
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          tokenPrefix: token.substring(0, 20)
        });
        return null;
      }
      
      if (!data) {
        console.log(`[PlayerManager] Token not found in database (token: ${token.substring(0, 20)}...) - may have been deleted or deactivated`);
        return null;
      }
      
      // Restore to memory mappings
      this.playerIdToToken.set(data.player_id, token);
      this.playerTokenToInfo.set(token, { roomCode: data.room_code, name: data.player_name });
      
      console.log(`[PlayerManager] ✅ Restored token from database: player=${data.player_name}, room=${data.room_code}, oldSocketId=${data.player_id.substring(0, 8)}`);
      
      // Update last_used_at
      await this.supabase
        .from('player_tokens')
        .update({ last_used_at: new Date().toISOString() })
        .eq('token', token);
      
      return {
        roomCode: data.room_code,
        playerId: data.player_id,
        playerName: data.player_name,
      };
    } catch (error) {
      console.error('[PlayerManager] Failed to restore player token from database:', error);
      return null;
    }
  }

  /**
   * Replace player socket using token (for reconnection)
   */
  async replacePlayerSocketWithToken(
    roomCode: string,
    token: string,
    newSocketId: string,
    language?: 'en' | 'fr'
  ): Promise<Player | null> {
    console.log(`[PlayerManager] 🔄 replacePlayerSocketWithToken called: roomCode=${roomCode}, newSocketId=${newSocketId.substring(0, 8)}, tokenPrefix=${token.substring(0, 20)}...`);
    
    let info = this.playerTokenToInfo.get(token);
    
    // If token not in memory, try to restore from database
    if (!info || info.roomCode !== roomCode) {
      console.log(`[PlayerManager] Token not in memory, attempting to restore from database...`);
      const restored = await this.restorePlayerTokenFromDatabase(token);
      if (restored) {
        info = { roomCode: restored.roomCode, name: restored.playerName };
        console.log(`[PlayerManager] ✅ Restored token from database for player ${restored.playerName}`);
      } else {
        console.error(`[PlayerManager] ❌ Invalid token or room code mismatch for reconnection`, {
          hasInfo: !!info,
          expectedRoomCode: info?.roomCode,
          providedRoomCode: roomCode,
          playerName: info?.name,
          tokenPrefix: token.substring(0, 20)
        });
        return null;
      }
    }
    
    if (!info || info.roomCode !== roomCode) {
      console.error(`[PlayerManager] ❌ Token room code mismatch after restoration`, {
        expectedRoomCode: info?.roomCode,
        providedRoomCode: roomCode,
        playerName: info?.name,
      });
      return null;
    }
    
    const room = this.roomManager.getRoom(roomCode);
    if (!room) {
      console.error(`[PlayerManager] ❌ Room ${roomCode} not found for reconnection`);
      return null;
    }
    
    console.log(`[PlayerManager] Looking for player ${info.name} in room ${roomCode} (${room.players.size} players)`);
    
    // Find player by name in room (including disconnected players)
    let target: Player | undefined;
    let oldId: string | undefined;
    
    for (const p of room.players.values()) {
      if (p.name.toLowerCase() === info.name.toLowerCase()) {
        target = p;
        oldId = p.id;
        console.log(`[PlayerManager] Found player ${info.name} with socket ID ${oldId.substring(0, 8)}, status: ${p.status}`);
        break;
      }
    }
    
    // If player not found in room, they might have been removed
    if (!target) {
      console.error(`[PlayerManager] ❌ Player ${info.name} not found in room ${roomCode} for reconnection`, {
        roomCode,
        playerName: info.name,
        playersInRoom: Array.from(room.players.values()).map(p => ({ name: p.name, id: p.id.substring(0, 8), status: p.status }))
      });
      return null;
    }
    
    // Remove old player entry if socket ID is different
    if (oldId && oldId !== newSocketId) {
      room.players.delete(oldId);
      this.playerToRoom.delete(oldId);
      
      // Migrate player data in active game engine if game is in progress
      if (this.gameManager) {
        this.gameManager.migratePlayerInGame(roomCode, oldId, newSocketId);
      }
    }
    
    // Update player with new socket ID
    target.id = newSocketId;
    target.status = PlayerStatus.CONNECTED;
    target.lastSeen = Date.now();
    if (language) {
      target.language = language;
    }
    room.players.set(newSocketId, target);
    this.playerToRoom.set(newSocketId, roomCode);
    
    // Update token mapping to new socket ID
    if (oldId && oldId !== newSocketId) {
      this.playerIdToToken.delete(oldId);
    }
    this.playerIdToToken.set(newSocketId, token);
    
    // Persist token update to database (update player_id and last_used_at)
    if (this.supabase) {
      try {
        await this.supabase
          .from('player_tokens')
          .update({
            player_id: newSocketId,
            last_used_at: new Date().toISOString(),
          })
          .eq('token', token);
      } catch (error) {
        console.error('[PlayerManager] Failed to update player token in database:', error);
        // Continue even if update fails
      }
    }
    
    // Activity resets TTL
    (this.roomManager as any).updateRoomExpiryOnActivity(roomCode);
    
    console.log(`[PlayerManager] ✅ Player ${info.name} reconnected with new socket ID ${newSocketId.substring(0, 8)} (old: ${oldId?.substring(0, 8) || 'N/A'})`);
    return target;
  }

  /**
   * Load player profile from database
   */
  async loadPlayerProfile(playerName: string): Promise<{ preferredAvatar?: string; avatarStyle?: string; displayName?: string } | null> {
    if (!this.supabase) return null;
    
    try {
      const { data, error } = await this.supabase
        .from('player_profiles')
        .select('preferred_avatar, avatar_style, display_name')
        .eq('player_name', playerName)
        .single();
      
      if (error || !data) return null;
      
      return {
        preferredAvatar: data.preferred_avatar || undefined,
        avatarStyle: data.avatar_style || undefined,
        displayName: data.display_name || undefined,
      };
    } catch (error) {
      console.error('[PlayerManager] Failed to load player profile:', error);
      return null;
    }
  }

  /**
   * Save player avatar preference
   */
  async savePlayerAvatar(playerName: string, avatar: string, avatarStyle: string): Promise<void> {
    if (!this.supabase) return;
    
    try {
      await this.supabase
        .from('player_profiles')
        .upsert({
          player_name: playerName,
          preferred_avatar: avatar,
          avatar_style: avatarStyle,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'player_name',
        });
    } catch (error) {
      console.error('[PlayerManager] Failed to save player avatar:', error);
    }
  }

  /**
   * Restore all player tokens for a room from database
   */
  async restorePlayerTokensForRoom(roomCode: string): Promise<number> {
    if (!this.supabase) return 0;
    
    try {
      const { data, error } = await this.supabase
        .from('player_tokens')
        .select('room_code, player_id, player_name, token')
        .eq('room_code', roomCode)
        .eq('is_active', true);
      
      if (error || !data || data.length === 0) {
        return 0;
      }
      
      let restoredCount = 0;
      for (const tokenData of data) {
        // Only restore if not already in memory
        if (!this.playerTokenToInfo.has(tokenData.token)) {
          this.playerIdToToken.set(tokenData.player_id, tokenData.token);
          this.playerTokenToInfo.set(tokenData.token, {
            roomCode: tokenData.room_code,
            name: tokenData.player_name,
          });
          restoredCount++;
        }
      }
      
      if (restoredCount > 0) {
        console.log(`[PlayerManager] Restored ${restoredCount} player token(s) for room ${roomCode}`);
      }
      
      return restoredCount;
    } catch (error) {
      console.error(`[PlayerManager] Failed to restore player tokens for room ${roomCode}:`, error);
      return 0;
    }
  }

  /**
   * Restore all active player tokens from database (called on startup)
   */
  async restoreAllPlayerTokens(): Promise<number> {
    if (!this.supabase) return 0;
    
    try {
      const { data, error } = await this.supabase
        .from('player_tokens')
        .select('room_code, player_id, player_name, token')
        .eq('is_active', true);
      
      if (error || !data || data.length === 0) {
        return 0;
      }
      
      let restoredCount = 0;
      for (const tokenData of data) {
        // Only restore if not already in memory
        if (!this.playerTokenToInfo.has(tokenData.token)) {
          this.playerIdToToken.set(tokenData.player_id, tokenData.token);
          this.playerTokenToInfo.set(tokenData.token, {
            roomCode: tokenData.room_code,
            name: tokenData.player_name,
          });
          restoredCount++;
        }
      }
      
      if (restoredCount > 0) {
        console.log(`[PlayerManager] Restored ${restoredCount} player token(s) from database`);
      }
      
      return restoredCount;
    } catch (error) {
      console.error('[PlayerManager] Failed to restore all player tokens:', error);
      return 0;
    }
  }

  /**
   * Mark player token as inactive (when player leaves permanently)
   */
  async deactivatePlayerToken(token: string): Promise<void> {
    if (!this.supabase) return;
    
    try {
      await this.supabase
        .from('player_tokens')
        .update({ is_active: false })
        .eq('token', token);
    } catch (error) {
      console.error('[PlayerManager] Failed to deactivate player token:', error);
    }
  }

  /**
   * Generate a unique token
   */
  private generateToken(): string {
    return `tok_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }
}

