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
  NaughtyPrompt,
  TriviaRoyaleSettings,
  PriceIsRightSettings,
  NaughtyOrNiceSettings,
  EmojiCarolSettings,
  BingoSettings,
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
  // Reconnection tokens
  private playerIdToToken: Map<string, string> = new Map();
  private playerTokenToInfo: Map<string, { roomCode: string; name: string }> = new Map();
  private roomToHostToken: Map<string, string> = new Map();
  private hostTokenToRoom: Map<string, string> = new Map();
  private disconnectedHosts: Set<string> = new Set(); // room codes with disconnected host
  // Jukebox state per room
  private jukeboxState: Map<string, { currentTrack: number; isPlaying: boolean; shuffle: boolean; repeat: 'none' | 'one' | 'all'; volume: number }> = new Map();

  setSupabaseClient(supabase: SupabaseClient | null) {
    this.supabase = supabase;
  }

  /**
   * Get room by host user ID (for one-room-per-host architecture)
   * Returns the user's single room if it exists
   */
  async getRoomByHostUserId(userId: string): Promise<Room | null> {
    if (!this.supabase || !userId) return null;

    try {
      // Query database for user's room
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
      const existingRoom = this.rooms.get(data.code);
      if (existingRoom) {
        return existingRoom;
      }

      // Load room from database
      const loaded = await this.loadRoomFromDatabase(data.code);
      if (loaded) {
        this.restoreRoomToMemory(loaded.room, loaded.hostToken);
        return loaded.room;
      }

      return null;
    } catch (error) {
      console.error('[Room] Error getting room by host user ID:', error);
      return null;
    }
  }

  /**
   * Create or get existing room for host
   * If host already has an active room, return it (reactivate if needed)
   * Only creates a new room if the host's current room is closed/deleted
   */
  async createOrGetRoom(hostId: string, hostName: string, hostUserId?: string): Promise<Room> {
    // First, check for in-memory room by socket ID (hostId)
    const inMemoryRoom = this.getRoomByHost(hostId);
    if (inMemoryRoom) {
      // Reactivate if expired
      if (isExpired(inMemoryRoom.expiresAt)) {
        const newExpiresAt = Date.now() + 24 * 60 * 60 * 1000;
        inMemoryRoom.expiresAt = newExpiresAt;
        await this.updateLastAccessed(inMemoryRoom.code);
        console.log(`[Room] Reactivated expired room ${inMemoryRoom.code} for host ${hostId}`);
      }
      
      // Ensure room is marked as active in database
      if (this.supabase) {
        this.supabase
          .from('rooms')
          .update({ is_active: true, last_accessed_at: new Date().toISOString() })
          .eq('code', inMemoryRoom.code)
          .then(({ error }) => {
            if (error) {
              console.error('[Room] Failed to reactivate room in database:', error);
            }
          });
      }
      
      console.log(`[Room] Restored existing in-memory room ${inMemoryRoom.code} for host ${hostId}`);
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
          await this.updateLastAccessed(dbRoom.code);
          console.log(`[Room] Reactivated expired room ${dbRoom.code} for host ${hostUserId}`);
        }
        
        // Update host socket ID if changed
        if (dbRoom.hostId !== hostId) {
          dbRoom.hostId = hostId;
          console.log(`[Room] Updated host socket ID for room ${dbRoom.code}`);
        }
        
        console.log(`[Room] Restored existing database room ${dbRoom.code} for host ${hostUserId}`);
        return dbRoom;
      }
    }

    // No active room found - host can create a new room
    // (their previous room must be closed/deleted)
    console.log(`[Room] No active room found for host ${hostId} (user: ${hostUserId || 'none'}), creating new room`);
    return this.createRoom(hostId, hostName, hostUserId);
  }

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
    
    // Issue host token and store mapping
    const hostToken = this.generateToken();
    this.roomToHostToken.set(code, hostToken);
    this.hostTokenToRoom.set(hostToken, code);
    
    // Save room to database if available
    if (this.supabase) {
      Promise.resolve(this.supabase.from('rooms').insert({
        code,
        host_id: hostId,
        host_user_id: hostUserId || null,
        host_token: hostToken,
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
      console.error('[Room] Failed to load player profile:', error);
      return null;
    }
  }

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
      console.error('[Room] Failed to save player avatar:', error);
    }
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
   * Restore a room to memory (add to rooms map and set up host tokens).
   * Used when loading a room from database for reconnection.
   */
  restoreRoomToMemory(room: Room, hostToken?: string): void {
    this.rooms.set(room.code, room);
    // Use provided token or generate a new one
    const token = hostToken || this.generateToken();
    this.roomToHostToken.set(room.code, token);
    this.hostTokenToRoom.set(token, room.code);
    console.log(`[Room] Restored room ${room.code} to memory`);
  }

  /**
   * Restore all active, non-expired rooms from the database.
   * Called on server startup to restore room persistence.
   */
  async restoreActiveRooms(): Promise<number> {
    if (!this.supabase) {
      console.log('[Room] Database not available, skipping room restoration');
      return 0;
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
        return 0;
      }

      if (!data || data.length === 0) {
        console.log('[Room] No active rooms to restore');
        return 0;
      }

      let restoredCount = 0;
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

          restoredCount++;
        } catch (roomError) {
          console.error(`[Room] Failed to restore room ${roomData.code}:`, roomError);
        }
      }

      console.log(`[Room] Restored ${restoredCount} active room(s) from database`);
      return restoredCount;
    } catch (error) {
      console.error('[Room] Failed to restore active rooms:', error);
      return 0;
    }
  }

  async joinRoom(code: string, playerId: string, playerName: string, preferredAvatar?: string, language: 'en' | 'fr' = 'en'): Promise<{ success: boolean; room?: Room; player?: Player; error?: string }> {
    let room = this.rooms.get(code);

    // If room not in memory, try loading from database
    if (!room) {
      const loaded = await this.loadRoomFromDatabase(code);
      if (loaded) {
        room = loaded.room;
        // Restore to memory with token
        this.restoreRoomToMemory(loaded.room, loaded.hostToken);
        console.log(`[Room] Restored room ${code} from database`);
      } else {
        return { success: false, error: 'Room not found' };
      }
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
        // Update language preference if provided
        if (language) {
          existingPlayer.language = language;
        }

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

    // Save avatar preference to profile
    if (avatar && this.supabase) {
      this.savePlayerAvatar(playerName, avatar, avatarStyle).catch((err) => {
        console.error('[Room] Failed to save avatar preference:', err);
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
          console.error('[Room] Failed to update player count:', error);
        }
      }).catch((err: any) => {
        console.error('[Room] Failed to update player count:', err);
      });
    }

    // Update last accessed timestamp
    await this.updateLastAccessed(code);

    return { success: true, room, player };
  }

  leaveRoom(playerId: string, markDisconnected: boolean = false): string | null {
    // Check if it's a host (socket id matches hostId)
    const hostRoom = this.getRoomByHost(playerId);
    if (hostRoom) {
      if (markDisconnected) {
        // Mark host as disconnected but keep room for reconnection
        this.disconnectedHosts.add(hostRoom.code);
        this.updateRoomExpiryOnActivity(hostRoom.code);
        return hostRoom.code;
      } else {
        // Explicit host leave: delete room
        this.deleteRoom(hostRoom.code);
        return hostRoom.code;
      }
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
    }
    // Update TTL behavior whenever membership changes
    this.updateRoomExpiryOnActivity(roomCode);

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
  async startGame(
    roomCode: string,
    gameType: GameType,
    providedSettings?:
      | TriviaRoyaleSettings
      | PriceIsRightSettings
      | NaughtyOrNiceSettings
      | EmojiCarolSettings
      | BingoSettings
  ): Promise<BaseGameEngine | null> {
    const room = this.rooms.get(roomCode);
    if (!room) return null;

    // Load custom content if available
    let customQuestions: TriviaQuestion[] | undefined;
    let customItems: PriceItem[] | undefined;
    let customPrompts: NaughtyPrompt[] | undefined;
    let gameSettings:
      | TriviaRoyaleSettings
      | PriceIsRightSettings
      | NaughtyOrNiceSettings
      | EmojiCarolSettings
      | BingoSettings
      | undefined;

    // Use provided settings if available, otherwise load from database
    if (providedSettings) {
      gameSettings = providedSettings;
    } else if (this.supabase) {
      // Try to get game settings to find customSetId and all settings
      const { data: settingsData } = await this.supabase
        .from('game_settings')
        .select('settings')
        .eq('room_code', roomCode)
        .eq('game_type', gameType)
        .single();

      if (settingsData?.settings) {
        const settings = settingsData.settings;
        
        // Store full settings object based on game type
        if (gameType === GameType.TRIVIA_ROYALE) {
          gameSettings = settings as TriviaRoyaleSettings;
        } else if (gameType === GameType.PRICE_IS_RIGHT) {
          gameSettings = settings as PriceIsRightSettings;
        } else if (gameType === GameType.NAUGHTY_OR_NICE) {
          gameSettings = settings as NaughtyOrNiceSettings;
        } else if (gameType === GameType.EMOJI_CAROL) {
          gameSettings = settings as EmojiCarolSettings;
        } else if (gameType === GameType.BINGO) {
          gameSettings = settings as BingoSettings;
        }
      }
    }

    // Get customSetId from settings (either provided or loaded from database)
    if (gameSettings) {
      const customSetId = (gameSettings as any).customQuestionSetId || 
                         (gameSettings as any).customItemSetId || 
                         (gameSettings as any).customPromptSetId;
      
      if (gameType === GameType.TRIVIA_ROYALE) {
        if (customSetId && this.supabase) {
          // Load custom question set
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
              translations: q.translations || undefined,
            }));
          }
        } else {
          // Load default questions from database (set_id IS NULL)
          if (this.supabase) {
            const { data: defaultQuestionsData } = await this.supabase
              .from('trivia_questions')
              .select('*')
              .is('set_id', null)
              .order('created_at', { ascending: true })
              .limit(50); // Limit to prevent loading too many

            if (defaultQuestionsData && defaultQuestionsData.length > 0) {
              customQuestions = defaultQuestionsData.map((q) => ({
                id: q.id,
                question: q.question,
                answers: q.answers,
                correctIndex: q.correct_index,
                difficulty: q.difficulty,
                category: q.category,
                imageUrl: q.image_url,
                translations: q.translations || undefined,
              }));
            }
          }
          // If database query fails or returns no results, fallback to hardcoded DEFAULT_QUESTIONS
          // (handled in TriviaRoyaleGame constructor)
        }
      } else if (gameType === GameType.PRICE_IS_RIGHT) {
        if (customSetId && this.supabase) {
          // Load custom item set
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
              translations: item.translations || undefined,
            }));
          }
        } else {
          // Load default items from database (set_id IS NULL)
          if (this.supabase) {
            const { data: defaultItemsData } = await this.supabase
              .from('price_items')
              .select('*')
              .is('set_id', null)
              .order('created_at', { ascending: true })
              .limit(50);

            if (defaultItemsData && defaultItemsData.length > 0) {
              customItems = defaultItemsData.map((item) => ({
                id: item.id,
                name: item.name,
                description: item.description,
                price: parseFloat(item.price),
                imageUrl: item.image_url,
                category: item.category,
                translations: item.translations || undefined,
              }));
            }
          }
          // If database query fails or returns no results, fallback to hardcoded DEFAULT_ITEMS
          // (handled in PriceIsRightGame constructor)
        }
      } else if (gameType === GameType.NAUGHTY_OR_NICE) {
        if (customSetId && this.supabase) {
          // Load custom prompt set
          const { data: promptsData } = await this.supabase
            .from('naughty_prompts')
            .select('*')
            .eq('set_id', customSetId);

          if (promptsData && promptsData.length > 0) {
            customPrompts = promptsData.map((p) => ({
              id: p.id,
              prompt: p.prompt,
              category: p.category || '',
              contentRating: p.content_rating || 'pg',
              translations: p.translations || undefined,
            }));
          }
        } else {
          // Load default prompts from database (set_id IS NULL)
          if (this.supabase) {
            const { data: defaultPromptsData } = await this.supabase
              .from('naughty_prompts')
              .select('*')
              .is('set_id', null)
              .order('created_at', { ascending: true })
              .limit(50);

            if (defaultPromptsData && defaultPromptsData.length > 0) {
              customPrompts = defaultPromptsData.map((p) => ({
                id: p.id,
                prompt: p.prompt,
                category: p.category || '',
                contentRating: p.content_rating || 'pg',
                translations: p.translations || undefined,
              }));
            }
          }
          // If database query fails or returns no results, fallback to hardcoded DEFAULT_PROMPTS
          // (handled in NaughtyOrNiceGame constructor)
        }
      }
    }

    console.log(`[RoomManager] Creating game ${gameType} with ${room.players.size} players, settings:`, gameSettings);
    console.log(`[RoomManager] Custom content loaded:`, {
      questions: customQuestions?.length || 0,
      items: customItems?.length || 0,
      prompts: customPrompts?.length || 0,
    });
    
    const game = GameFactory.createGame(
      gameType,
      room.players,
      customQuestions,
      customItems,
      customPrompts,
      gameSettings
    );
    if (!game) {
      console.error(`[RoomManager] GameFactory.createGame returned null for gameType: ${gameType}`);
      return null;
    }
    
    console.log(`[RoomManager] Game created successfully: ${gameType}, state: ${game.getState().state}`);

    this.games.set(roomCode, game);
    room.currentGame = gameType;
    
    // Start the game engine - this sets internal state to STARTING and transitions to PLAYING after 3 seconds
    game.start();
    
    // Sync room.gameState with game engine's state
    // Initial state is STARTING, but it will transition to PLAYING after 3 seconds
    room.gameState = game.getState().state;

    // Persist game state to database
    if (this.supabase) {
      Promise.resolve(this.supabase.from('rooms').update({
        current_game: gameType,
      }).eq('code', roomCode)).catch((err: any) => {
        console.error(`[Room] Failed to update current_game for room ${roomCode}:`, err);
      });
    }
    
    // Keep room.gameState in sync with game engine state after transition to PLAYING
    // This ensures reconnections get the correct state
    setTimeout(() => {
      const currentGame = this.games.get(roomCode);
      if (currentGame && currentGame === game) {
        room.gameState = game.getState().state;
        console.log(`[Game] Synced room.gameState to ${room.gameState} for room ${roomCode}`);
      }
    }, 3500); // After game transitions to PLAYING and onPlaying() completes

    return game;
  }

  getGame(roomCode: string): BaseGameEngine | undefined {
    return this.games.get(roomCode);
  }

  endGame(roomCode: string): void {
    const room = this.rooms.get(roomCode);
    const game = this.games.get(roomCode);
    if (game) {
      game.destroy();
      this.games.delete(roomCode);
    }
    
    // Update room state
    if (room) {
      room.currentGame = null;
      room.gameState = GameState.LOBBY;
      
      // Persist game state to database
      if (this.supabase) {
        Promise.resolve(this.supabase.from('rooms').update({
          current_game: null,
        }).eq('code', roomCode)).catch((err: any) => {
          console.error(`[Room] Failed to clear current_game for room ${roomCode}:`, err);
        });
      }
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
  // This ensures the game engine's score matches the player's cumulative session score
  restorePlayerScoreInGame(roomCode: string, playerId: string, playerName: string): void {
    const game = this.getGame(roomCode);
    if (!game) return;
    
    // Get session score (cumulative score across all games in this room)
    const sessionScores = this.sessionLeaderboards.get(roomCode);
    if (sessionScores) {
      const sessionScore = sessionScores.get(playerName);
      if (sessionScore !== undefined && sessionScore >= 0) {
        // Get current game state
        const gameState = game.getState();
        if (gameState.scores) {
          // The game engine's score should reflect the cumulative session score
          // This way, the player's displayed score matches their total session progress
          const currentGameScore = gameState.scores[playerId] || 0;
          
          // If session score is different from current game score, update it
          // This handles reconnection where the player's session score is higher
          // than what the game engine currently has (which might be from before this game started)
          if (sessionScore !== currentGameScore) {
            // Set the game score to match session score
            // This ensures continuity - the game score should represent cumulative progress
            gameState.scores[playerId] = sessionScore;
            console.log(`[Room] Restored game score for ${playerName} (${playerId.substring(0, 8)}): ${currentGameScore} -> ${sessionScore}`);
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

    // Remove all player mappings
    for (const playerId of room.players.keys()) {
      this.playerToRoom.delete(playerId);
    }
    // Cleanup host token
    const hostToken = this.roomToHostToken.get(code);
    if (hostToken) {
      this.roomToHostToken.delete(code);
      this.hostTokenToRoom.delete(hostToken);
    }
    this.disconnectedHosts.delete(code);

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

  // ==============================
  // Token utilities
  // ==============================
  private generateToken(): string {
    return `tok_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }

  issuePlayerToken(roomCode: string, playerId: string, playerName: string): string {
    const existing = this.playerIdToToken.get(playerId);
    if (existing) return existing;
    const token = this.generateToken();
    this.playerIdToToken.set(playerId, token);
    this.playerTokenToInfo.set(token, { roomCode, name: playerName });
    return token;
  }

  getPlayerInfoByToken(token: string): { roomCode: string; name: string } | undefined {
    return this.playerTokenToInfo.get(token);
  }

  replacePlayerSocketWithToken(roomCode: string, token: string, newSocketId: string, language?: 'en' | 'fr'): Player | null {
    const info = this.playerTokenToInfo.get(token);
    if (!info || info.roomCode !== roomCode) {
      console.log(`[Room] Invalid token or room code mismatch for reconnection`);
      return null;
    }
    
    const room = this.rooms.get(roomCode);
    if (!room) {
      console.log(`[Room] Room ${roomCode} not found for reconnection`);
      return null;
    }
    
    // Find player by name in room (including disconnected players)
    let target: Player | undefined;
    let oldId: string | undefined;
    
    for (const p of room.players.values()) {
      if (p.name.toLowerCase() === info.name.toLowerCase()) {
        target = p;
        oldId = p.id;
        break;
      }
    }
    
    // If player not found in room, they might have been removed
    // Check if we can find them by old socket ID from token mapping
    if (!target) {
      // Try to find by old socket ID stored in token mapping
      for (const [oldSocketId, storedToken] of this.playerIdToToken.entries()) {
        if (storedToken === token) {
          // Found old socket ID, but player might not be in room anymore
          console.log(`[Room] Found old socket ID ${oldSocketId} for token, but player not in room`);
          break;
        }
      }
      console.log(`[Room] Player ${info.name} not found in room ${roomCode} for reconnection`);
      return null;
    }
    
    // Remove old player entry if socket ID is different
    if (oldId && oldId !== newSocketId) {
      room.players.delete(oldId);
      this.playerToRoom.delete(oldId);
      
      // Migrate player data in active game engine if game is in progress
      const game = this.games.get(roomCode);
      if (game && oldId) {
        game.migratePlayer(oldId, newSocketId);
        console.log(`[Room] Migrated player data in game engine from ${oldId.substring(0, 8)} to ${newSocketId.substring(0, 8)}`);
      }
    }
    
    // Update player with new socket ID
    target.id = newSocketId;
    target.status = PlayerStatus.CONNECTED;
    target.lastSeen = Date.now();
    // Update language preference if provided
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
    
    // Activity resets TTL
    this.updateRoomExpiryOnActivity(roomCode);
    
    console.log(`[Room] Player ${info.name} reconnected with new socket ID ${newSocketId} (old: ${oldId})`);
    return target;
  }

  getHostToken(roomCode: string): string | undefined {
    return this.roomToHostToken.get(roomCode);
  }

  getRoomCodeByHostToken(token: string): string | undefined {
    return this.hostTokenToRoom.get(token);
  }

  updateHostSocket(roomCode: string, newHostSocketId: string): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    room.hostId = newHostSocketId;
    this.disconnectedHosts.delete(roomCode);
    // Activity resets TTL
    this.updateRoomExpiryOnActivity(roomCode);
  }

  isHostDisconnected(roomCode: string): boolean {
    return this.disconnectedHosts.has(roomCode);
  }

  // ==============================
  // Room Management Methods
  // ==============================

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
        console.error('[Room] Failed to get rooms by host user ID:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('[Room] Error getting rooms by host user ID:', error);
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
        return null;
      }

      // Restore token to memory mappings
      const token = data.host_token;
      this.roomToHostToken.set(code, token);
      this.hostTokenToRoom.set(token, code);

      return token;
    } catch (error) {
      console.error('[Room] Failed to get host token from database:', error);
      return null;
    }
  }

  /**
   * Update room settings in database
   */
  async updateRoomSettings(code: string, settings: {
    room_name?: string;
    description?: string;
  }): Promise<boolean> {
    const room = this.rooms.get(code);
    if (!room) return false;

    // Update in-memory settings
    if (settings.room_name !== undefined) {
      room.settings.roomName = settings.room_name;
    }
    if (settings.description !== undefined) {
      room.settings.description = settings.description;
    }

    // Update database
    if (this.supabase) {
      try {
        const updateData: any = {};
        if (settings.room_name !== undefined) updateData.room_name = settings.room_name;
        if (settings.description !== undefined) updateData.description = settings.description;

        const { error } = await this.supabase
          .from('rooms')
          .update(updateData)
          .eq('code', code);

        if (error) {
          console.error('[Room] Failed to update room settings:', error);
          return false;
        }
        return true;
      } catch (error) {
        console.error('[Room] Error updating room settings:', error);
        return false;
      }
    }

    return true;
  }

  /**
   * Deactivate a room (soft delete)
   */
  async deactivateRoom(code: string, userId: string): Promise<boolean> {
    const room = this.rooms.get(code);
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
          console.error('[Room] Failed to deactivate room:', error);
          return false;
        }
      } catch (error) {
        console.error('[Room] Error deactivating room:', error);
        return false;
      }
    }

    // Remove from memory
    this.deleteRoom(code);
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
        console.error('[Room] Failed to reactivate room:', updateError);
        return { success: false, error: 'Failed to reactivate room' };
      }

      // Restore room to memory if not already there
      let room = this.rooms.get(code);
      if (!room) {
        const loaded = await this.loadRoomFromDatabase(code);
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
      console.error('[Room] Error reactivating room:', error);
      return { success: false, error: 'Failed to reactivate room' };
    }
  }

  /**
   * Regenerate host token for a room
   */
  async regenerateHostToken(code: string, userId: string): Promise<{ success: boolean; token?: string; error?: string }> {
    const room = this.rooms.get(code);
    if (!room && this.supabase) {
      // Try loading from database
      const loaded = await this.loadRoomFromDatabase(code);
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
        console.error('[Room] Failed to regenerate host token:', error);
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
      console.error('[Room] Error regenerating host token:', error);
      return { success: false, error: 'Failed to regenerate token' };
    }
  }

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
      // No one connected - set short TTL (10 minutes)
      room.expiresAt = now + 10 * 60 * 1000;
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
