import {
  Room,
  Player,
  GameState,
  GameType,
  PlayerStatus,
  GlobalSettingsSchema,
  generateRoomCode,
  generateAvatar,
  isExpired,
  TriviaQuestion,
  PriceItem,
} from '@christmas/core';
import { BaseGameEngine } from '@christmas/core';
import { GameFactory } from '../games/factory.js';
import { SupabaseClient } from '@supabase/supabase-js';

export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private games: Map<string, BaseGameEngine> = new Map();
  private playerToRoom: Map<string, string> = new Map();
  private supabase: SupabaseClient | null = null;
  // Session leaderboard: tracks cumulative scores per player name across games in a room
  private sessionLeaderboards: Map<string, Map<string, number>> = new Map();

  setSupabaseClient(supabase: SupabaseClient | null) {
    this.supabase = supabase;
  }

  createRoom(hostId: string, hostName: string): Room {
    const code = this.generateUniqueCode();
    const now = Date.now();
    const expiresAt = now + 24 * 60 * 60 * 1000; // 24 hours

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
    
    // Save room to database if available
    if (this.supabase) {
      Promise.resolve(this.supabase.from('rooms').insert({
        code,
        host_id: hostId,
        expires_at: new Date(expiresAt).toISOString(),
        is_public: false,
        room_name: null,
        description: null,
        player_count: 0,
        is_active: true,
      })).then(({ error }) => {
        if (error) {
          console.error('[Room] Failed to save room to database:', error);
        }
      }).catch((err: any) => {
        console.error('[Room] Failed to save room to database:', err);
      });
    }

    this.rooms.set(code, room);
    // Don't add host to playerToRoom - they're managed separately

    return room;
  }

  joinRoom(code: string, playerId: string, playerName: string): { success: boolean; room?: Room; player?: Player; error?: string } {
    const room = this.rooms.get(code);

    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    if (isExpired(room.expiresAt)) {
      return { success: false, error: 'Room has expired' };
    }

    // Check if player with same name already exists (for reconnection)
    let existingPlayer: Player | undefined;
    for (const player of room.players.values()) {
      if (player.name.toLowerCase() === playerName.toLowerCase()) {
        existingPlayer = player;
        break;
      }
    }

    if (existingPlayer) {
      // Player exists - update their socket ID and status
      if (existingPlayer.status === PlayerStatus.DISCONNECTED) {
        // Reconnecting disconnected player
        const oldPlayerId = existingPlayer.id;
        room.players.delete(oldPlayerId);
        this.playerToRoom.delete(oldPlayerId);

        existingPlayer.id = playerId;
        existingPlayer.status = PlayerStatus.CONNECTED;
        existingPlayer.lastSeen = Date.now();

        room.players.set(playerId, existingPlayer);
        this.playerToRoom.set(playerId, code);

        return { success: true, room, player: existingPlayer };
      } else {
        // Player is already connected with different socket ID
        return { success: false, error: 'Player with this name is already in the room' };
      }
    }

    // Check room capacity (only count connected players)
    const connectedPlayers = Array.from(room.players.values()).filter(
      p => p.status === PlayerStatus.CONNECTED
    );
    if (connectedPlayers.length >= room.settings.maxPlayers) {
      return { success: false, error: 'Room is full' };
    }

    const player: Player = {
      id: playerId,
      name: playerName,
      avatar: generateAvatar(room.settings.avatarStyle),
      status: PlayerStatus.CONNECTED,
      score: 0,
      joinedAt: Date.now(),
      lastSeen: Date.now(),
    };

    room.players.set(playerId, player);
    this.playerToRoom.set(playerId, code);

    // Update player count in database
    if (this.supabase) {
      const connectedCount = Array.from(room.players.values()).filter(
        p => p.status === PlayerStatus.CONNECTED
      ).length;
      Promise.resolve(this.supabase.from('rooms').update({
        player_count: connectedCount,
      }).eq('code', code)).then(({ error }) => {
        if (error) {
          console.error('[Room] Failed to update player count:', error);
        }
      }).catch((err: any) => {
        console.error('[Room] Failed to update player count:', err);
      });
    }

    return { success: true, room, player };
  }

  leaveRoom(playerId: string, markDisconnected: boolean = false): string | null {
    // Check if it's a host
    const hostRoom = this.getRoomByHost(playerId);
    if (hostRoom) {
      // Host leaving - delete the room
      this.deleteRoom(hostRoom.code);
      return hostRoom.code;
    }

    // It's a player
    const roomCode = this.playerToRoom.get(playerId);
    if (!roomCode) return null;

    const room = this.rooms.get(roomCode);
    if (!room) return null;

    if (markDisconnected) {
      // Mark player as disconnected instead of removing
      const player = room.players.get(playerId);
      if (player) {
        player.status = PlayerStatus.DISCONNECTED;
        player.lastSeen = Date.now();
        // Keep player in room for reconnection
      }
      // Don't remove from playerToRoom - keep mapping for reconnection
    } else {
      // Remove player completely
      room.players.delete(playerId);
      this.playerToRoom.delete(playerId);

      // If no players remain, delete room
      if (room.players.size === 0) {
        this.deleteRoom(roomCode);
      }
    }

    return roomCode;
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  getRoomByPlayer(playerId: string): Room | undefined {
    const code = this.playerToRoom.get(playerId);
    return code ? this.rooms.get(code) : undefined;
  }

  getRoomByHost(hostId: string): Room | undefined {
    for (const room of this.rooms.values()) {
      if (room.hostId === hostId) {
        return room;
      }
    }
    return undefined;
  }

  getRoomBySocketId(socketId: string): { room: Room; isHost: boolean } | null {
    // Check if it's a host
    const hostRoom = this.getRoomByHost(socketId);
    if (hostRoom) {
      return { room: hostRoom, isHost: true };
    }
    
    // Check if it's a player
    const playerRoom = this.getRoomByPlayer(socketId);
    if (playerRoom) {
      return { room: playerRoom, isHost: false };
    }
    
    return null;
  }

  updatePlayerLastSeen(playerId: string): void {
    const room = this.getRoomByPlayer(playerId);
    if (room) {
      const player = room.players.get(playerId);
      if (player) {
        player.lastSeen = Date.now();
      }
    }
  }

  // Game management
  async startGame(roomCode: string, gameType: GameType): Promise<BaseGameEngine | null> {
    const room = this.rooms.get(roomCode);
    if (!room) return null;

    // Load custom content if available
    let customQuestions: TriviaQuestion[] | undefined;
    let customItems: PriceItem[] | undefined;

    if (this.supabase) {
      // Try to get game settings to find customSetId
      const { data: settingsData } = await this.supabase
        .from('game_settings')
        .select('settings')
        .eq('room_code', roomCode)
        .eq('game_type', gameType)
        .single();

      if (settingsData?.settings) {
        const customSetId = settingsData.settings.customQuestionSetId || settingsData.settings.customItemSetId;
        
        if (gameType === GameType.TRIVIA_ROYALE && customSetId) {
          const { data: questionsData } = await this.supabase
            .from('trivia_questions')
            .select('*')
            .eq('set_id', customSetId);

          if (questionsData && questionsData.length > 0) {
            customQuestions = questionsData.map((q) => ({
              id: q.id,
              question: q.question,
              answers: q.answers,
              correctIndex: q.correct_index,
              difficulty: q.difficulty,
              category: q.category,
              imageUrl: q.image_url,
            }));
          }
        } else if (gameType === GameType.PRICE_IS_RIGHT && customSetId) {
          const { data: itemsData } = await this.supabase
            .from('price_items')
            .select('*')
            .eq('set_id', customSetId);

          if (itemsData && itemsData.length > 0) {
            customItems = itemsData.map((item) => ({
              id: item.id,
              name: item.name,
              description: item.description,
              price: parseFloat(item.price),
              imageUrl: item.image_url,
              category: item.category,
            }));
          }
        }
      }
    }

    const game = GameFactory.createGame(gameType, room.players, customQuestions, customItems);
    if (!game) return null;

    this.games.set(roomCode, game);
    room.currentGame = gameType;
    room.gameState = GameState.STARTING;

    game.start();

    return game;
  }

  getGame(roomCode: string): BaseGameEngine | undefined {
    return this.games.get(roomCode);
  }

  endGame(roomCode: string): void {
    const game = this.games.get(roomCode);
    if (game) {
      game.destroy();
      this.games.delete(roomCode);
    }
    // Clear session leaderboard when game ends (but keep it for the room session)
    // Session leaderboard persists until room is destroyed
  }

  getSessionLeaderboard(roomCode: string): Array<{ playerName: string; totalScore: number }> {
    const sessionScores = this.sessionLeaderboards.get(roomCode);
    if (!sessionScores) {
      return [];
    }
    return Array.from(sessionScores.entries())
      .map(([playerName, totalScore]) => ({ playerName, totalScore }))
      .sort((a, b) => b.totalScore - a.totalScore);
  }

  updateSessionScore(roomCode: string, playerName: string, score: number): void {
    if (!this.sessionLeaderboards.has(roomCode)) {
      this.sessionLeaderboards.set(roomCode, new Map());
    }
    const sessionScores = this.sessionLeaderboards.get(roomCode)!;
    const currentScore = sessionScores.get(playerName) || 0;
    sessionScores.set(playerName, currentScore + score);
    
    // Also persist to database for recovery
    if (this.supabase) {
      // Store session scores in a way that can be recovered
      // We'll use a combination of room_code and player_name
      Promise.resolve(this.supabase.from('session_scores').upsert({
        room_code: roomCode,
        player_name: playerName,
        total_score: currentScore + score,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'room_code,player_name',
      })).then(({ error }) => {
        if (error) {
          // Table might not exist yet, ignore error
          console.error('[Room] Failed to save session score:', error);
        }
      }).catch((err: any) => {
        console.error('[Room] Failed to save session score:', err);
      });
    }
  }
  
  async restoreSessionScore(roomCode: string, playerName: string): Promise<number> {
    // Check in-memory first
    const sessionScores = this.sessionLeaderboards.get(roomCode);
    if (sessionScores) {
      const score = sessionScores.get(playerName);
      if (score !== undefined && score > 0) {
        return score;
      }
    }
    
    // Check database
    if (this.supabase) {
      try {
        const { data } = await this.supabase
          .from('session_scores')
          .select('total_score')
          .eq('room_code', roomCode)
          .eq('player_name', playerName)
          .single();
        
        if (data && data.total_score) {
          // Restore to in-memory
          if (!this.sessionLeaderboards.has(roomCode)) {
            this.sessionLeaderboards.set(roomCode, new Map());
          }
          const sessionScores = this.sessionLeaderboards.get(roomCode)!;
          sessionScores.set(playerName, data.total_score);
          return data.total_score;
        }
      } catch (err) {
        // Table might not exist or no data, ignore
      }
    }
    
    return 0;
  }
  
  // Restore player score in active game
  restorePlayerScoreInGame(roomCode: string, playerId: string, playerName: string): void {
    const game = this.getGame(roomCode);
    if (!game) return;
    
    // Get session score
    const sessionScores = this.sessionLeaderboards.get(roomCode);
    if (sessionScores) {
      const sessionScore = sessionScores.get(playerName);
      if (sessionScore && sessionScore > 0) {
        // Try to update player's score in the game
        const gameState = game.getState();
        if (gameState.scores) {
          // Calculate the difference and add to current score
          const currentScore = gameState.scores[playerId] || 0;
          const scoreDiff = sessionScore - currentScore;
          if (scoreDiff > 0) {
            // Update score in game
            gameState.scores[playerId] = sessionScore;
            // Also update via game's updateScore method if available
            if (typeof (game as any).updateScore === 'function') {
              (game as any).updateScore(playerId, scoreDiff);
            }
          }
        }
      }
    }
  }

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

    // Remove all player mappings
    for (const playerId of room.players.keys()) {
      this.playerToRoom.delete(playerId);
    }

    // Cleanup game
    const game = this.games.get(code);
    if (game) {
      game.destroy();
      this.games.delete(code);
    }

    // Cleanup session leaderboard
    this.sessionLeaderboards.delete(code);

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
}
