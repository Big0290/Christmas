import { Server } from 'socket.io';
import { Room, Player, GameType, isExpired } from '@christmas/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { ConnectionManager } from './connection-manager.js';
import { HostManager } from './host-manager.js';
import { PlayerManager } from './player-manager.js';
import { GameManager } from './game-manager.js';
import { RoomManager } from '../managers/room-manager.js';
import type { AchievementManager } from '../managers/achievement-manager.js';

/**
 * RoomEngine orchestrates all room-related subsystems:
 * - ConnectionManager: Socket connections/disconnections
 * - HostManager: Host operations
 * - PlayerManager: Player operations
 * - GameManager: Game lifecycle
 * - RoomManager: Room persistence
 */
export class RoomEngine {
  public readonly connectionManager: ConnectionManager;
  public readonly hostManager: HostManager;
  public readonly playerManager: PlayerManager;
  public readonly gameManager: GameManager;
  public readonly roomManager: RoomManager;

  constructor(io: Server, achievementManager?: AchievementManager) {
    // Create RoomManager first (core dependency)
    this.roomManager = new RoomManager();
    
    // Create managers (GameManager needs io for broadcasting)
    this.connectionManager = new ConnectionManager();
    this.gameManager = new GameManager(this.roomManager);
    this.gameManager.setSocketIO(io);
    this.hostManager = new HostManager(this.roomManager);
    this.playerManager = new PlayerManager(this.roomManager, this.gameManager);
    
    // Store achievement manager for potential future use
    if (achievementManager) {
      (this as any).achievementManager = achievementManager;
    }
  }

  /**
   * Initialize with Supabase client
   */
  setSupabaseClient(supabase: SupabaseClient | null): void {
    this.roomManager.setSupabaseClient(supabase);
    this.hostManager.setSupabaseClient(supabase);
    this.playerManager.setSupabaseClient(supabase);
    this.gameManager.setSupabaseClient(supabase);
  }

  // ========================================================================
  // Host Operations
  // ========================================================================

  /**
   * Create or get room for a host
   */
  async createOrGetRoom(hostId: string, hostName: string, hostUserId?: string): Promise<Room> {
    const room = await this.hostManager.createOrGetRoom(hostId, hostName, hostUserId);
    // Register host connection
    this.connectionManager.registerConnection(hostId, room.code, true);
    return room;
  }

  /**
   * Get room by host user ID
   */
  async getRoomByHostUserId(userId: string): Promise<Room | null> {
    return this.hostManager.getRoomByHostUserId(userId);
  }

  /**
   * Get host token for a room
   */
  getHostToken(roomCode: string): string | undefined {
    return this.hostManager.getHostToken(roomCode);
  }

  /**
   * Verify host token and get room code
   */
  verifyHostToken(token: string): string | null {
    return this.hostManager.verifyHostToken(token);
  }

  /**
   * Update host socket (for reconnection)
   */
  updateHostSocket(roomCode: string, newHostSocketId: string): void {
    this.hostManager.updateHostSocket(roomCode, newHostSocketId);
    this.connectionManager.updateSocketRoom(newHostSocketId, roomCode, true);
  }

  /**
   * Mark host as disconnected
   */
  markHostDisconnected(roomCode: string): void {
    this.hostManager.markHostDisconnected(roomCode);
    const room = this.roomManager.getRoom(roomCode);
    if (room) {
      this.connectionManager.handleDisconnection(room.hostId);
    }
  }

