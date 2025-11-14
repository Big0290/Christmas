import { Server, Socket } from 'socket.io';
import { SupabaseClient } from '@supabase/supabase-js';
import { RoomManager } from '../managers/room-manager.js';
import { GameType, GameState, PlayerStatus, Player, sanitizePlayerName, RateLimiter } from '@christmas/core';

const rateLimiter = new RateLimiter(20, 1000); // 20 requests per second

export function setupSocketHandlers(
  io: Server,
  roomManager: RoomManager,
  supabase: SupabaseClient
) {
  io.on('connection', (socket: Socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Rate limiting middleware
    const checkRateLimit = (): boolean => {
      if (!rateLimiter.isAllowed(socket.id)) {
        socket.emit('error', 'Rate limit exceeded');
        return false;
      }
      return true;
    };

    // ========================================================================
    // ROOM MANAGEMENT
    // ========================================================================

    socket.on('create_room', (playerName: string, callback) => {
      if (!checkRateLimit()) return;

      try {
        if (!playerName || typeof playerName !== 'string') {
          callback({ success: false, error: 'Player name is required' });
          return;
        }
        const sanitizedName = sanitizePlayerName(playerName);
        const room = roomManager.createRoom(socket.id, sanitizedName);

        socket.join(room.code);

        const player = room.players.get(socket.id);
        if (!player) {
          callback({ success: false, error: 'Failed to create player' });
          return;
        }

        callback({
          success: true,
          roomCode: room.code,
          player,
          isHost: true,
        });

        console.log(`[Room] Created: ${room.code} by ${sanitizedName}`);
      } catch (error) {
        console.error('[Room] Create error:', error);
        callback({ success: false, error: 'Failed to create room' });
      }
    });

    socket.on('join_room', (code: string, playerName: string, callback) => {
      if (!checkRateLimit()) return;

      try {
        if (!code || typeof code !== 'string' || !playerName || typeof playerName !== 'string') {
          callback({ success: false, error: 'Room code and player name are required' });
          return;
        }
        const sanitizedName = sanitizePlayerName(playerName);
        const result = roomManager.joinRoom(code.toUpperCase(), socket.id, sanitizedName);

        if (!result.success) {
          callback(result);
          return;
        }

        socket.join(code);

        // Notify room of new player
        socket.to(code).emit('player_joined', result.player);

        callback({
          success: true,
          player: result.player,
          isHost: result.room?.hostId === socket.id,
          players: Array.from(result.room?.players.values() || []),
        });

        console.log(`[Room] ${sanitizedName} joined ${code}`);
      } catch (error) {
        console.error('[Room] Join error:', error);
        callback({ success: false, error: 'Failed to join room' });
      }
    });

    socket.on('leave_room', () => {
      // Explicit leave - remove player completely
      handlePlayerLeave(socket, false);
    });

    socket.on('reconnect_player', (roomCode: string, playerName: string, previousPlayerId: string | null, callback) => {
      if (!checkRateLimit()) return;

      try {
        const room = roomManager.getRoom(roomCode);
        if (!room) {
          callback({ success: false, error: 'Room not found' });
          return;
        }

        // Find player by name (case-insensitive) or previous ID
        let existingPlayer: Player | undefined;
        for (const player of room.players.values()) {
          if (player.name.toLowerCase() === playerName.toLowerCase()) {
            // If previous ID matches, prefer that player
            if (previousPlayerId && player.id === previousPlayerId) {
              existingPlayer = player;
              break;
            } else if (!existingPlayer) {
              existingPlayer = player;
            }
          }
        }

        if (!existingPlayer) {
          callback({ success: false, error: 'Player not found in room' });
          return;
        }

        // Check if player is disconnected
        if (existingPlayer.status !== PlayerStatus.DISCONNECTED) {
          callback({ success: false, error: 'Player is already connected' });
          return;
        }

        // Update player with new socket ID
        const oldPlayerId = existingPlayer.id;
        room.players.delete(oldPlayerId);
        roomManager['playerToRoom'].delete(oldPlayerId);

        existingPlayer.id = socket.id;
        existingPlayer.status = PlayerStatus.CONNECTED;
        existingPlayer.lastSeen = Date.now();

        room.players.set(socket.id, existingPlayer);
        roomManager['playerToRoom'].set(socket.id, roomCode);

        socket.join(roomCode);

        // Broadcast player reconnected
        io.to(roomCode).emit('player_reconnected', {
          oldPlayerId,
          newPlayerId: socket.id,
          player: existingPlayer,
        });

        callback({
          success: true,
          player: existingPlayer,
          room: {
            code: room.code,
            players: Array.from(room.players.values()),
            currentGame: room.currentGame,
            gameState: room.gameState,
          },
        });

        console.log(`[Room] ${playerName} reconnected to ${roomCode}`);
      } catch (error) {
        console.error('[Room] Reconnect error:', error);
        callback({ success: false, error: 'Failed to reconnect' });
      }
    });

    // ========================================================================
    // GAME MANAGEMENT (HOST ONLY)
    // ========================================================================

    socket.on('start_game', async (gameType: GameType) => {
      if (!checkRateLimit()) return;

      const room = roomManager.getRoomByPlayer(socket.id);
      if (!room || room.hostId !== socket.id) {
        socket.emit('error', 'Only host can start games');
        return;
      }

      const game = await roomManager.startGame(room.code, gameType);
      if (!game) {
        socket.emit('error', 'Failed to start game');
        return;
      }

      io.to(room.code).emit('game_started', gameType);
      broadcastGameState(room.code);

      console.log(`[Game] Started ${gameType} in room ${room.code}`);
    });

    socket.on('end_game', () => {
      if (!checkRateLimit()) return;

      const room = roomManager.getRoomByPlayer(socket.id);
      if (!room || room.hostId !== socket.id) {
        socket.emit('error', 'Only host can end games');
        return;
      }

      const game = roomManager.getGame(room.code);
      let scoreboard: Array<{ playerId: string; name: string; score: number }> = [];
      let gameType: GameType | null = null;

      if (game) {
        // Get scoreboard and current state before ending game
        scoreboard = game.getScoreboard();
        gameType = game.getState().gameType;

        // End the game (this sets state to GAME_END)
        game.end();

        // Save to leaderboard
        saveLeaderboard(room.code, gameType, scoreboard, supabase, roomManager);

        // Broadcast final game state to all players
        // This ensures all players receive the GAME_END state with scoreboard
        const finalStates = new Map<string, any>();
        room.players.forEach((player) => {
          const finalState = game.getClientState(player.id);
          // Ensure the state is GAME_END and includes scoreboard
          finalState.state = GameState.GAME_END;
          finalState.scoreboard = scoreboard;
          finalStates.set(player.id, finalState);
        });

        // Broadcast to all players simultaneously
        room.players.forEach((player) => {
          const playerSocket = io.sockets.sockets.get(player.id);
          if (playerSocket && finalStates.has(player.id)) {
            playerSocket.emit('game_state_update', finalStates.get(player.id));
          }
        });

        // Broadcast game ended event to all players in the room
        // This serves as a backup and ensures all clients receive the end signal
        io.to(room.code).emit('game_ended', { scoreboard, gameType });
        
        // Now destroy the game after all broadcasts are sent
        roomManager.endGame(room.code);
      } else {
        // No active game, just end the room and notify players
        roomManager.endGame(room.code);
        io.to(room.code).emit('game_ended', { scoreboard, gameType });
      }
      
      console.log(`[Game] Ended in room ${room.code}`);
    });

    socket.on('pause_game', () => {
      if (!checkRateLimit()) return;

      const room = roomManager.getRoomByPlayer(socket.id);
      if (!room || room.hostId !== socket.id) return;

      const game = roomManager.getGame(room.code);
      if (game) {
        game.pause();
        io.to(room.code).emit('game_state_update', { state: 'paused' });
        broadcastGameState(room.code);
      }
    });

    socket.on('resume_game', () => {
      if (!checkRateLimit()) return;

      const room = roomManager.getRoomByPlayer(socket.id);
      if (!room || room.hostId !== socket.id) return;

      const game = roomManager.getGame(room.code);
      if (game) {
        game.resume();
        io.to(room.code).emit('game_state_update', { state: 'playing' });
        broadcastGameState(room.code);
      }
    });

    socket.on('kick_player', (targetPlayerId: string, callback) => {
      if (!checkRateLimit()) return;

      const room = roomManager.getRoomByPlayer(socket.id);
      if (!room || room.hostId !== socket.id) {
        callback({ success: false, error: 'Only host can kick players' });
        return;
      }

      // Prevent kicking the host
      if (targetPlayerId === room.hostId) {
        callback({ success: false, error: 'Cannot kick the host' });
        return;
      }

      // Check if player exists in room
      if (!room.players.has(targetPlayerId)) {
        callback({ success: false, error: 'Player not found in room' });
        return;
      }

      // Remove player from room
      const player = room.players.get(targetPlayerId);
      room.players.delete(targetPlayerId);
      roomManager.leaveRoom(targetPlayerId);

      // Notify the kicked player
      io.to(targetPlayerId).emit('kicked_from_room', { reason: 'You were removed by the host' });

      // Broadcast updated player list to room
      io.to(room.code).emit('player_left', { playerId: targetPlayerId, player });

      // Broadcast updated room state
      io.to(room.code).emit('room_update', {
        players: Array.from(room.players.values()),
        playerCount: room.players.size,
      });

      callback({ success: true, message: `Player ${player?.name} was removed` });
      console.log(`[Room] Player ${targetPlayerId} kicked from room ${room.code} by host`);
    });

    // ========================================================================
    // GAME ACTIONS
    // ========================================================================

    socket.on('trivia_answer', (answerIndex: number) => {
      handleGameAction('answer', { answerIndex });
    });

    socket.on('gift_move', (direction: { x: number; y: number }) => {
      handleGameAction('move', direction);
    });

    socket.on('workshop_upgrade', (upgradeId: string) => {
      handleGameAction('upgrade', { upgradeId });
    });

    socket.on('emoji_pick', (emoji: string) => {
      handleGameAction('pick', { emoji });
    });

    socket.on('vote', (choice: 'naughty' | 'nice') => {
      handleGameAction('vote', { choice });
    });

    socket.on('price_guess', (guess: number) => {
      handleGameAction('guess', { guess });
    });

    // ========================================================================
    // LEADERBOARD QUERIES
    // ========================================================================

    socket.on('get_session_leaderboard', (roomCode: string, callback) => {
      if (!checkRateLimit()) return;

      const room = roomManager.getRoom(roomCode);
      if (!room) {
        callback({ success: false, error: 'Room not found' });
        return;
      }

      const sessionLeaderboard = roomManager.getSessionLeaderboard(roomCode);
      callback({ success: true, leaderboard: sessionLeaderboard });
    });

    socket.on('get_global_leaderboard', async (callback) => {
      if (!checkRateLimit()) return;

      if (!supabase) {
        callback({ success: false, error: 'Database not available' });
        return;
      }

      try {
        const { data, error } = await supabase
          .from('global_leaderboard')
          .select('player_name, total_score, games_played, best_game_score, last_played_at')
          .order('total_score', { ascending: false })
          .limit(100);

        if (error) {
          callback({ success: false, error: error.message });
          return;
        }

        callback({ success: true, leaderboard: data || [] });
      } catch (error: any) {
        callback({ success: false, error: error.message });
      }
    });

    // ========================================================================
    // SETTINGS (HOST ONLY)
    // ========================================================================

    socket.on('update_settings', async (gameType: GameType, settings: any) => {
      if (!checkRateLimit()) return;

      const room = roomManager.getRoomByPlayer(socket.id);
      if (!room || room.hostId !== socket.id) {
        socket.emit('error', 'Only host can update settings');
        return;
      }

      try {
        // Save to database if available
        if (supabase) {
          await supabase.from('game_settings').upsert({
            room_code: room.code,
            game_type: gameType,
            settings,
          });
        }

        // Broadcast to room
        io.to(room.code).emit('settings_updated', { [gameType]: settings });

        console.log(`[Settings] Updated ${gameType} in room ${room.code}`);
      } catch (error) {
        console.error('[Settings] Update error:', error);
        socket.emit('error', 'Failed to update settings');
      }
    });

    // ========================================================================
    // CUSTOM CONTENT MANAGEMENT
    // ========================================================================

    socket.on('save_custom_questions', async (questions: any[], setId: string, callback) => {
      if (!checkRateLimit()) return;

      try {
        if (!supabase) {
          callback({ success: false, error: 'Database not available' });
          return;
        }

        // Validate and insert questions
        const questionData = questions.map((q) => ({
          question: q.question,
          answers: q.answers,
          correct_index: q.correctIndex,
          difficulty: q.difficulty || 'medium',
          category: q.category || null,
          image_url: q.imageUrl || null,
          set_id: setId,
        }));

        const { error } = await supabase.from('trivia_questions').insert(questionData);

        if (error) {
          callback({ success: false, error: error.message });
          return;
        }

        callback({ success: true, count: questionData.length });
        console.log(`[Custom] Saved ${questionData.length} trivia questions with set_id: ${setId}`);
      } catch (error: any) {
        console.error('[Custom] Save questions error:', error);
        callback({ success: false, error: error.message || 'Failed to save questions' });
      }
    });

    socket.on('save_custom_items', async (items: any[], setId: string, callback) => {
      if (!checkRateLimit()) return;

      try {
        if (!supabase) {
          callback({ success: false, error: 'Database not available' });
          return;
        }

        // Validate and insert items
        const itemData = items.map((item) => ({
          name: item.name,
          description: item.description || null,
          price: item.price,
          image_url: item.imageUrl,
          category: item.category || null,
          set_id: setId,
        }));

        const { error } = await supabase.from('price_items').insert(itemData);

        if (error) {
          callback({ success: false, error: error.message });
          return;
        }

        callback({ success: true, count: itemData.length });
        console.log(`[Custom] Saved ${itemData.length} price items with set_id: ${setId}`);
      } catch (error: any) {
        console.error('[Custom] Save items error:', error);
        callback({ success: false, error: error.message || 'Failed to save items' });
      }
    });

    socket.on('get_custom_questions', async (setId: string, callback) => {
      if (!checkRateLimit()) return;

      try {
        if (!supabase) {
          callback({ success: false, error: 'Database not available', questions: [] });
          return;
        }

        const { data, error } = await supabase
          .from('trivia_questions')
          .select('*')
          .eq('set_id', setId);

        if (error) {
          callback({ success: false, error: error.message, questions: [] });
          return;
        }

        const questions = (data || []).map((q) => ({
          id: q.id,
          question: q.question,
          answers: q.answers,
          correctIndex: q.correct_index,
          difficulty: q.difficulty,
          category: q.category,
          imageUrl: q.image_url,
        }));

        callback({ success: true, questions });
      } catch (error: any) {
        console.error('[Custom] Get questions error:', error);
        callback({ success: false, error: error.message || 'Failed to get questions', questions: [] });
      }
    });

    socket.on('get_custom_items', async (setId: string, callback) => {
      if (!checkRateLimit()) return;

      try {
        if (!supabase) {
          callback({ success: false, error: 'Database not available', items: [] });
          return;
        }

        const { data, error } = await supabase
          .from('price_items')
          .select('*')
          .eq('set_id', setId);

        if (error) {
          callback({ success: false, error: error.message, items: [] });
          return;
        }

        const items = (data || []).map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          price: parseFloat(item.price),
          imageUrl: item.image_url,
          category: item.category,
        }));

        callback({ success: true, items });
      } catch (error: any) {
        console.error('[Custom] Get items error:', error);
        callback({ success: false, error: error.message || 'Failed to get items', items: [] });
      }
    });

    socket.on('delete_custom_question', async (questionId: string, callback) => {
      if (!checkRateLimit()) return;

      try {
        if (!supabase) {
          callback({ success: false, error: 'Database not available' });
          return;
        }

        const { error } = await supabase.from('trivia_questions').delete().eq('id', questionId);

        if (error) {
          callback({ success: false, error: error.message });
          return;
        }

        callback({ success: true });
        console.log(`[Custom] Deleted trivia question: ${questionId}`);
      } catch (error: any) {
        console.error('[Custom] Delete question error:', error);
        callback({ success: false, error: error.message || 'Failed to delete question' });
      }
    });

    socket.on('delete_custom_item', async (itemId: string, callback) => {
      if (!checkRateLimit()) return;

      try {
        if (!supabase) {
          callback({ success: false, error: 'Database not available' });
          return;
        }

        const { error } = await supabase.from('price_items').delete().eq('id', itemId);

        if (error) {
          callback({ success: false, error: error.message });
          return;
        }

        callback({ success: true });
        console.log(`[Custom] Deleted price item: ${itemId}`);
      } catch (error: any) {
        console.error('[Custom] Delete item error:', error);
        callback({ success: false, error: error.message || 'Failed to delete item' });
      }
    });

    // ========================================================================
    // HELPER FUNCTIONS
    // ========================================================================

    function handleGameAction(action: string, data: any) {
      if (!checkRateLimit()) return;

      const room = roomManager.getRoomByPlayer(socket.id);
      if (!room) return;

      const game = roomManager.getGame(room.code);
      if (!game) return;

      game.handlePlayerAction(socket.id, action, data);
      broadcastGameState(room.code);
    }

    function broadcastGameState(roomCode: string) {
      const room = roomManager.getRoom(roomCode);
      if (!room) return;

      const game = roomManager.getGame(roomCode);
      if (!game) return;

      // Send personalized state to each player
      room.players.forEach((player) => {
        const playerSocket = io.sockets.sockets.get(player.id);
        if (playerSocket) {
          playerSocket.emit('game_state_update', game.getClientState(player.id));
        }
      });
    }

    function handlePlayerLeave(socket: Socket, markDisconnected: boolean = false) {
      // Mark player as disconnected instead of removing (for reconnection)
      const roomCode = roomManager.leaveRoom(socket.id, markDisconnected);
      if (roomCode) {
        if (markDisconnected) {
          socket.to(roomCode).emit('player_disconnected', socket.id);
        } else {
          socket.to(roomCode).emit('player_left', socket.id);
        }
        socket.leave(roomCode);
      }
    }

    // Handle socket disconnect - mark as disconnected for reconnection
    socket.on('disconnect', () => {
      handlePlayerLeave(socket, true);
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });

  // Periodic game state broadcast (for real-time games like Gift Grabber)
  setInterval(() => {
    const rooms = roomManager['rooms']; // Access private field
    if (rooms) {
      for (const [code, room] of rooms) {
        const game = roomManager.getGame(code);
        if (game && game.getState().state === GameState.PLAYING) {
          // Only broadcast for games in PLAYING state (real-time games)
          // This optimizes bandwidth for turn-based games
          room.players.forEach((player) => {
            const socket = io.sockets.sockets.get(player.id);
            if (socket) {
              socket.emit('game_state_update', game.getClientState(player.id));
            }
          });
        }
      }
    }
  }, 100); // 10Hz update rate for smooth Phaser rendering
}

