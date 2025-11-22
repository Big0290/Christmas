import { Server } from 'socket.io';
import {
  Room,
  Player,
  PluginGameEngine,
  GameType,
  GameState,
  TriviaQuestion,
  PriceItem,
  NaughtyPrompt,
  TriviaRoyaleSettings,
  PriceIsRightSettings,
  NaughtyOrNiceSettings,
  EmojiCarolSettings,
  BingoSettings,
} from '@christmas/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { GameFactory } from '../games/factory.js';
import type { RoomManager } from '../managers/room-manager.js';
import type { AchievementManager } from '../managers/achievement-manager.js';
import type { SyncEngine } from './sync-engine.js';

/**
 * GameManager handles all game-related operations:
 * - Game creation/destruction via GameFactory
 * - Game state management
 * - Game state broadcasting coordination
 * - Session leaderboard management
 * - Game-to-room lifecycle synchronization
 */
export class GameManager {
  // All games now extend PluginGameEngine directly
  private games: Map<string, PluginGameEngine> = new Map();
  private sessionLeaderboards: Map<string, Map<string, number>> = new Map();
  private lastGameState: Map<string, GameState> = new Map();
  private lastSoundEvent: Map<string, { sound: string; state: GameState; timestamp: number }> = new Map();
  private supabase: SupabaseClient | null = null;
  private io: Server | null = null;
  private syncEngine: SyncEngine | null = null;

  constructor(private roomManager: RoomManager) {}

  setSupabaseClient(supabase: SupabaseClient | null) {
    this.supabase = supabase;
  }

  setSocketIO(io: Server) {
    this.io = io;
  }

  setSyncEngine(syncEngine: SyncEngine) {
    this.syncEngine = syncEngine;
  }

