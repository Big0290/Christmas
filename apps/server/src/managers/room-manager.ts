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

    const hostPlayer: Player = {
      id: hostId,
      name: hostName,
      avatar: generateAvatar('festive'),
      status: PlayerStatus.CONNECTED,
      score: 0,
      joinedAt: now,
      lastSeen: now,
    };

    const room: Room = {
      code,
      hostId,
      createdAt: now,
      expiresAt,
      currentGame: null,
      gameState: GameState.LOBBY,
      players: new Map([[hostId, hostPlayer]]),
      settings: GlobalSettingsSchema.parse({ theme: {} }),
    };

    this.rooms.set(code, room);
    this.playerToRoom.set(hostId, code);

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

    return { success: true, room, player };
  }

  leaveRoom(playerId: string, markDisconnected: boolean = false): string | null {
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

      // If host left or no players remain, delete room
      if (playerId === room.hostId || room.players.size === 0) {
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