async function saveLeaderboard(
  roomCode: string,
  gameType: string,
  scoreboard: Array<{ playerId: string; name: string; score: number }>,
  supabase: SupabaseClient | null,
  roomManager: RoomManager
) {
  // Update session leaderboard (cumulative scores for this room session)
  scoreboard.forEach((entry) => {
    roomManager.updateSessionScore(roomCode, entry.name, entry.score);
  });

  // Save to database leaderboard (per-game records)
  if (!supabase) return; // Skip if no database
  
  try {
    const entries = scoreboard.map((entry, index) => ({
      room_code: roomCode,
      player_id: entry.playerId,
      player_name: entry.name,
      game_type: gameType,
      score: entry.score,
      rank: index + 1,
    }));

    await supabase.from('leaderboards').insert(entries);

    // Update global leaderboard
    for (const entry of scoreboard) {
      // Get current player stats
      const { data: currentData } = await supabase
        .from('global_leaderboard')
        .select('total_score, games_played, best_game_score')
        .eq('player_name', entry.name)
        .single();

      const currentTotal = currentData?.total_score || 0;
      const currentGames = currentData?.games_played || 0;
      const currentBest = currentData?.best_game_score || 0;

      await supabase
        .from('global_leaderboard')
        .upsert({
          player_name: entry.name,
          total_score: currentTotal + entry.score,
          games_played: currentGames + 1,
          last_played_at: new Date().toISOString(),
          best_game_score: Math.max(currentBest, entry.score),
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'player_name',
        });
    }
  } catch (error) {
    console.error('[Leaderboard] Error saving to database:', error);
  }
}
