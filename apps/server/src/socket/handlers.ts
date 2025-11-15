import { Server, Socket } from 'socket.io';
import { SupabaseClient } from '@supabase/supabase-js';
import { RoomManager } from '../managers/room-manager.js';
import { GameType, GameState, PlayerStatus, Player, sanitizePlayerName, RateLimiter, isExpired } from '@christmas/core';

const rateLimiter = new RateLimiter(20, 1000); // 20 requests per second

export function setupSocketHandlers(
  io: Server,
  roomManager: RoomManager,
  supabase: SupabaseClient | null
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

        // Host is NOT in players list - return host info separately
        callback({
          success: true,
          roomCode: room.code,
          isHost: true,
          hostName: sanitizedName,
        });

        console.log(`[Room] Created: ${room.code} by ${sanitizedName} (host)`);
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
          roomName: result.room?.settings?.roomName,
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

    socket.on('reconnect_player', async (roomCode: string, playerName: string, previousPlayerId: string | null, callback) => {
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

        // Restore session score
        const restoredScore = await roomManager.restoreSessionScore(roomCode, playerName);
        if (restoredScore > 0) {
          // Update player's current score to match session score
          existingPlayer.score = restoredScore;
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

        // Update game state if game is in progress
        const game = roomManager.getGame(roomCode);
        if (game) {
          // Restore player's score in the game
          if (restoredScore > 0) {
            roomManager.restorePlayerScoreInGame(roomCode, socket.id, playerName);
          }
          // Send updated game state
          socket.emit('game_state_update', game.getClientState(socket.id));
          
          // Also broadcast to room that player reconnected
          io.to(roomCode).emit('player_reconnected', {
            playerId: socket.id,
            playerName: playerName,
            restoredScore: restoredScore,
          });
        }

        callback({
          success: true,
          player: existingPlayer,
          restoredScore,
          room: {
            code: room.code,
            players: Array.from(room.players.values()),
            currentGame: room.currentGame,
            gameState: room.gameState,
          },
        });

        console.log(`[Room] ${playerName} reconnected to ${roomCode} with score ${restoredScore}`);
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

      const roomInfo = roomManager.getRoomBySocketId(socket.id);
      if (!roomInfo || !roomInfo.isHost) {
        socket.emit('error', 'Only host can start games');
        return;
      }
      const room = roomInfo.room;

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

      const roomInfo = roomManager.getRoomBySocketId(socket.id);
      if (!roomInfo || !roomInfo.isHost) {
        socket.emit('error', 'Only host can end games');
        return;
      }
      const room = roomInfo.room;

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

      const roomInfo = roomManager.getRoomBySocketId(socket.id);
      if (!roomInfo || !roomInfo.isHost) return;
      const room = roomInfo.room;

      const game = roomManager.getGame(room.code);
      if (game) {
        game.pause();
        io.to(room.code).emit('game_state_update', { state: 'paused' });
        broadcastGameState(room.code);
      }
    });

    socket.on('resume_game', () => {
      if (!checkRateLimit()) return;

      const roomInfo = roomManager.getRoomBySocketId(socket.id);
      if (!roomInfo || !roomInfo.isHost) return;
      const room = roomInfo.room;

      const game = roomManager.getGame(room.code);
      if (game) {
        game.resume();
        io.to(room.code).emit('game_state_update', { state: 'playing' });
        broadcastGameState(room.code);
      }
    });

    socket.on('kick_player', (targetPlayerId: string, callback) => {
      if (!checkRateLimit()) return;

      const roomInfo = roomManager.getRoomBySocketId(socket.id);
      if (!roomInfo || !roomInfo.isHost) {
        callback({ success: false, error: 'Only host can kick players' });
        return;
      }
      const room = roomInfo.room;

      // Prevent kicking the host (shouldn't happen since host is not a player)
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

    // Throttle gift_move events server-side (client should also throttle)
    const lastMoveTime = new Map<string, number>();
    const MOVE_THROTTLE_MS = 50; // Max 20 updates per second
    
    socket.on('gift_move', (direction: { x: number; y: number }) => {
      if (!checkRateLimit()) return;
      
      // Server-side throttling
      const now = Date.now();
      const lastMove = lastMoveTime.get(socket.id) || 0;
      if (now - lastMove < MOVE_THROTTLE_MS) {
        // Throttled - skip this update
        return;
      }
      lastMoveTime.set(socket.id, now);
      
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
    // PUBLIC ROOMS
    // ========================================================================

    socket.on('list_public_rooms', async (callback) => {
      if (!checkRateLimit()) return;

      try {
        // Get public rooms from database
        if (!supabase) {
          callback({ success: false, error: 'Database not available', rooms: [] });
          return;
        }

        const { data: roomsData, error: dbError } = await supabase
          .from('rooms')
          .select('code, room_name, description, player_count, is_public')
          .eq('is_public', true)
          .eq('is_active', true)
          .gt('expires_at', new Date().toISOString())
          .order('player_count', { ascending: false })
          .limit(50);

        if (dbError) {
          callback({ success: false, error: dbError.message, rooms: [] });
          return;
        }

        // Also include in-memory rooms that are public
        const publicRooms: Array<{ code: string; name?: string; description?: string; playerCount: number }> = [];
        
        // Get from database
        if (roomsData) {
          for (const roomData of roomsData) {
            publicRooms.push({
              code: roomData.code,
              name: roomData.room_name || undefined,
              description: roomData.description || undefined,
              playerCount: roomData.player_count || 0,
            });
          }
        }

        // Also check in-memory rooms
        const rooms = roomManager['rooms'] as Map<string, any>;
        for (const [code, room] of rooms) {
          // Check if room is public (from settings or metadata)
          const isPublic = room.settings?.isPublic || false;
          if (isPublic && !isExpired(room.expiresAt)) {
            // Check if already in list
            const exists = publicRooms.some(r => r.code === code);
            if (!exists) {
              const playersArray = Array.from(room.players.values()) as Player[];
              const connectedCount = playersArray.filter(
                (p: Player) => p.status === PlayerStatus.CONNECTED
              ).length;
              publicRooms.push({
                code: room.code,
                name: room.settings?.roomName || undefined,
                description: room.settings?.description || undefined,
                playerCount: connectedCount,
              });
            }
          }
        }

        // Sort by player count
        publicRooms.sort((a, b) => b.playerCount - a.playerCount);

        callback({ success: true, rooms: publicRooms });
      } catch (error: any) {
        console.error('[Public Rooms] List error:', error);
        callback({ success: false, error: error.message || 'Failed to list public rooms', rooms: [] });
      }
    });

    socket.on('update_room_settings', async (settings: { isPublic?: boolean; roomName?: string; description?: string }, callback) => {
      if (!checkRateLimit()) return;

      const roomInfo = roomManager.getRoomBySocketId(socket.id);
      if (!roomInfo || !roomInfo.isHost) {
        callback({ success: false, error: 'Only host can update room settings' });
        return;
      }
      const room = roomInfo.room;

      try {
        // Update room settings
        if (settings.isPublic !== undefined) {
          room.settings.isPublic = settings.isPublic;
        }
        if (settings.roomName !== undefined) {
          room.settings.roomName = settings.roomName;
        }
        if (settings.description !== undefined) {
          room.settings.description = settings.description;
        }

        // Update database
        if (supabase) {
          const updateData: any = {};
          if (settings.isPublic !== undefined) {
            updateData.is_public = settings.isPublic;
          }
          if (settings.roomName !== undefined) {
            updateData.room_name = settings.roomName;
          }
          if (settings.description !== undefined) {
            updateData.description = settings.description;
          }

          await supabase
            .from('rooms')
            .update(updateData)
            .eq('code', room.code);
        }

        // Broadcast room update
        io.to(room.code).emit('room_settings_updated', {
          isPublic: room.settings.isPublic,
          roomName: room.settings.roomName,
          description: room.settings.description,
        });

        callback({ success: true, room: {
          code: room.code,
          isPublic: room.settings.isPublic,
          roomName: room.settings.roomName,
          description: room.settings.description,
        }});

        console.log(`[Room] Settings updated for room ${room.code}`);
      } catch (error: any) {
        console.error('[Room] Update settings error:', error);
        callback({ success: false, error: error.message || 'Failed to update room settings' });
      }
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

    socket.on('get_game_settings', async (roomCode: string, gameType: GameType, callback) => {
      if (!checkRateLimit()) return;

      try {
        // Verify host permissions
        const room = roomManager.getRoom(roomCode);
        if (!room) {
          callback({ success: false, error: 'Room not found' });
          return;
        }

        const hostRoom = roomManager.getRoomByHost(socket.id);
        if (!hostRoom || hostRoom.code !== roomCode) {
          callback({ success: false, error: 'You must be the host of this room' });
          return;
        }

        if (!supabase) {
          callback({ success: false, error: 'Database not available', settings: {} });
          return;
        }

        const { data, error } = await supabase
          .from('game_settings')
          .select('settings')
          .eq('room_code', roomCode)
          .eq('game_type', gameType)
          .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
          callback({ success: false, error: error.message, settings: {} });
          return;
        }

        callback({ success: true, settings: data?.settings || {} });
      } catch (error: any) {
        console.error('[Settings] Get error:', error);
        callback({ success: false, error: error.message || 'Failed to get settings', settings: {} });
      }
    });

    socket.on('update_settings', async (gameType: GameType, settings: any) => {
      if (!checkRateLimit()) return;

      const roomInfo = roomManager.getRoomBySocketId(socket.id);
      if (!roomInfo || !roomInfo.isHost) {
        socket.emit('error', 'Only host can update settings');
        return;
      }
      const room = roomInfo.room;

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
    // QUESTION SET MANAGEMENT (Host-only)
    // ========================================================================

    socket.on('list_question_sets', async (callback) => {
      if (!checkRateLimit()) return;

      try {
        if (!supabase) {
          callback({ success: false, error: 'Database not available', sets: [] });
          return;
        }

        // Get all question sets (for now, we'll allow any host to see all sets)
        // In the future, we can filter by host_id if needed
        const { data, error } = await supabase
          .from('question_sets')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          callback({ success: false, error: error.message, sets: [] });
          return;
        }

        const sets = (data || []).map((set) => ({
          id: set.id,
          name: set.name,
          description: set.description || undefined,
          questionCount: set.question_count || 0,
          createdAt: set.created_at,
        }));

        callback({ success: true, sets });
      } catch (error: any) {
        console.error('[Question Sets] List error:', error);
        callback({ success: false, error: error.message || 'Failed to list question sets', sets: [] });
      }
    });

    socket.on('create_question_set', async (name: string, description: string | undefined, callback) => {
      if (!checkRateLimit()) return;

      try {
        // Verify host permissions
        const roomInfo = roomManager.getRoomBySocketId(socket.id);
        if (!roomInfo || !roomInfo.isHost) {
          callback({ success: false, error: 'You must be a host' });
          return;
        }

        if (!supabase) {
          callback({ success: false, error: 'Database not available' });
          return;
        }

        if (!name || !name.trim()) {
          callback({ success: false, error: 'Set name is required' });
          return;
        }

        // Generate a unique set ID
        const setId = `set_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const { data, error } = await supabase
          .from('question_sets')
          .insert({
            id: setId,
            name: name.trim(),
            description: description?.trim() || null,
            host_id: roomInfo.room.hostId,
            question_count: 0,
          })
          .select()
          .single();

        if (error) {
          callback({ success: false, error: error.message });
          return;
        }

        callback({
          success: true,
          set: {
            id: data.id,
            name: data.name,
            description: data.description || undefined,
            questionCount: 0,
          },
        });

        console.log(`[Question Sets] Created set: ${setId} by host ${roomInfo.room.hostId}`);
      } catch (error: any) {
        console.error('[Question Sets] Create error:', error);
        callback({ success: false, error: error.message || 'Failed to create question set' });
      }
    });

    socket.on('add_question_to_set', async (setId: string, question: any, callback) => {
      if (!checkRateLimit()) return;

      try {
        // Verify host permissions
        const roomInfo = roomManager.getRoomBySocketId(socket.id);
        if (!roomInfo || !roomInfo.isHost) {
          callback({ success: false, error: 'You must be a host' });
          return;
        }

        if (!supabase) {
          callback({ success: false, error: 'Database not available' });
          return;
        }

        // Validate question
        if (!question.question || !question.question.trim()) {
          callback({ success: false, error: 'Question text is required' });
          return;
        }

        if (!question.answers || !Array.isArray(question.answers) || question.answers.length < 2) {
          callback({ success: false, error: 'At least 2 answers are required' });
          return;
        }

        if (typeof question.correctIndex !== 'number' || question.correctIndex < 0 || question.correctIndex >= question.answers.length) {
          callback({ success: false, error: 'Invalid correct answer index' });
          return;
        }

        // Verify set exists
        const { data: setData, error: setError } = await supabase
          .from('question_sets')
          .select('id')
          .eq('id', setId)
          .single();

        if (setError || !setData) {
          callback({ success: false, error: 'Question set not found' });
          return;
        }

        // Insert question
        const { data, error } = await supabase
          .from('trivia_questions')
          .insert({
            question: question.question.trim(),
            answers: question.answers.filter((a: string) => a && a.trim()),
            correct_index: question.correctIndex,
            difficulty: question.difficulty || 'medium',
            category: question.category?.trim() || null,
            image_url: question.imageUrl?.trim() || null,
            set_id: setId,
          })
          .select()
          .single();

        if (error) {
          callback({ success: false, error: error.message });
          return;
        }

        callback({
          success: true,
          question: {
            id: data.id,
            question: data.question,
            answers: data.answers,
            correctIndex: data.correct_index,
            difficulty: data.difficulty,
            category: data.category,
            imageUrl: data.image_url,
          },
        });

        console.log(`[Question Sets] Added question to set ${setId}`);
      } catch (error: any) {
        console.error('[Question Sets] Add question error:', error);
        callback({ success: false, error: error.message || 'Failed to add question' });
      }
    });

    socket.on('delete_question_set', async (setId: string, callback) => {
      if (!checkRateLimit()) return;

      try {
        // Verify host permissions
        const roomInfo = roomManager.getRoomBySocketId(socket.id);
        if (!roomInfo || !roomInfo.isHost) {
          callback({ success: false, error: 'You must be a host' });
          return;
        }

        if (!supabase) {
          callback({ success: false, error: 'Database not available' });
          return;
        }

        // Delete all questions in the set first (trigger will update count)
        const { error: questionsError } = await supabase
          .from('trivia_questions')
          .delete()
          .eq('set_id', setId);

        if (questionsError) {
          callback({ success: false, error: questionsError.message });
          return;
        }

        // Delete the set
        const { error } = await supabase
          .from('question_sets')
          .delete()
          .eq('id', setId);

        if (error) {
          callback({ success: false, error: error.message });
          return;
        }

        callback({ success: true });
        console.log(`[Question Sets] Deleted set: ${setId}`);
      } catch (error: any) {
        console.error('[Question Sets] Delete error:', error);
        callback({ success: false, error: error.message || 'Failed to delete question set' });
      }
    });

    socket.on('set_room_question_set', async (roomCode: string, setId: string | null, callback) => {
      if (!checkRateLimit()) return;

      try {
        // Verify host permissions
        const room = roomManager.getRoom(roomCode);
        if (!room) {
          callback({ success: false, error: 'Room not found' });
          return;
        }

        const hostRoom = roomManager.getRoomByHost(socket.id);
        if (!hostRoom || hostRoom.code !== roomCode) {
          callback({ success: false, error: 'You must be the host of this room' });
          return;
        }

        if (!supabase) {
          callback({ success: false, error: 'Database not available' });
          return;
        }

        // If setId is provided, verify it exists
        if (setId) {
          const { data: setData, error: setError } = await supabase
            .from('question_sets')
            .select('id')
            .eq('id', setId)
            .single();

          if (setError || !setData) {
            callback({ success: false, error: 'Question set not found' });
            return;
          }
        }

        // Get or create game settings for this room and game type
        const { data: existingSettings } = await supabase
          .from('game_settings')
          .select('settings')
          .eq('room_code', roomCode)
          .eq('game_type', GameType.TRIVIA_ROYALE)
          .single();

        const currentSettings = existingSettings?.settings || {};

        // Update settings with the new question set ID
        const updatedSettings = {
          ...currentSettings,
          customQuestionSetId: setId || null,
        };

        // Upsert game settings
        const { error } = await supabase
          .from('game_settings')
          .upsert({
            room_code: roomCode,
            game_type: GameType.TRIVIA_ROYALE,
            settings: updatedSettings,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'room_code,game_type',
          });

        if (error) {
          callback({ success: false, error: error.message });
          return;
        }

        callback({ success: true });
        console.log(`[Question Sets] Set room ${roomCode} to use question set: ${setId || 'default'}`);
      } catch (error: any) {
        console.error('[Question Sets] Set room question set error:', error);
        callback({ success: false, error: error.message || 'Failed to set question set' });
      }
    });

    socket.on('get_questions_for_set', async (setId: string, callback) => {
      if (!checkRateLimit()) return;

      // Reuse existing get_custom_questions handler
      try {
        if (!supabase) {
          callback({ success: false, error: 'Database not available', questions: [] });
          return;
        }

        const { data, error } = await supabase
          .from('trivia_questions')
          .select('*')
          .eq('set_id', setId)
          .order('created_at', { ascending: true });

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
        console.error('[Question Sets] Get questions error:', error);
        callback({ success: false, error: error.message || 'Failed to get questions', questions: [] });
      }
    });

    // ========================================================================
    // HELPER FUNCTIONS
    // ========================================================================

    function handleGameAction(action: string, data: any) {
      if (!checkRateLimit()) return;

      // Only players can perform game actions, not hosts
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
      // Check if host or player
      const roomInfo = roomManager.getRoomBySocketId(socket.id);
      if (!roomInfo) return;
      
      const roomCode = roomManager.leaveRoom(socket.id, markDisconnected);
      if (roomCode) {
        if (roomInfo.isHost) {
          // Host left - notify all players
          io.to(roomCode).emit('host_left', { reason: 'Host disconnected' });
        } else {
          // Player left
          if (markDisconnected) {
            socket.to(roomCode).emit('player_disconnected', socket.id);
          } else {
            socket.to(roomCode).emit('player_left', socket.id);
          }
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
  // Reduced frequency and only broadcast when state actually changes
  const lastBroadcastState = new Map<string, string>();
  setInterval(() => {
    const rooms = roomManager['rooms']; // Access private field
    if (rooms) {
      for (const [code, room] of rooms) {
        const game = roomManager.getGame(code);
        if (game && game.getState().state === GameState.PLAYING) {
          // Only broadcast for games in PLAYING state (real-time games)
          // This optimizes bandwidth for turn-based games
          
          // Check if state has changed (use JSON string comparison for simplicity)
          const currentState = JSON.stringify(game.getState());
          const lastState = lastBroadcastState.get(code);
          
          // Only broadcast if state changed or every 200ms (5Hz instead of 10Hz)
          const shouldBroadcast = currentState !== lastState || 
            (Date.now() % 200 < 100); // Throttle to 5Hz
          
          if (shouldBroadcast) {
            lastBroadcastState.set(code, currentState);
            room.players.forEach((player) => {
              const socket = io.sockets.sockets.get(player.id);
              if (socket) {
                socket.emit('game_state_update', game.getClientState(player.id));
              }
            });
          }
        } else {
          // Clear state cache when game ends
          lastBroadcastState.delete(code);
        }
      }
    }
  }, 100); // Check every 100ms but throttle broadcasts to 5Hz (200ms intervals)
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
  if (!supabase) {
    console.warn('[Leaderboard] Cannot save to database - Supabase not available');
    return;
  }
  
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

    // Update global leaderboard (legacy)
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

    // Update player_profiles (new system)
    // The trigger should handle this, but we can also do it explicitly
    for (const entry of scoreboard) {
      const { data: profileData } = await supabase
        .from('player_profiles')
        .select('total_score, games_played, best_game_score')
        .eq('player_name', entry.name)
        .single();

      const currentTotal = profileData?.total_score || 0;
      const currentGames = profileData?.games_played || 0;
      const currentBest = profileData?.best_game_score || 0;

      await supabase
        .from('player_profiles')
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
