import { Server, Socket } from 'socket.io';
import { SupabaseClient } from '@supabase/supabase-js';
import { verifyAuthToken } from '../lib/supabase.js';
import { sanitizePlayerName, GameType, GameState, isExpired, RateLimiter, Room } from '@christmas/core';
import type { RoomEngine } from '../engine/room-engine.js';
import type { AchievementManager } from '../managers/achievement-manager.js';

const rateLimiter = new RateLimiter(20, 1000); // 20 requests per second

/**
 * Sets up host-specific socket event handlers
 */
export function setupHostHandlers(
  io: Server,
  socket: Socket,
  roomEngine: RoomEngine,
  supabase: SupabaseClient | null,
  achievementManager?: AchievementManager
) {
  // Update connection activity on any host event to keep connection alive
  const updateActivity = () => {
    roomEngine.connectionManager.updateLastSeen(socket.id);
  };
  
  // Wrap socket.on to automatically update activity on all host events
  const originalOn = socket.on.bind(socket);
  socket.on = function(event: string, handler: any) {
    if (event === 'disconnect') {
      // Don't wrap disconnect handler
      return originalOn(event, handler);
    }
    
    // Wrap handler to update activity before calling
    return originalOn(event, (...args: any[]) => {
      updateActivity();
      return handler(...args);
    });
  };
  const checkRateLimit = (): boolean => {
    if (!rateLimiter.isAllowed(socket.id)) {
      socket.emit('error', 'Rate limit exceeded');
      return false;
    }
    return true;
  };

  const broadcastGameState = (roomCode: string): void => {
    roomEngine.broadcastGameState(roomCode);
  };
  // ========================================================================
  // ROOM CREATION
  // ========================================================================

  socket.on(
    'create_room',
    async (
      playerName: string,
      authToken: string | undefined,
      language: 'en' | 'fr' | undefined,
      callback
    ) => {
      if (!checkRateLimit()) return;

      try {
        // Require authentication to create rooms
        if (!authToken) {
          callback({
            success: false,
            error: 'Authentication required to create rooms. Please sign in.',
          });
          return;
        }

        console.log('[Host] Verifying auth token for room creation...');
        const authUser = await verifyAuthToken(authToken);
        if (!authUser) {
          callback({
            success: false,
            error:
              'Invalid or expired authentication token. Please sign in again. After confirming your email, you need to sign in with your email and password.',
          });
          return;
        }
        console.log('[Host] Token verified successfully for user:', authUser.email);

        if (!playerName || typeof playerName !== 'string') {
          callback({ success: false, error: 'Player name is required' });
          return;
        }
        const sanitizedName = sanitizePlayerName(playerName);

        // Create or get existing room
        const room = await roomEngine.createOrGetRoom(socket.id, sanitizedName, authUser.userId);

        // Ensure socket joins the room
        socket.join(room.code);

        // Update last accessed timestamp
        await roomEngine.updateLastAccessed(room.code);

        // Get host token
        const hostToken = roomEngine.getHostToken(room.code);
        callback({
          success: true,
          roomCode: room.code,
          isHost: true,
          hostName: sanitizedName,
          hostToken,
        });

        // Emit initial room_update to sync state
        socket.emit('room_update', {
          players: Array.from(room.players.values()),
          playerCount: room.players.size,
        });

        console.log(`[Host] Created: ${room.code} by ${sanitizedName} (user: ${authUser.userId})`);
      } catch (error) {
        console.error('[Host] Create error:', error);
        callback({ success: false, error: 'Failed to create room' });
      }
    }
  );

  // ========================================================================
  // HOST RECONNECTION
  // ========================================================================

  socket.on(
    'reconnect_host',
    async (roomCode: string, hostToken: string, language: 'en' | 'fr' | undefined, callback) => {
      if (!checkRateLimit()) {
        if (typeof callback === 'function') {
          callback({ success: false, error: 'Rate limit exceeded' });
        }
        return;
      }

      const safeCallback = typeof callback === 'function' ? callback : () => {};

      try {
        console.log(`[Host] reconnect_host called for room ${roomCode} by socket ${socket.id}`);

        const codeNormalized = roomCode.toUpperCase();
        
        // Check if reconnection is allowed (rate limiting)
        if (!roomEngine.connectionManager.canAttemptReconnection(socket.id)) {
          const attempts = roomEngine.connectionManager.getReconnectionAttempts(socket.id);
          console.warn(`[Host] Socket ${socket.id.substring(0, 8)} exceeded reconnection attempts (${attempts?.count || 0}/${5})`);
          safeCallback({ success: false, error: 'Too many reconnection attempts. Please wait before trying again.' });
          return;
        }

        // Record reconnection attempt
        const attemptInfo = roomEngine.connectionManager.recordReconnectionAttempt(socket.id);
        if (!attemptInfo.shouldRetry) {
          safeCallback({ success: false, error: 'Maximum reconnection attempts exceeded' });
          return;
        }
        
        // Verify host token
        let mappedRoom = roomEngine.verifyHostToken(hostToken);
        let room: Room | undefined = undefined;
        
        if (!mappedRoom || mappedRoom !== codeNormalized) {
          // Try to get from database if auth token available
          const authToken = (socket.handshake.auth?.token ||
            socket.handshake.headers?.authorization?.replace('Bearer ', '')) as string | undefined;
          if (authToken && supabase) {
            const authUser = await verifyAuthToken(authToken);
            if (authUser) {
              // Get token from database (this will restore it to memory)
              let dbToken = await roomEngine.getHostTokenFromDatabase(codeNormalized, authUser.userId);
              
              // If no token found but room exists, try to restore room first
              if (!dbToken) {
                console.log(`[Host] No token found in database for room ${codeNormalized}, attempting to restore room...`);
                const restoredRoom = await roomEngine.getRoomByHostUserId(authUser.userId);
                if (restoredRoom && restoredRoom.code === codeNormalized) {
                  // Room exists - try to regenerate token
                  console.log(`[Host] Room ${codeNormalized} exists, generating new host token...`);
                  const regenerateResult = await roomEngine.regenerateHostToken(codeNormalized, authUser.userId);
                  if (regenerateResult.success && regenerateResult.token) {
                    dbToken = regenerateResult.token;
                    // Store the new token - it will be returned in the callback
                    console.log(`[Host] ✅ Generated new host token for room ${codeNormalized}`);
                    // Don't count this as a failed attempt - room exists and token was regenerated
                    roomEngine.connectionManager.resetReconnectionAttempts(socket.id);
                    // Continue with reconnection using the new token
                  } else {
                    console.error(`[Host] ❌ Failed to regenerate host token for room ${codeNormalized}`);
                    safeCallback({ success: false, error: 'Failed to regenerate host token. Please try again.' });
                    return;
                  }
                } else {
                  console.error(`[Host] ❌ No token found in database for room ${codeNormalized} and user ${authUser.userId}, and room doesn't exist or doesn't belong to user`);
                  safeCallback({ success: false, error: 'Invalid host token' });
                  return;
                }
              }
              
              // If tokens don't match, but we just regenerated, use the new token
              if (dbToken !== hostToken) {
                // Check if the provided token might be stale and room exists
                const roomCheck = await roomEngine.getRoomByHostUserId(authUser.userId);
                if (roomCheck && roomCheck.code === codeNormalized) {
                  // Room exists and belongs to user - accept the new token from database
                  console.log(`[Host] Token mismatch detected, but room exists. Using token from database for room ${codeNormalized}`);
                  // Update the token mapping in memory (already done by getHostTokenFromDatabase)
                  // Don't count this as failure - just use the correct token
                  roomEngine.connectionManager.resetReconnectionAttempts(socket.id);
                } else {
                  console.error(`[Host] ❌ Token mismatch for room ${codeNormalized}: dbToken=${dbToken?.substring(0, 20)}..., providedToken=${hostToken.substring(0, 20)}...`);
                  safeCallback({ success: false, error: 'Invalid host token' });
                  return;
                }
              }
              
              // Token matches and has been restored to memory - verify it works
              mappedRoom = roomEngine.verifyHostToken(hostToken);
              if (!mappedRoom || mappedRoom !== codeNormalized) {
                console.error(`[Host] ❌ Token restored to memory but verification still failed: mappedRoom=${mappedRoom}, expected=${codeNormalized}`);
                // Try to restore the room anyway since token is valid
                const restoredRoom = await roomEngine.getRoomByHostUserId(authUser.userId);
                if (!restoredRoom || restoredRoom.code !== codeNormalized) {
                  safeCallback({ success: false, error: 'Failed to restore room' });
                  return;
                }
                // Room restored, continue with reconnection
                room = restoredRoom;
              }
            } else {
              safeCallback({ success: false, error: 'Invalid authentication token' });
              return;
            }
          } else {
            console.error(`[Host] No auth token provided for reconnection to room ${codeNormalized}`);
            safeCallback({ success: false, error: 'Invalid host token' });
            return;
          }
        }

        // Validate connection state before processing reconnection
        const connectionInfo = roomEngine.connectionManager.getSocketInfo(socket.id);
        if (connectionInfo && connectionInfo.connected && connectionInfo.roomCode === codeNormalized && connectionInfo.isHost) {
          // Socket is already connected as host to this room - might be duplicate reconnection
          console.warn(`[Host] Socket ${socket.id.substring(0, 8)} already connected as host to room ${codeNormalized}, allowing reconnection anyway`);
        }

        // Get room if not already restored (should be in memory now, or try to load from DB)
        // Retry logic for room restoration
        let retryCount = 0;
        const MAX_RETRIES = 3;
        
        while (!room && retryCount < MAX_RETRIES) {
          if (retryCount === 0) {
            // First try: check memory
            room = roomEngine.getRoom(codeNormalized);
          }
          
          if (!room) {
            if (retryCount > 0) {
              // Wait a bit before retrying (exponential backoff)
              await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
            }
            
            // Try to restore from database
            console.log(`[Host] Room ${codeNormalized} not in memory, attempting to restore from database (retry ${retryCount + 1}/${MAX_RETRIES})...`);
            const authToken = (socket.handshake.auth?.token ||
              socket.handshake.headers?.authorization?.replace('Bearer ', '')) as string | undefined;
            if (authToken && supabase) {
              const authUser = await verifyAuthToken(authToken);
              if (authUser) {
                // Try to get room by host user ID (will restore if exists)
                const restoredRoom = await roomEngine.getRoomByHostUserId(authUser.userId);
                if (restoredRoom && restoredRoom.code === codeNormalized) {
                  room = restoredRoom;
                  console.log(`[Host] Successfully restored room ${codeNormalized} from database`);
                  break;
                }
              }
            }
          }
          
          retryCount++;
        }
        
        if (!room) {
          console.error(`[Host] Failed to restore room ${codeNormalized} from database after ${MAX_RETRIES} retries`);
          safeCallback({ success: false, error: 'Room not found' });
          return;
        }

        // Update host socket (updates room hostId, marks host as connected, and registers in ConnectionManager)
        // Update host socket
        try {
          roomEngine.updateHostSocket(codeNormalized, socket.id);
        } catch (error: any) {
          console.error(`[Host] ❌ Error updating host socket:`, {
            socketId: socket.id.substring(0, 8),
            roomCode: codeNormalized,
            error: error?.message || String(error),
            stack: error?.stack,
          });
          safeCallback({ success: false, error: 'Failed to update host socket' });
          return;
        }

        // Join the room
        socket.join(codeNormalized);

        // Update last accessed timestamp
        try {
          await roomEngine.updateLastAccessed(codeNormalized);
        } catch (error: any) {
          console.error(`[Host] ❌ Error updating last accessed timestamp:`, {
            roomCode: codeNormalized,
            error: error?.message || String(error),
          });
          // Non-critical error, continue
        }

        // Get the current host token (might be newly regenerated)
        const currentHostToken = roomEngine.getHostToken(codeNormalized);
        
        safeCallback({
          success: true,
          room: {
            code: room.code,
            players: Array.from(room.players.values()),
            currentGame: room.currentGame,
            gameState: room.gameState,
          },
          // Include host token in response (especially if it was regenerated)
          hostToken: currentHostToken,
        });

        // Broadcast authoritative players list
        io.to(codeNormalized).emit('room_update', {
          players: Array.from(room.players.values()),
          playerCount: room.players.size,
        });

        // Reset reconnection attempts on success
        roomEngine.connectionManager.resetReconnectionAttempts(socket.id);
        console.log(`[Host] ✅ Host reconnected to ${codeNormalized}`, {
          socketId: socket.id.substring(0, 8),
          roomCode: codeNormalized,
        });
      } catch (e: any) {
        console.error('[Host] ❌ Reconnect host error:', {
          socketId: socket.id.substring(0, 8),
          roomCode: roomCode || 'unknown',
          error: e?.message || String(e),
          stack: e?.stack,
        });
        safeCallback({ success: false, error: 'Failed to reconnect host' });
      }
    }
  );

  // ========================================================================
  // ROOM MANAGEMENT (HOST ONLY)
  // ========================================================================

  socket.on('get_my_room', async (callback) => {
    if (!checkRateLimit()) return;

    try {
      const authToken = (socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '')) as string | undefined;
      if (!authToken) {
        callback({ success: false, error: 'Authentication required', room: null });
        return;
      }

      const authUser = await verifyAuthToken(authToken);
      if (!authUser) {
        callback({ success: false, error: 'Invalid authentication token', room: null });
        return;
      }

      const room = await roomEngine.getRoomByHostUserId(authUser.userId);

      if (room) {
        const hostToken = roomEngine.getHostToken(room.code);
        callback({
          success: true,
          room: {
            code: room.code,
            roomName: room.settings.roomName || null,
            description: room.settings.description || null,
            playerCount: room.players.size,
            isActive: !isExpired(room.expiresAt),
            hostToken,
          },
        });
      } else {
        callback({ success: true, room: null });
      }
    } catch (error: any) {
      console.error('[Host] get_my_room error:', error);
      callback({ success: false, error: error.message || 'Failed to get room', room: null });
    }
  });

  socket.on('get_room_details', async (roomCode: string, callback) => {
    if (!checkRateLimit()) return;

    try {
      const authToken = (socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '')) as string | undefined;
      if (!authToken) {
        callback({ success: false, error: 'Authentication required' });
        return;
      }

      const authUser = await verifyAuthToken(authToken);
      if (!authUser) {
        callback({ success: false, error: 'Invalid authentication token' });
        return;
      }

      if (!supabase) {
        callback({ success: false, error: 'Database not available' });
        return;
      }

      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('code', roomCode)
        .eq('host_user_id', authUser.userId)
        .single();

      if (error || !data) {
        callback({ success: false, error: 'Room not found or unauthorized' });
        return;
      }

      const inMemoryRoom = roomEngine.getRoom(roomCode);
      const players = inMemoryRoom
        ? Array.from(inMemoryRoom.players.values()).map((p) => ({
            id: p.id,
            name: p.name,
            avatar: p.avatar,
            score: p.score,
            status: p.status,
            language: p.language,
          }))
        : [];

      callback({ success: true, room: data, players });
    } catch (error: any) {
      console.error('[Host] Get room details error:', error);
      callback({ success: false, error: error.message || 'Failed to get room details' });
    }
  });

  socket.on('get_room_players', async (roomCode: string, callback) => {
    if (!checkRateLimit()) return;

    try {
      const codeNormalized = roomCode.toUpperCase().trim();

      const authToken = (socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '')) as string | undefined;
      if (!authToken) {
        callback({ success: false, error: 'Authentication required', players: [] });
        return;
      }

      const authUser = await verifyAuthToken(authToken);
      if (!authUser) {
        callback({ success: false, error: 'Invalid authentication token', players: [] });
        return;
      }

      if (!supabase) {
        callback({ success: false, error: 'Database not available', players: [] });
        return;
      }

      // Verify room ownership
      const { data: roomData } = await supabase
        .from('rooms')
        .select('host_user_id')
        .eq('code', codeNormalized)
        .eq('host_user_id', authUser.userId)
        .single();

      if (!roomData) {
        callback({ success: false, error: 'Room not found or unauthorized', players: [] });
        return;
      }

      const room = roomEngine.getRoom(codeNormalized);
      if (!room) {
        callback({ success: true, players: [] });
        return;
      }

      const players = Array.from(room.players.values()).map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        score: p.score,
        status: p.status,
        language: p.language,
      }));

      callback({ success: true, players });
    } catch (error: any) {
      console.error('[Host] Get room players error:', error);
      callback({ success: false, error: error.message || 'Failed to get players', players: [] });
    }
  });

  socket.on(
    'update_room',
    async (
      roomCode: string,
      settings: { room_name?: string; description?: string },
      callback
    ) => {
      if (!checkRateLimit()) return;

      try {
        const authToken = (socket.handshake.auth?.token ||
          socket.handshake.headers?.authorization?.replace('Bearer ', '')) as string | undefined;
        if (!authToken) {
          callback({ success: false, error: 'Authentication required' });
          return;
        }

        const authUser = await verifyAuthToken(authToken);
        if (!authUser) {
          callback({ success: false, error: 'Invalid authentication token' });
          return;
        }

        if (!supabase) {
          callback({ success: false, error: 'Database not available' });
          return;
        }

        // Verify user owns the room
        const { data } = await supabase
          .from('rooms')
          .select('host_user_id')
          .eq('code', roomCode)
          .single();

        if (!data || data.host_user_id !== authUser.userId) {
          callback({ success: false, error: 'Unauthorized' });
          return;
        }

        const success = await roomEngine.updateRoomSettings(roomCode, settings);
        if (success) {
          callback({ success: true });
        } else {
          callback({ success: false, error: 'Failed to update room settings' });
        }
      } catch (error: any) {
        console.error('[Host] Update room error:', error);
        callback({ success: false, error: error.message || 'Failed to update room' });
      }
    }
  );

  socket.on('delete_room', async (roomCode: string, callback) => {
    if (!checkRateLimit()) return;

    try {
      const authToken = (socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '')) as string | undefined;
      if (!authToken) {
        callback({ success: false, error: 'Authentication required' });
        return;
      }

      const authUser = await verifyAuthToken(authToken);
      if (!authUser) {
        callback({ success: false, error: 'Invalid authentication token' });
        return;
      }

      const success = await roomEngine.deactivateRoom(roomCode, authUser.userId);
      if (success) {
        io.to(roomCode).emit('room_deleted', { reason: 'Host deleted the room' });
        callback({ success: true });
      } else {
        callback({ success: false, error: 'Failed to delete room or unauthorized' });
      }
    } catch (error: any) {
      console.error('[Host] Delete room error:', error);
      callback({ success: false, error: error.message || 'Failed to delete room' });
    }
  });

  socket.on('reactivate_room', async (roomCode: string, callback) => {
    if (!checkRateLimit()) return;

    try {
      const authToken = (socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '')) as string | undefined;
      if (!authToken) {
        callback({ success: false, error: 'Authentication required' });
        return;
      }

      const authUser = await verifyAuthToken(authToken);
      if (!authUser) {
        callback({ success: false, error: 'Invalid authentication token' });
        return;
      }

      const result = await roomEngine.reactivateRoom(roomCode, authUser.userId);
      callback(result);
    } catch (error: any) {
      console.error('[Host] Reactivate room error:', error);
      callback({ success: false, error: error.message || 'Failed to reactivate room' });
    }
  });

  socket.on('regenerate_host_token', async (roomCode: string, callback) => {
    if (!checkRateLimit()) return;

    try {
      const authToken = (socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '')) as string | undefined;
      if (!authToken) {
        callback({ success: false, error: 'Authentication required' });
        return;
      }

      const authUser = await verifyAuthToken(authToken);
      if (!authUser) {
        callback({ success: false, error: 'Invalid authentication token' });
        return;
      }

      const result = await roomEngine.regenerateHostToken(roomCode, authUser.userId);
      callback(result);
    } catch (error: any) {
      console.error('[Host] Regenerate host token error:', error);
      callback({ success: false, error: error.message || 'Failed to regenerate token' });
    }
  });

  // ========================================================================
  // GAME MANAGEMENT (HOST ONLY)
  // ========================================================================

  socket.on('start_game', async (gameType: GameType, settings?: any) => {
    if (!checkRateLimit()) return;

    const roomInfo = roomEngine.getRoomBySocketId(socket.id);
    if (!roomInfo || !roomInfo.isHost) {
      socket.emit('error', 'Only host can start games');
      return;
    }
    const room = roomInfo.room;

    // Save settings to database if provided
    if (settings && supabase) {
      try {
        const { error } = await supabase.from('game_settings').upsert(
          {
            room_code: room.code,
            game_type: gameType,
            settings: settings,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'room_code,game_type',
          }
        );

        if (error) {
          console.error(
            `[Host] Failed to save settings for ${gameType} in room ${room.code}:`,
            error
          );
        }
      } catch (error: any) {
        console.error(`[Host] Error saving settings:`, error);
      }
    }

    console.log(`[Host] Attempting to start ${gameType} in room ${room.code}`);
    const game = await roomEngine.startGame(room.code, gameType, settings);
    if (!game) {
      socket.emit('error', 'Failed to start game');
      return;
    }

    const gameState = game.getState();
    console.log(`[Host] Game created successfully: ${gameType} in room ${room.code}`);

    io.to(room.code).emit('game_started', gameType);

    // Broadcast game state
    broadcastGameState(room.code);

    // Additional broadcasts after state transitions
    setTimeout(() => {
      broadcastGameState(room.code);
    }, 4000);

    setTimeout(() => {
      const currentGame = roomEngine.getGame(room.code);
      if (currentGame && currentGame.getState().state === GameState.PLAYING) {
        const state = currentGame.getState();
        if ((state as any).currentQuestion || (state as any).currentItem || (state as any).currentPrompt) {
          broadcastGameState(room.code);
        }
      }
    }, 5000);

    console.log(`[Host] Started ${gameType} in room ${room.code}`);
  });

  socket.on('end_game', async () => {
    if (!checkRateLimit()) return;

    const roomInfo = roomEngine.getRoomBySocketId(socket.id);
    if (!roomInfo || !roomInfo.isHost) {
      socket.emit('error', 'Only host can end games');
      return;
    }
    const room = roomInfo.room;

    const game = roomEngine.getGame(room.code);
    let scoreboard: Array<{ playerId: string; name: string; score: number }> = [];
    let gameType: GameType | null = null;

    if (game) {
      scoreboard = game.getScoreboard();
      gameType = game.getState().gameType;

      // End the game
      game.end();

      // Save to leaderboard and check achievements
      await roomEngine.saveLeaderboard(room.code, gameType, scoreboard, achievementManager, io);

      // Broadcast final game state
      room.players.forEach((player) => {
        const playerSocket = io.sockets.sockets.get(player.id);
        if (playerSocket) {
          const finalState = game.getClientState(player.id);
          finalState.state = GameState.GAME_END;
          finalState.scoreboard = scoreboard;
          playerSocket.emit('game_state_update', finalState);
        }
      });

      io.to(room.code).emit('game_ended', { scoreboard, gameType });

      // Destroy the game
      roomEngine.endGame(room.code);
    } else {
      roomEngine.endGame(room.code);
      io.to(room.code).emit('game_ended', { scoreboard, gameType });
    }

    console.log(`[Host] Ended game in room ${room.code}`);
  });

  socket.on('pause_game', () => {
    if (!checkRateLimit()) return;

    const roomInfo = roomEngine.getRoomBySocketId(socket.id);
    if (!roomInfo || !roomInfo.isHost) return;
    const room = roomInfo.room;

    roomEngine.pauseGame(room.code);
    io.to(room.code).emit('game_state_update', { state: 'paused' });
    broadcastGameState(room.code);
  });

  socket.on('resume_game', () => {
    if (!checkRateLimit()) return;

    const roomInfo = roomEngine.getRoomBySocketId(socket.id);
    if (!roomInfo || !roomInfo.isHost) return;
    const room = roomInfo.room;

    roomEngine.resumeGame(room.code);
    io.to(room.code).emit('game_state_update', { state: 'playing' });
    broadcastGameState(room.code);
  });

  socket.on('kick_player', (targetPlayerId: string, callback) => {
    if (!checkRateLimit()) return;

    const roomInfo = roomEngine.getRoomBySocketId(socket.id);
    if (!roomInfo || !roomInfo.isHost) {
      callback({ success: false, error: 'Only host can kick players' });
      return;
    }
    const room = roomInfo.room;

    if (targetPlayerId === room.hostId) {
      callback({ success: false, error: 'Cannot kick the host' });
      return;
    }

    if (!room.players.has(targetPlayerId)) {
      callback({ success: false, error: 'Player not found in room' });
      return;
    }

    const player = room.players.get(targetPlayerId);
    room.players.delete(targetPlayerId);
    roomEngine.leaveRoom(targetPlayerId, false);

    io.to(targetPlayerId).emit('kicked_from_room', { reason: 'You were removed by the host' });

    io.to(room.code).emit('player_left', { playerId: targetPlayerId, player });

    io.to(room.code).emit('room_update', {
      players: Array.from(room.players.values()),
      playerCount: room.players.size,
    });

    callback({ success: true, message: `Player ${player?.name} was removed` });
    console.log(`[Host] Player ${targetPlayerId} kicked from room ${room.code}`);
  });

  // ========================================================================
  // PRICE IS RIGHT ITEM SETS MANAGEMENT
  // ========================================================================

  socket.on('list_item_sets', async (callback) => {
    if (!checkRateLimit()) return;

    try {
      const authToken = (socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '')) as string | undefined;
      if (!authToken) {
        callback({ success: false, error: 'Authentication required' });
        return;
      }

      const authUser = await verifyAuthToken(authToken);
      if (!authUser) {
        callback({ success: false, error: 'Invalid authentication token' });
        return;
      }

      if (!supabase) {
        callback({ success: false, error: 'Database not available' });
        return;
      }

      const { data: sets, error } = await supabase
        .from('price_item_sets')
        .select('id, name, description, item_count')
        .eq('host_id', authUser.userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[Host] Error listing item sets:', error);
        callback({ success: false, error: error.message });
        return;
      }

      callback({
        success: true,
        sets: sets || [],
      });
    } catch (error: any) {
      console.error('[Host] List item sets error:', error);
      callback({ success: false, error: error.message || 'Failed to list item sets' });
    }
  });

  socket.on('create_item_set', async (name: string, description: string | undefined, callback) => {
    if (!checkRateLimit()) return;

    try {
      const authToken = (socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '')) as string | undefined;
      if (!authToken) {
        callback({ success: false, error: 'Authentication required' });
        return;
      }

      const authUser = await verifyAuthToken(authToken);
      if (!authUser) {
        callback({ success: false, error: 'Invalid authentication token' });
        return;
      }

      if (!supabase) {
        callback({ success: false, error: 'Database not available' });
        return;
      }

      if (!name || !name.trim()) {
        callback({ success: false, error: 'Item set name is required' });
        return;
      }

      // Generate unique ID
      const setId = `set_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

      const { data, error } = await supabase
        .from('price_item_sets')
        .insert({
          id: setId,
          name: name.trim(),
          description: description?.trim() || null,
          host_id: authUser.userId,
          item_count: 0,
        })
        .select('id, name, description, item_count')
        .single();

      if (error) {
        console.error('[Host] Error creating item set:', error);
        callback({ success: false, error: error.message });
        return;
      }

      callback({
        success: true,
        set: data,
      });
    } catch (error: any) {
      console.error('[Host] Create item set error:', error);
      callback({ success: false, error: error.message || 'Failed to create item set' });
    }
  });

  socket.on('get_items_for_set', async (setId: string, callback) => {
    if (!checkRateLimit()) return;

    try {
      const authToken = (socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '')) as string | undefined;
      if (!authToken) {
        callback({ success: false, error: 'Authentication required' });
        return;
      }

      const authUser = await verifyAuthToken(authToken);
      if (!authUser) {
        callback({ success: false, error: 'Invalid authentication token' });
        return;
      }

      if (!supabase) {
        callback({ success: false, error: 'Database not available' });
        return;
      }

      // Verify set belongs to user
      const { data: setData, error: setError } = await supabase
        .from('price_item_sets')
        .select('id, host_id')
        .eq('id', setId)
        .single();

      if (setError || !setData || setData.host_id !== authUser.userId) {
        callback({ success: false, error: 'Item set not found or access denied' });
        return;
      }

      const { data: items, error } = await supabase
        .from('price_items')
        .select('id, name, description, price, image_url, category, translations')
        .eq('set_id', setId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[Host] Error loading items:', error);
        callback({ success: false, error: error.message });
        return;
      }

      // Convert snake_case to camelCase for frontend
      const formattedItems = (items || []).map((item: any) => ({
        id: item.id,
        name: item.name,
        description: item.description || '',
        price: parseFloat(item.price),
        imageUrl: item.image_url,
        category: item.category || '',
        translations: item.translations,
      }));

      callback({
        success: true,
        items: formattedItems,
      });
    } catch (error: any) {
      console.error('[Host] Get items for set error:', error);
      callback({ success: false, error: error.message || 'Failed to load items' });
    }
  });

  socket.on('add_item_to_set', async (setId: string, itemData: any, callback) => {
    if (!checkRateLimit()) return;

    try {
      const authToken = (socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '')) as string | undefined;
      if (!authToken) {
        callback({ success: false, error: 'Authentication required' });
        return;
      }

      const authUser = await verifyAuthToken(authToken);
      if (!authUser) {
        callback({ success: false, error: 'Invalid authentication token' });
        return;
      }

      if (!supabase) {
        callback({ success: false, error: 'Database not available' });
        return;
      }

      // Verify set belongs to user
      const { data: setData, error: setError } = await supabase
        .from('price_item_sets')
        .select('id, host_id')
        .eq('id', setId)
        .single();

      if (setError || !setData || setData.host_id !== authUser.userId) {
        callback({ success: false, error: 'Item set not found or access denied' });
        return;
      }

      const translations = itemData.translations || {};
      const enName = translations.en?.name || itemData.name;
      const enDescription = translations.en?.description || itemData.description || '';

      if (!enName || !itemData.imageUrl || !itemData.price || itemData.price <= 0) {
        callback({ success: false, error: 'Name, image, and valid price are required' });
        return;
      }

      const { data, error } = await supabase
        .from('price_items')
        .insert({
          set_id: setId,
          name: enName.trim(),
          description: enDescription.trim() || null,
          price: parseFloat(itemData.price),
          image_url: itemData.imageUrl.trim(),
          category: itemData.category?.trim() || null,
          translations: translations || null,
        })
        .select('id, name, description, price, image_url, category, translations')
        .single();

      if (error) {
        console.error('[Host] Error adding item:', error);
        callback({ success: false, error: error.message });
        return;
      }

      // Convert snake_case to camelCase for frontend
      const formattedItem = {
        id: data.id,
        name: data.name,
        description: data.description || '',
        price: parseFloat(data.price),
        imageUrl: data.image_url,
        category: data.category || '',
        translations: data.translations,
      };

      callback({
        success: true,
        item: formattedItem,
      });
    } catch (error: any) {
      console.error('[Host] Add item to set error:', error);
      callback({ success: false, error: error.message || 'Failed to add item' });
    }
  });

  socket.on('delete_item', async (itemId: string, callback) => {
    if (!checkRateLimit()) return;

    try {
      const authToken = (socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '')) as string | undefined;
      if (!authToken) {
        callback({ success: false, error: 'Authentication required' });
        return;
      }

      const authUser = await verifyAuthToken(authToken);
      if (!authUser) {
        callback({ success: false, error: 'Invalid authentication token' });
        return;
      }

      if (!supabase) {
        callback({ success: false, error: 'Database not available' });
        return;
      }

      // Verify item belongs to user's set
      const { data: itemData, error: itemError } = await supabase
        .from('price_items')
        .select('set_id, price_item_sets!inner(host_id)')
        .eq('id', itemId)
        .single();

      if (itemError || !itemData || (itemData.price_item_sets as any).host_id !== authUser.userId) {
        callback({ success: false, error: 'Item not found or access denied' });
        return;
      }

      const { error } = await supabase.from('price_items').delete().eq('id', itemId);

      if (error) {
        console.error('[Host] Error deleting item:', error);
        callback({ success: false, error: error.message });
        return;
      }

      callback({ success: true });
    } catch (error: any) {
      console.error('[Host] Delete item error:', error);
      callback({ success: false, error: error.message || 'Failed to delete item' });
    }
  });

  socket.on('delete_item_set', async (setId: string, callback) => {
    if (!checkRateLimit()) return;

    try {
      const authToken = (socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '')) as string | undefined;
      if (!authToken) {
        callback({ success: false, error: 'Authentication required' });
        return;
      }

      const authUser = await verifyAuthToken(authToken);
      if (!authUser) {
        callback({ success: false, error: 'Invalid authentication token' });
        return;
      }

      if (!supabase) {
        callback({ success: false, error: 'Database not available' });
        return;
      }

      // Verify set belongs to user
      const { data: setData, error: setError } = await supabase
        .from('price_item_sets')
        .select('id, host_id')
        .eq('id', setId)
        .single();

      if (setError || !setData || setData.host_id !== authUser.userId) {
        callback({ success: false, error: 'Item set not found or access denied' });
        return;
      }

      // Delete all items in the set first (due to foreign key constraint)
      const { error: itemsError } = await supabase.from('price_items').delete().eq('set_id', setId);

      if (itemsError) {
        console.error('[Host] Error deleting items:', itemsError);
        callback({ success: false, error: itemsError.message });
        return;
      }

      // Delete the set
      const { error } = await supabase.from('price_item_sets').delete().eq('id', setId);

      if (error) {
        console.error('[Host] Error deleting item set:', error);
        callback({ success: false, error: error.message });
        return;
      }

      callback({ success: true });
    } catch (error: any) {
      console.error('[Host] Delete item set error:', error);
      callback({ success: false, error: error.message || 'Failed to delete item set' });
    }
  });

  socket.on('set_room_item_set', async (roomCode: string, setId: string | null, callback) => {
    if (!checkRateLimit()) return;

    try {
      const authToken = (socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '')) as string | undefined;
      if (!authToken) {
        callback({ success: false, error: 'Authentication required' });
        return;
      }

      const authUser = await verifyAuthToken(authToken);
      if (!authUser) {
        callback({ success: false, error: 'Invalid authentication token' });
        return;
      }

      const roomInfo = roomEngine.getRoomBySocketId(socket.id);
      if (!roomInfo || !roomInfo.isHost || roomInfo.room.code !== roomCode) {
        callback({ success: false, error: 'Only host can set room item set' });
        return;
      }

      if (!supabase) {
        callback({ success: false, error: 'Database not available' });
        return;
      }

      // If setId is provided, verify it belongs to user
      if (setId) {
        const { data: setData, error: setError } = await supabase
          .from('price_item_sets')
          .select('id, host_id')
          .eq('id', setId)
          .single();

        if (setError || !setData || setData.host_id !== authUser.userId) {
          callback({ success: false, error: 'Item set not found or access denied' });
          return;
        }
      }

      // Update game settings
      const { error } = await supabase.from('game_settings').upsert(
        {
          room_code: roomCode,
          game_type: GameType.PRICE_IS_RIGHT,
          settings: { customItemSetId: setId },
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'room_code,game_type',
        }
      );

      if (error) {
        console.error('[Host] Error setting room item set:', error);
        callback({ success: false, error: error.message });
        return;
      }

      callback({ success: true });
    } catch (error: any) {
      console.error('[Host] Set room item set error:', error);
      callback({ success: false, error: error.message || 'Failed to set room item set' });
    }
  });

  // ========================================================================
  // ROOM THEME MANAGEMENT
  // ========================================================================

  socket.on('get_room_theme', async (roomCode: string, callback) => {
    if (!checkRateLimit()) return;

    try {
      const authToken = (socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '')) as string | undefined;
      if (!authToken) {
        callback({ success: false, error: 'Authentication required' });
        return;
      }

      const authUser = await verifyAuthToken(authToken);
      if (!authUser) {
        callback({ success: false, error: 'Invalid authentication token' });
        return;
      }

      if (!supabase) {
        callback({ success: false, error: 'Database not available' });
        return;
      }

      // Get room from database
      const { data: roomData, error: roomError } = await supabase
        .from('rooms')
        .select('settings, host_user_id')
        .eq('code', roomCode)
        .single();

      if (roomError || !roomData) {
        callback({ success: false, error: 'Room not found' });
        return;
      }

      // Verify user owns the room
      if (roomData.host_user_id !== authUser.userId) {
        callback({ success: false, error: 'Unauthorized' });
        return;
      }

      // Extract theme from settings
      const settings = roomData.settings || {};
      const theme = settings.theme || {};

      callback({
        success: true,
        theme: {
          snowEffect: theme.snowEffect ?? true,
          backgroundMusic: theme.backgroundMusic ?? theme.soundEnabled ?? true,
          sparkles: theme.sparkles ?? true,
          icicles: theme.icicles ?? false,
          frostPattern: theme.frostPattern ?? true,
          colorScheme: theme.colorScheme ?? 'mixed',
          language: theme.language ?? 'en',
        },
      });
    } catch (error: any) {
      console.error('[Host] Get room theme error:', error);
      callback({ success: false, error: error.message || 'Failed to get room theme' });
    }
  });

  socket.on('update_room_settings', async (roomCodeOrSettings: string | any, settingsOrCallback?: any, callback?: any) => {
    if (!checkRateLimit()) return;

    // Handle both signatures: (settings, callback) and (roomCode, settings, callback)
    let roomCode: string | null = null;
    let settings: any;
    let cb: any;

    if (typeof roomCodeOrSettings === 'string') {
      // New signature: (roomCode, settings, callback)
      roomCode = roomCodeOrSettings;
      settings = settingsOrCallback;
      cb = callback;
    } else {
      // Old signature: (settings, callback) - for backwards compatibility
      settings = roomCodeOrSettings;
      cb = settingsOrCallback;
    }

    // Ensure callback exists
    if (!cb || typeof cb !== 'function') {
      console.error('[Host] update_room_settings: No callback provided');
      return;
    }

    try {
      const authToken = (socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '')) as string | undefined;
      if (!authToken) {
        cb({ success: false, error: 'Authentication required' });
        return;
      }

      const authUser = await verifyAuthToken(authToken);
      if (!authUser) {
        cb({ success: false, error: 'Invalid authentication token' });
        return;
      }

      if (!supabase) {
        cb({ success: false, error: 'Database not available' });
        return;
      }

      // If roomCode not provided, try to get it from connection info or database
      if (!roomCode) {
        const roomInfo = roomEngine.getRoomBySocketId(socket.id);
        if (roomInfo && roomInfo.isHost) {
          roomCode = roomInfo.room.code;
        } else {
          // If room not in memory, try to get it from database by host_user_id
          const { data: roomData } = await supabase
            .from('rooms')
            .select('code')
            .eq('host_user_id', authUser.userId)
            .eq('is_active', true)
            .order('last_accessed_at', { ascending: false })
            .limit(1)
            .single();
          
          if (roomData) {
            roomCode = roomData.code;
          }
        }
      }

      if (!roomCode) {
        cb({ success: false, error: 'Room not found. Please reconnect to your room.' });
        return;
      }

      // Get current room settings
      const { data: roomData, error: roomError } = await supabase
        .from('rooms')
        .select('settings, host_user_id')
        .eq('code', roomCode)
        .single();

      if (roomError || !roomData || roomData.host_user_id !== authUser.userId) {
        cb({ success: false, error: 'Room not found or unauthorized' });
        return;
      }

      const currentSettings = roomData.settings || {};
      const currentTheme = currentSettings.theme || {};

      // Update theme settings if provided
      const themeUpdates: any = {};
      if (settings.backgroundMusic !== undefined) themeUpdates.backgroundMusic = settings.backgroundMusic;
      if (settings.snowEffect !== undefined) themeUpdates.snowEffect = settings.snowEffect;
      if (settings.sparkles !== undefined) themeUpdates.sparkles = settings.sparkles;
      if (settings.icicles !== undefined) themeUpdates.icicles = settings.icicles;
      if (settings.frostPattern !== undefined) themeUpdates.frostPattern = settings.frostPattern;
      if (settings.colorScheme !== undefined) themeUpdates.colorScheme = settings.colorScheme;
      if (settings.language !== undefined) themeUpdates.language = settings.language;

      // Merge theme updates
      const updatedTheme = { ...currentTheme, ...themeUpdates };

      // Update room name and description if provided
      const roomUpdates: any = {};
      if (settings.roomName !== undefined) roomUpdates.room_name = settings.roomName;
      if (settings.description !== undefined) roomUpdates.description = settings.description;

      // Update settings with new theme
      const updatedSettings = {
        ...currentSettings,
        theme: updatedTheme,
      };

      // Update database
      const { error: updateError } = await supabase
        .from('rooms')
        .update({
          ...roomUpdates,
          settings: updatedSettings,
        })
        .eq('code', roomCode);

      if (updateError) {
        console.error('[Host] Error updating room settings:', updateError);
        cb({ success: false, error: updateError.message });
        return;
      }

      // Update in-memory room if it exists
      const roomInfo = roomEngine.getRoomBySocketId(socket.id);
      if (roomInfo && roomInfo.isHost && roomInfo.room.code === roomCode) {
        const room = roomInfo.room;
        room.settings = {
          ...room.settings,
          theme: updatedTheme,
        };
      }

      // Broadcast settings update to room
      io.to(roomCode).emit('room_settings_updated', {
        ...roomUpdates,
        ...themeUpdates,
      });

      cb({ success: true });
    } catch (error: any) {
      console.error('[Host] Update room settings error:', error);
      cb({ success: false, error: error.message || 'Failed to update room settings' });
    }
  });
}