  // ========================================================================
  // Player Operations
  // ========================================================================

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
    const result = await this.playerManager.joinRoom(code, playerId, playerName, preferredAvatar, language);
    if (result.success && result.player) {
      // Check if there's an old socket ID to clean up (player reconnected with new socket)
      const oldSocketId = (this.playerManager as any)._oldSocketIdToCleanup;
      if (oldSocketId && oldSocketId !== playerId) {
        // Clean up old socket from ConnectionManager
        console.log(`[RoomEngine] Cleaning up old socket ${oldSocketId.substring(0, 8)} after player reconnection`);
        this.connectionManager.removeSocket(oldSocketId);
        (this.playerManager as any)._oldSocketIdToCleanup = undefined;
      }
      
      // Register new player connection
      this.connectionManager.registerConnection(playerId, code, false);
    }
    return result;
  }

  /**
   * Leave a room (remove or mark as disconnected)
   * @param alreadyMarkedDisconnected - If true, skip calling handleDisconnection as it was already called
   */
  leaveRoom(playerId: string, markDisconnected: boolean = false, alreadyMarkedDisconnected: boolean = false): string | null {
    const roomCode = this.playerManager.leaveRoom(playerId, markDisconnected);
    if (markDisconnected && !alreadyMarkedDisconnected) {
      // Only mark as disconnected if not already marked (prevents duplicate calls)
      // Check if already marked as disconnected first
      const socketInfo = this.connectionManager.getSocketInfo(playerId);
      if (!socketInfo || socketInfo.connected) {
        // Only mark if not already marked as disconnected
        this.connectionManager.handleDisconnectionSync(playerId);
      }
    } else if (!markDisconnected) {
      this.connectionManager.removeSocket(playerId);
    }
    return roomCode;
  }

  /**
   * Get room by player ID
   */
  getRoomByPlayer(playerId: string): Room | undefined {
    return this.playerManager.getRoomByPlayer(playerId);
  }

  /**
   * Issue player token for reconnection
   */
  async issuePlayerToken(roomCode: string, playerId: string, playerName: string): Promise<string> {
    return this.playerManager.issuePlayerToken(roomCode, playerId, playerName);
  }

  /**
   * Reconnect player using token
   */
  async replacePlayerSocketWithToken(
    roomCode: string,
    token: string,
    newSocketId: string,
    language?: 'en' | 'fr'
  ): Promise<Player | null> {
    const player = await this.playerManager.replacePlayerSocketWithToken(roomCode, token, newSocketId, language);
    if (player) {
      // Update connection mapping
      this.connectionManager.updateSocketRoom(newSocketId, roomCode, false);
    }
    return player;
  }

  /**
   * Update player last seen
   */
  updatePlayerLastSeen(playerId: string): void {
    this.playerManager.updatePlayerLastSeen(playerId);
    this.connectionManager.updateLastSeen(playerId);
  }

  // ========================================================================
  // Game Operations
  // ========================================================================

  /**
   * Start a game in a room
   */
  async startGame(
    roomCode: string,
    gameType: GameType,
    providedSettings?: any
  ) {
    return this.gameManager.startGame(roomCode, gameType, providedSettings);
  }

  /**
   * End a game in a room
   */
  endGame(roomCode: string): void {
    this.gameManager.endGame(roomCode);
  }

  /**
   * Pause a game
   */
  pauseGame(roomCode: string): void {
    this.gameManager.pauseGame(roomCode);
  }

  /**
   * Resume a game
   */
  resumeGame(roomCode: string): void {
    this.gameManager.resumeGame(roomCode);
  }

  /**
   * Handle player action in a game
   */
  handlePlayerAction(roomCode: string, playerId: string, action: string, data: any): void {
    this.gameManager.handlePlayerAction(roomCode, playerId, action, data);
  }

  /**
   * Get game for a room
   */
  getGame(roomCode: string) {
    return this.gameManager.getGame(roomCode);
  }

  /**
   * Broadcast game state to all players and host
   */
  broadcastGameState(roomCode: string): void {
    this.gameManager.broadcastGameState(roomCode);
  }

  /**
   * Get session leaderboard
   */
  getSessionLeaderboard(roomCode: string): Array<{ playerName: string; totalScore: number }> {
    return this.gameManager.getSessionLeaderboard(roomCode);
  }

  /**
   * Update session score
   */
  updateSessionScore(roomCode: string, playerName: string, score: number): void {
    this.gameManager.updateSessionScore(roomCode, playerName, score);
  }

  /**
   * Restore session score
   */
  async restoreSessionScore(roomCode: string, playerName: string): Promise<number> {
    return this.gameManager.restoreSessionScore(roomCode, playerName);
  }

  /**
   * Restore player score in active game
   */
  restorePlayerScoreInGame(roomCode: string, playerId: string, playerName: string): void {
    this.gameManager.restorePlayerScoreInGame(roomCode, playerId, playerName);
  }

  /**
   * Get scoreboard for a game
   */
  getScoreboard(roomCode: string): Array<{ playerId: string; name: string; score: number }> {
    return this.gameManager.getScoreboard(roomCode);
  }

  // ========================================================================
  // Room Operations (delegated to RoomManager)
  // ========================================================================

  /**
   * Get room by code
   */
  getRoom(code: string): Room | undefined {
    return this.roomManager.getRoom(code);
  }

  /**
   * Get room by host socket ID
   */
  getRoomByHost(hostId: string): Room | undefined {
    return this.roomManager.getRoomByHost(hostId);
  }

  /**
   * Save leaderboard for a game
   */
  async saveLeaderboard(
    roomCode: string,
    gameType: GameType,
    scoreboard: Array<{ playerId: string; name: string; score: number }>,
    achievementManager?: AchievementManager,
    io?: Server
  ): Promise<void> {
    return this.gameManager.saveLeaderboard(roomCode, gameType, scoreboard, achievementManager, io);
  }

  /**
   * Get room by socket ID (host or player)
   */
  getRoomBySocketId(socketId: string): { room: Room; isHost: boolean } | null {
    // Check connection manager first
    const connectionInfo = this.connectionManager.getSocketInfo(socketId);
    if (!connectionInfo || !connectionInfo.roomCode) {
      return null;
    }

    const room = this.roomManager.getRoom(connectionInfo.roomCode);
    if (!room) {
      return null;
    }

    return {
      room,
      isHost: connectionInfo.isHost,
    };
  }

  /**
   * Update last accessed timestamp
   */
  async updateLastAccessed(code: string): Promise<void> {
    return (this.roomManager as any).updateLastAccessed(code);
  }

  /**
   * Get jukebox state
   */
  getJukeboxState(roomCode: string) {
    return (this.roomManager as any).getJukeboxState(roomCode);
  }

  /**
   * Set jukebox state
   */
  setJukeboxState(roomCode: string, state: any): void {
    (this.roomManager as any).setJukeboxState(roomCode, state);
  }

  /**
   * Update jukebox state
   */
  updateJukeboxState(roomCode: string, updates: any): void {
    (this.roomManager as any).updateJukeboxState(roomCode, updates);
  }

  /**
   * Cleanup expired rooms
   */
  cleanupExpiredRooms(): void {
    this.roomManager.cleanupExpiredRooms();
  }

  /**
   * Get active room count
   */
  getActiveRoomCount(): number {
    return this.roomManager.getActiveRoomCount();
  }

  /**
   * Get total player count
   */
  getTotalPlayerCount(): number {
    return this.roomManager.getTotalPlayerCount();
  }

  /**
   * Restore active rooms from database
   * Also restores host tokens and player tokens
   */
  async restoreActiveRooms(): Promise<number> {
    // Restore rooms first
    const restoredRooms = await this.roomManager.restoreActiveRooms();
    
    // Restore host tokens
    let restoredHostTokens = 0;
    for (const { room, hostToken } of restoredRooms) {
      if (hostToken) {
        this.hostManager.restoreRoomToMemory(room, hostToken);
        restoredHostTokens++;
      }
    }
    
    // Also restore any other host tokens from database
    const additionalHostTokens = await this.hostManager.restoreAllHostTokens();
    
    // Restore player tokens for each room
    let restoredPlayerTokens = 0;
    for (const { room } of restoredRooms) {
      const count = await this.playerManager.restorePlayerTokensForRoom(room.code);
      restoredPlayerTokens += count;
    }
    
    // Also restore any other player tokens from database
    const additionalPlayerTokens = await this.playerManager.restoreAllPlayerTokens();
    
    if (restoredHostTokens > 0 || additionalHostTokens > 0 || restoredPlayerTokens > 0 || additionalPlayerTokens > 0) {
      console.log(`[RoomEngine] Restored ${restoredHostTokens + additionalHostTokens} host token(s) and ${restoredPlayerTokens + additionalPlayerTokens} player token(s)`);
    }
    
    return restoredRooms.length;
  }

  // ========================================================================
  // Host-specific room operations
  // ========================================================================

  /**
   * Get all rooms by host user ID
   */
  async getRoomsByHostUserId(userId: string) {
    return this.hostManager.getRoomsByHostUserId(userId);
  }

  /**
   * Get host token from database
   */
  async getHostTokenFromDatabase(code: string, userId: string): Promise<string | null> {
    return this.hostManager.getHostTokenFromDatabase(code, userId);
  }

  /**
   * Update room settings
   */
  async updateRoomSettings(code: string, settings: { room_name?: string; description?: string }): Promise<boolean> {
    return this.hostManager.updateRoomSettings(code, settings);
  }

  /**
   * Deactivate a room
   */
  async deactivateRoom(code: string, userId: string): Promise<boolean> {
    return this.hostManager.deactivateRoom(code, userId);
  }

  /**
   * Reactivate a room
   */
  async reactivateRoom(code: string, userId: string): Promise<{ success: boolean; token?: string; error?: string }> {
    return this.hostManager.reactivateRoom(code, userId);
  }

  /**
   * Regenerate host token
   */
  async regenerateHostToken(code: string, userId: string): Promise<{ success: boolean; token?: string; error?: string }> {
    return this.hostManager.regenerateHostToken(code, userId);
  }

  /**
   * Load player profile
   */
  async loadPlayerProfile(playerName: string) {
    return this.playerManager.loadPlayerProfile(playerName);
  }

  /**
   * Get player info by token
   */
  getPlayerInfoByToken(token: string) {
    return this.playerManager.getPlayerInfoByToken(token);
  }
}