  /**
   * Start a game in a room
   */
  async startGame(
    roomCode: string,
    gameType: GameType,
    providedSettings?:
      | TriviaRoyaleSettings
      | PriceIsRightSettings
      | NaughtyOrNiceSettings
      | EmojiCarolSettings
      | BingoSettings
  ): Promise<PluginGameEngine | null> {
    const room = this.roomManager.getRoom(roomCode);
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

    // Get customSetId from settings and load custom content
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
              .limit(50);

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
        }
      }
    }

    console.log(`[GameManager] Creating game ${gameType} with ${room.players.size} players, settings:`, gameSettings);
    console.log(`[GameManager] Custom content loaded:`, {
      questions: customQuestions?.length || 0,
      items: customItems?.length || 0,
      prompts: customPrompts?.length || 0,
    });
    
    const game = GameFactory.createGame(
      gameType,
      room.players,
      roomCode,
      customQuestions,
      customItems,
      customPrompts,
      gameSettings
    );
    if (!game) {
      console.error(`[GameManager] GameFactory.createGame returned null for gameType: ${gameType}`);
      return null;
    }
    
    console.log(`[GameManager] Game created successfully: ${gameType}, state: ${game.getState().state}`);

    this.games.set(roomCode, game);
    room.currentGame = gameType;
    
    // Set Socket.IO server for PluginGameEngine
    if (this.io && 'setSocketIO' in game && typeof (game as any).setSocketIO === 'function') {
      (game as any).setSocketIO(this.io);
    }
    
    // Set room reference for PluginGameEngine
    if ('setRoom' in game && typeof (game as any).setRoom === 'function') {
      (game as any).setRoom(room);
    }
    
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
        console.error(`[GameManager] Failed to update current_game for room ${roomCode}:`, err);
      });
    }
    
    // Broadcast initial STARTING state
    // This syncs to all clients (players, host-control, host-display) via SyncEngine
    this.broadcastGameState(roomCode);
    
    // NOTE: The PLAYING state sync after transition is handled by host-handlers.ts
    // which waits for onPlaying() to complete (3.5 seconds) to ensure game-specific data is loaded.
    // We don't sync here to avoid double sync and ensure we sync after game data is ready.

    return game;
  }

  /**
   * Get game for a room
   */
  getGame(roomCode: string): PluginGameEngine | undefined {
    return this.games.get(roomCode);
  }

  /**
   * End a game in a room
   */
  endGame(roomCode: string): void {
    const room = this.roomManager.getRoom(roomCode);
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
          console.error(`[GameManager] Failed to clear current_game for room ${roomCode}:`, err);
        });
      }
    }
    
    // Clear state tracking
    this.lastGameState.delete(roomCode);
    this.lastSoundEvent.delete(roomCode);
  }

  /**
   * Pause a game
   */
  pauseGame(roomCode: string): void {
    const game = this.games.get(roomCode);
    if (game) {
      game.pause();
      this.broadcastGameState(roomCode);
    }
  }

  /**
   * Resume a game
   */
  resumeGame(roomCode: string): void {
    const game = this.games.get(roomCode);
    if (game) {
      game.resume();
      this.broadcastGameState(roomCode);
    }
  }

  /**
   * Handle player action in a game
   */
  handlePlayerAction(roomCode: string, playerId: string, action: string, data: any): void {
    const game = this.games.get(roomCode);
    if (!game) return;

    game.handlePlayerAction(playerId, action, data);
    this.broadcastGameState(roomCode);
  }

  /**
   * Broadcast game state to all players and host in a room
   * Uses SyncEngine if available, otherwise falls back to legacy method
   */
  broadcastGameState(roomCode: string): void {
    // Always use SyncEngine - no fallbacks
    if (!this.syncEngine) {
      console.error(`[GameManager] Cannot broadcast game state: SyncEngine not initialized for room ${roomCode}`);
      return;
    }

    const game = this.games.get(roomCode);
    if (!game) {
      console.warn(`[GameManager] Cannot broadcast game state: Game not found for room ${roomCode}`);
      return;
    }

    const gameState = game.getState();
    
    // Sync room.gameState with game engine's current state
    const gameStateValue = gameState.state;
    const room = this.roomManager.getRoom(roomCode);
    if (room && room.gameState !== gameStateValue) {
      room.gameState = gameStateValue;
      console.log(`[GameManager] Synced room.gameState to ${gameStateValue} for room ${roomCode}`);
    }
    
    // Update last known state
    this.lastGameState.set(roomCode, gameStateValue);
    
    // Use SyncEngine to sync state to all parties (players, host-control, host-display)
    this.syncEngine.syncState(roomCode, gameState);
  }

  /**
   * Migrate player data in an active game (for reconnection)
   */
  migratePlayerInGame(roomCode: string, oldPlayerId: string, newPlayerId: string): void {
    const game = this.games.get(roomCode);
    if (game && oldPlayerId) {
      game.migratePlayer(oldPlayerId, newPlayerId);
      console.log(`[GameManager] Migrated player data in game engine from ${oldPlayerId.substring(0, 8)} to ${newPlayerId.substring(0, 8)}`);
    }
  }

  /**
   * Get session leaderboard for a room
   */
  getSessionLeaderboard(roomCode: string): Array<{ playerName: string; totalScore: number }> {
    const sessionScores = this.sessionLeaderboards.get(roomCode);
    if (!sessionScores) {
      return [];
    }
    return Array.from(sessionScores.entries())
      .map(([playerName, totalScore]) => ({ playerName, totalScore }))
      .sort((a, b) => b.totalScore - a.totalScore);
  }

  /**
   * Update session score for a player
   */
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
          console.error('[GameManager] Failed to save session score:', error);
        }
      }).catch((err: any) => {
        console.error('[GameManager] Failed to save session score:', err);
      });
    }
  }
  
  /**
   * Restore session score from database
   */
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
  
  /**
   * Restore player score in active game
   * This ensures the game engine's score matches the player's cumulative session score
   */
  restorePlayerScoreInGame(roomCode: string, playerId: string, playerName: string): void {
    const game = this.games.get(roomCode);
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
            console.log(`[GameManager] Restored game score for ${playerName} (${playerId.substring(0, 8)}): ${currentGameScore} -> ${sessionScore}`);
          }
        }
      }
    }
  }

  /**
   * Get scoreboard for a game
   */
  getScoreboard(roomCode: string): Array<{ playerId: string; name: string; score: number }> {
    const game = this.games.get(roomCode);
    if (!game) return [];
    return game.getScoreboard();
  }

  /**
   * Save leaderboard to database and check achievements
   */
  async saveLeaderboard(
    roomCode: string,
    gameType: GameType,
    scoreboard: Array<{ playerId: string; name: string; score: number }>,
    achievementManager?: AchievementManager,
    io?: Server
  ): Promise<void> {
    if (!this.supabase) {
      console.warn('[GameManager] Cannot save leaderboard - Supabase not available');
      return;
    }

    try {
      // Save session scores (cumulative for the room)
      scoreboard.forEach((entry) => {
        this.updateSessionScore(roomCode, entry.name, entry.score);
      });

      // Save to leaderboard table (per-game records)
      const entries = scoreboard.map((entry, index) => ({
        room_code: roomCode,
        player_id: entry.playerId,
        player_name: entry.name,
        game_type: gameType,
        score: entry.score,
        rank: index + 1,
      }));

      await this.supabase.from('leaderboards').insert(entries);

      // Update player profiles (game statistics are updated via trigger)
      for (const entry of scoreboard) {
        const { data: profileData } = await this.supabase
          .from('player_profiles')
          .select('total_score, games_played, best_game_score')
          .eq('player_name', entry.name)
          .single();

        const currentTotal = profileData?.total_score || 0;
        const currentGames = profileData?.games_played || 0;
        const currentBest = profileData?.best_game_score || 0;

        const newTotal = currentTotal + entry.score;
        const newGames = currentGames + 1;
        const newBest = Math.max(currentBest, entry.score);

        await this.supabase.from('player_profiles').upsert(
          {
            player_name: entry.name,
            total_score: newTotal,
            games_played: newGames,
            last_played_at: new Date().toISOString(),
            best_game_score: newBest,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'player_name',
          }
        );

        // Check and unlock achievements
        if (achievementManager) {
          const rank = scoreboard.findIndex((e) => e.name === entry.name) + 1;
          const unlockedAchievements = await achievementManager.checkAndUnlockAchievements(
            entry.name,
            gameType,
            entry.score,
            rank,
            newTotal,
            newGames,
            newBest
          );

          // Notify player of unlocked achievements
          if (unlockedAchievements.length > 0 && io) {
            const playerSocket = io.sockets.sockets.get(entry.playerId);
            if (playerSocket) {
              playerSocket.emit('achievements_unlocked', {
                achievements: unlockedAchievements.map((id: string) => {
                  const achievement = achievementManager?.getAchievement(id);
                  return {
                    id,
                    name: achievement?.name || id,
                    description: achievement?.description || '',
                  };
                }),
              });
            }
          }
        }
      }
    } catch (error) {
      console.error('[GameManager] Error saving leaderboard:', error);
    }
  }
}

