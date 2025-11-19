import { Server, Socket } from 'socket.io';
import { SupabaseClient } from '@supabase/supabase-js';
import { RoomManager } from '../managers/room-manager.js';
import { AchievementManager } from '../managers/achievement-manager.js';
import { verifyAuthToken } from '../lib/supabase.js';
import { setupGuessingHandlers } from './guessing-handlers.js';
import {
  GameType,
  GameState,
  PlayerStatus,
  Player,
  sanitizePlayerName,
  RateLimiter,
  isExpired,
} from '@christmas/core';

const rateLimiter = new RateLimiter(20, 1000); // 20 requests per second

export function setupSocketHandlers(
  io: Server,
  roomManager: RoomManager,
  supabase: SupabaseClient | null,
  achievementManager?: AchievementManager
) {
  // Guard to ensure finalization happens exactly once per room
  const finalizedRooms = new Set<string>();

  // Track last game state per room to detect transitions for sound events
  const lastGameState = new Map<string, GameState>();

  // Track last sound event per room to prevent duplicates
  const lastSoundEvent = new Map<string, { sound: string; state: GameState; timestamp: number }>();
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

          console.log('[Room] Verifying auth token for room creation...');
          console.log(
            '[Room] Token received (first 30 chars):',
            authToken.substring(0, 30) + '...'
          );
          console.log('[Room] Token length:', authToken.length);

          // Verify auth token
          const authUser = await verifyAuthToken(authToken);
          if (!authUser) {
            console.error('[Room] Token verification failed for socket:', socket.id);
            console.error('[Room] This usually means:');
            console.error('[Room] 1. Token is expired or invalid');
            console.error('[Room] 2. User needs to sign in again after email confirmation');
            console.error('[Room] 3. Supabase credentials are misconfigured');
            callback({
              success: false,
              error:
                'Invalid or expired authentication token. Please sign in again. After confirming your email, you need to sign in with your email and password.',
            });
            return;
          }
          console.log('[Room] Token verified successfully for user:', authUser.email);

          if (!playerName || typeof playerName !== 'string') {
            callback({ success: false, error: 'Player name is required' });
            return;
          }
          const sanitizedName = sanitizePlayerName(playerName);

          // Use createOrGetRoom to reuse existing room if host already has one
          const room = await roomManager.createOrGetRoom(socket.id, sanitizedName, authUser.userId);

          console.log(
            `[Room] ${room.code} - ${room.code === roomManager.getRoomByHost(socket.id)?.code ? 'Existing room reused' : 'New room created'}`
          );

          // Store user_id with room for tracking (also stored in database now)
          (room as any).hostUserId = authUser.userId;

          // Ensure socket joins the room
          const roomsBefore = Array.from(socket.rooms);
          socket.join(room.code);
          const roomsAfter = Array.from(socket.rooms);
          console.log(
            `[Room] Socket ${socket.id} joined room ${room.code}, rooms before: ${roomsBefore.join(', ')}, after: ${roomsAfter.join(', ')}`
          );

          // Update last accessed timestamp (room was just created, so it's being accessed)
          await roomManager.updateLastAccessed(room.code);

          // Host is NOT in players list - return host info separately
          const hostToken = roomManager.getHostToken(room.code);
          callback({
            success: true,
            roomCode: room.code,
            isHost: true,
            hostName: sanitizedName,
            hostToken,
          });

          // Emit initial room_update to sync state (empty players list initially)
          socket.emit('room_update', {
            players: Array.from(room.players.values()),
            playerCount: room.players.size,
          });

          console.log(
            `[Room] Created: ${room.code} by ${sanitizedName} (host, user: ${authUser.userId})`
          );
        } catch (error) {
          console.error('[Room] Create error:', error);
          callback({ success: false, error: 'Failed to create room' });
        }
      }
    );

    socket.on(
      'join_room',
      async (
        code: string,
        playerName: string,
        preferredAvatarOrLanguageOrCallback?: string | Function,
        languageOrCallback?: 'en' | 'fr' | Function,
        callbackOrUndefined?: Function
      ) => {
        if (!checkRateLimit()) return;

        // Handle backward compatibility with multiple signatures
        let preferredAvatar: string | undefined;
        let language: 'en' | 'fr' = 'en';
        let callback: Function;

        if (typeof preferredAvatarOrLanguageOrCallback === 'function') {
          // Old signature: (code, playerName, callback)
          callback = preferredAvatarOrLanguageOrCallback;
          preferredAvatar = undefined;
          language = 'en';
        } else if (typeof languageOrCallback === 'function') {
          // Signature: (code, playerName, preferredAvatar, callback)
          preferredAvatar = preferredAvatarOrLanguageOrCallback;
          callback = languageOrCallback;
          language = 'en';
        } else {
          // New signature: (code, playerName, preferredAvatar?, language?, callback)
          preferredAvatar = preferredAvatarOrLanguageOrCallback;
          language = (languageOrCallback as 'en' | 'fr') || 'en';
          callback = callbackOrUndefined || (() => {});
        }

        try {
          if (!code || typeof code !== 'string' || !playerName || typeof playerName !== 'string') {
            callback({ success: false, error: 'Room code and player name are required' });
            return;
          }
          const sanitizedName = sanitizePlayerName(playerName);
          const codeNormalized = code.toUpperCase();

          console.log(
            `[Room] join_room called: code=${codeNormalized}, playerName=${sanitizedName}, socketId=${socket.id}`
          );

          const result = await roomManager.joinRoom(
            codeNormalized,
            socket.id,
            sanitizedName,
            preferredAvatar,
            language
          );

          if (!result.success) {
            console.error(`[Room] ❌ Failed to join room ${codeNormalized}:`, result.error);
            callback(result);
            return;
          }

          console.log(
            `[Room] ✅ Player ${sanitizedName} (${socket.id.substring(0, 8)}) successfully joined room ${codeNormalized}`
          );

          // Join the socket to the room
          const roomsBefore = Array.from(socket.rooms);
          socket.join(codeNormalized);
          const roomsAfter = Array.from(socket.rooms);
          console.log(
            `[Room] Socket ${socket.id.substring(0, 8)} rooms before: ${roomsBefore.join(', ')}, after: ${roomsAfter.join(', ')}`
          );

          // Update last accessed timestamp
          await roomManager.updateLastAccessed(codeNormalized);

          // Notify room of new player (to other sockets)
          socket.to(codeNormalized).emit('player_joined', result.player);

          // Broadcast authoritative players list to ALL sockets in room (including the new player)
          const playersList = Array.from(result.room?.players.values() || []);
          console.log(
            `[Room] Broadcasting room_update to room ${codeNormalized} with ${playersList.length} player(s)`
          );
          console.log(
            `[Room] Players in broadcast:`,
            playersList.map((p) => ({ id: p.id.substring(0, 8), name: p.name }))
          );
          const socketsInRoom = Array.from(io.sockets.adapter.rooms.get(codeNormalized) || []);
          console.log(
            `[Room] Sockets in room ${codeNormalized}:`,
            socketsInRoom.map((s) => s.substring(0, 8))
          );
          io.to(codeNormalized).emit('room_update', {
            players: playersList,
            playerCount: result.room?.players.size || 0,
          });

          // Issue player token for reconnection
          const playerToken = roomManager.issuePlayerToken(
            codeNormalized,
            socket.id,
            sanitizedName
          );

          callback({
            success: true,
            player: result.player,
            isHost: result.room?.hostId === socket.id,
            players: Array.from(result.room?.players.values() || []),
            roomName: result.room?.settings?.roomName,
            playerToken,
          });

          console.log(`[Room] ${sanitizedName} joined ${codeNormalized}`);
        } catch (error) {
          console.error('[Room] Join error:', error);
          callback({ success: false, error: 'Failed to join room' });
        }
      }
    );

    socket.on('leave_room', () => {
      // Explicit leave - remove player completely
      handlePlayerLeave(socket, false);
    });

    socket.on(
      'reconnect_player',
      async (
        roomCode: string,
        playerToken: string,
        language: 'en' | 'fr' | undefined,
        callback
      ) => {
        if (!checkRateLimit()) return;

        try {
          // Normalize room code
          const codeNormalized = roomCode.toUpperCase().trim();

          // Try to get room from memory first
          let room = roomManager.getRoom(codeNormalized);

          // If room not in memory, try loading from database (like join_room does)
          if (!room) {
            const loaded = await roomManager.loadRoomFromDatabase(codeNormalized);
            if (loaded) {
              // Restore room to memory (adds to rooms map and sets up host tokens)
              roomManager.restoreRoomToMemory(loaded.room, loaded.hostToken);
              room = loaded.room;
              console.log(`[Room] Restored room ${codeNormalized} from database for reconnection`);
            } else {
              callback({ success: false, error: 'Room not found' });
              return;
            }
          }

          // Replace player socket using token
          const reconnected = roomManager.replacePlayerSocketWithToken(
            codeNormalized,
            playerToken,
            socket.id,
            language
          );
          if (!reconnected) {
            callback({ success: false, error: 'Invalid token or player not found' });
            return;
          }

          // Restore session score
          const info = roomManager.getPlayerInfoByToken(playerToken);
          const restoredScore = await roomManager.restoreSessionScore(
            codeNormalized,
            info?.name || ''
          );
          // Always update player's score if restoredScore is valid (including 0)
          if (restoredScore !== undefined && restoredScore >= 0) {
            // Update player's current score to match session score
            reconnected.score = restoredScore;
          }

          socket.join(codeNormalized);

          // Broadcast player reconnected
          io.to(codeNormalized).emit('player_reconnected', {
            newPlayerId: socket.id,
            player: reconnected,
          });
          // Broadcast authoritative players list
          io.to(codeNormalized).emit('room_update', {
            players: Array.from(room.players.values()),
            playerCount: room.players.size,
          });

          // Always send game state - either from active game or LOBBY state
          const game = roomManager.getGame(codeNormalized);
          let clientState: any;

          if (game) {
            // Game is running - restore player's score in the game and get client state
            if (restoredScore !== undefined && restoredScore >= 0) {
              roomManager.restorePlayerScoreInGame(codeNormalized, socket.id, info?.name || '');
            }

            // Get client state (this will include hasAnswered/hasGuessed/hasVoted/hasPicked based on migrated data)
            clientState = game.getClientState(socket.id);

            console.log(
              `[Room] Sent game state to reconnected player ${socket.id.substring(0, 8)}: state=${clientState?.state}, hasAnswered=${clientState?.hasAnswered || clientState?.hasGuessed || clientState?.hasVoted || clientState?.hasPicked || false}`
            );

            // Also broadcast to room that player reconnected
            io.to(codeNormalized).emit('player_reconnected', {
              playerId: socket.id,
              playerName: info?.name || '',
              restoredScore: restoredScore,
            });
          } else {
            // No active game - send LOBBY state with player's restored score
            clientState = {
              state: room.gameState || GameState.LOBBY,
              gameType: room.currentGame || null,
              round: 0,
              maxRounds: 0,
              scores: {
                [socket.id]:
                  restoredScore !== undefined && restoredScore >= 0
                    ? restoredScore
                    : reconnected.score || 0,
              },
              scoreboard: [],
              players: Array.from(room.players.values()).map((p) => ({
                id: p.id,
                name: p.name,
                score: p.score || 0,
                avatar: p.avatar,
                status: p.status,
              })),
            };

            console.log(
              `[Room] Sent LOBBY state to reconnected player ${socket.id.substring(0, 8)}: state=${clientState.state}, score=${clientState.scores[socket.id]}`
            );
          }

          // Always send game state update to reconnecting player
          socket.emit('game_state_update', clientState);

          callback({
            success: true,
            player: reconnected,
            restoredScore,
            room: {
              code: room.code,
              players: Array.from(room.players.values()),
              currentGame: room.currentGame,
              gameState: room.gameState,
            },
          });

          console.log(
            `[Room] token player reconnected to ${codeNormalized} with score ${restoredScore}`
          );
        } catch (error) {
          console.error('[Room] Reconnect error:', error);
          callback({ success: false, error: 'Failed to reconnect' });
        }
      }
    );

    // Get user's single room (one-room-per-host)
    socket.on('get_my_room', async (callback) => {
      if (!checkRateLimit()) return;

      try {
        // Require authentication
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

        // Get user's single room
        const room = await roomManager.getRoomByHostUserId(authUser.userId);

        if (room) {
          const hostToken = roomManager.getHostToken(room.code);
          callback({
            success: true,
            room: {
              code: room.code,
              roomName: (room as any).roomName || null,
              description: (room as any).description || null,
              playerCount: room.players.size,
              isActive: !isExpired(room.expiresAt),
              hostToken,
            },
          });
        } else {
          callback({ success: true, room: null });
        }
      } catch (error: any) {
        console.error('[Room] get_my_room error:', error);
        callback({ success: false, error: error.message || 'Failed to get room', room: null });
      }
    });

    socket.on(
      'reconnect_host',
      async (roomCode: string, hostToken: string, language: 'en' | 'fr' | undefined, callback) => {
        if (!checkRateLimit()) {
          if (typeof callback === 'function') {
            callback({ success: false, error: 'Rate limit exceeded' });
          }
          return;
        }

        // Handle case where callback might not be provided
        const safeCallback = typeof callback === 'function' ? callback : () => {};

        try {
          console.log(`[Room] reconnect_host called for room ${roomCode} by socket ${socket.id}`);

          // Normalize room code to uppercase for consistency
          const codeNormalized = roomCode.toUpperCase();
          let mappedRoom = roomManager.getRoomCodeByHostToken(hostToken);
          let room = roomManager.getRoom(codeNormalized);

          console.log(
            `[Room] Initial state: mappedRoom=${mappedRoom}, room exists=${!!room}, codeNormalized=${codeNormalized}`
          );

          // If token not in memory, try to get from database
          if (!mappedRoom || mappedRoom !== codeNormalized) {
            console.log(`[Room] Token not in memory or mismatch, checking database...`);
            // Try to get auth token from socket handshake or request
            const authToken = (socket.handshake.auth?.token ||
              socket.handshake.headers?.authorization?.replace('Bearer ', '')) as
              | string
              | undefined;
            if (authToken && supabase) {
              try {
                const authUser = await verifyAuthToken(authToken);
                if (authUser) {
                  console.log(`[Room] Auth user verified: ${authUser.userId}`);
                  // Try to get token from database (use normalized code)
                  const dbToken = await roomManager.getHostTokenFromDatabase(
                    codeNormalized,
                    authUser.userId
                  );
                  console.log(
                    `[Room] Database token check: dbToken exists=${!!dbToken}, matches=${dbToken === hostToken}`
                  );
                  if (dbToken && dbToken === hostToken) {
                    mappedRoom = codeNormalized;
                    // Try to load room from database if not in memory
                    if (!room) {
                      console.log(`[Room] Loading room from database...`);
                      const loaded = await roomManager.loadRoomFromDatabase(codeNormalized);
                      if (loaded) {
                        roomManager.restoreRoomToMemory(loaded.room, loaded.hostToken);
                        room = loaded.room;
                        console.log(`[Room] ✅ Room loaded from database: ${room.code}`);
                      }
                    }
                  }
                }
              } catch (e) {
                console.error('[Room] Error checking database for host token:', e);
              }
            } else {
              console.log(`[Room] No auth token available for database check`);
            }
          }

          if (!mappedRoom || mappedRoom !== codeNormalized) {
            console.error(
              `[Room] ❌ Invalid host token: mappedRoom=${mappedRoom}, expected=${codeNormalized}`
            );
            safeCallback({ success: false, error: 'Invalid host token' });
            return;
          }

          if (!room) {
            console.log(`[Room] Room not in memory, attempting to load from database...`);
            // Try loading from database one more time (use normalized code)
            const loaded = await roomManager.loadRoomFromDatabase(codeNormalized);
            if (loaded) {
              roomManager.restoreRoomToMemory(loaded.room, loaded.hostToken);
              room = loaded.room;
              console.log(`[Room] ✅ Room loaded from database: ${room.code}`);
            } else {
              console.error(`[Room] ❌ Room not found in database: ${codeNormalized}`);
              safeCallback({ success: false, error: 'Room not found' });
              return;
            }
          }

          // Update host socket id and join the room (use normalized code)
          console.log(`[Room] Updating host socket: ${codeNormalized} -> socket ${socket.id}`);
          roomManager.updateHostSocket(codeNormalized, socket.id);

          // Ensure socket joins the room
          const roomsBefore = Array.from(socket.rooms);
          socket.join(codeNormalized);
          const roomsAfter = Array.from(socket.rooms);
          console.log(
            `[Room] Socket rooms before: ${roomsBefore.join(', ')}, after: ${roomsAfter.join(', ')}`
          );

          // Update last accessed timestamp
          await roomManager.updateLastAccessed(codeNormalized);

          safeCallback({
            success: true,
            room: {
              code: room.code,
              players: Array.from(room.players.values()),
              currentGame: room.currentGame,
              gameState: room.gameState,
            },
          });
          console.log(
            `[Room] ✅ Host reconnected to ${codeNormalized}, socket ${socket.id} joined room, ${room.players.size} player(s)`
          );

          // Broadcast authoritative players list to all sockets in the room
          const playersList = Array.from(room.players.values());
          console.log(
            `[Room] Broadcasting room_update after host reconnect to room ${codeNormalized} with ${playersList.length} player(s)`
          );
          console.log(
            `[Room] Players in broadcast:`,
            playersList.map((p) => ({ id: p.id.substring(0, 8), name: p.name }))
          );
          console.log(
            `[Room] Sockets in room:`,
            Array.from(io.sockets.adapter.rooms.get(codeNormalized) || [])
          );
          io.to(codeNormalized).emit('room_update', {
            players: playersList,
            playerCount: room.players.size,
          });
          console.log(
            `[Room] Emitted room_update to room ${codeNormalized} with ${room.players.size} player(s)`
          );
        } catch (e) {
          console.error('[Room] ❌ Reconnect host error:', e);
          safeCallback({ success: false, error: 'Failed to reconnect host' });
        }
      }
    );

    // ========================================================================
    // ROOM MANAGEMENT (HOST ONLY)
    // ========================================================================

    // REMOVED: list_my_rooms - replaced with get_my_room (one-room-per-host)

    socket.on('get_room_details', async (roomCode: string, callback) => {
      if (!checkRateLimit()) return;

      try {
        // Require authentication
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

        // Get room from database
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

        // Get players from in-memory room if it exists
        const inMemoryRoom = roomManager.getRoom(roomCode);
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
        console.error('[Room] Get room details error:', error);
        callback({ success: false, error: error.message || 'Failed to get room details' });
      }
    });

    socket.on('get_room_players', async (roomCode: string, callback) => {
      if (!checkRateLimit()) return;

      try {
        // Normalize room code to uppercase for consistency
        const codeNormalized = roomCode.toUpperCase().trim();

        // Require authentication
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

        // Verify room ownership (use normalized code)
        if (!supabase) {
          callback({ success: false, error: 'Database not available', players: [] });
          return;
        }

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

        // Get players from in-memory room (use normalized code)
        const room = roomManager.getRoom(codeNormalized);
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
        console.error('[Room] Get room players error:', error);
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
          // Require authentication and verify ownership
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

          // Verify user owns the room
          if (!supabase) {
            callback({ success: false, error: 'Database not available' });
            return;
          }

          const { data } = await supabase
            .from('rooms')
            .select('host_user_id')
            .eq('code', roomCode)
            .single();

          if (!data || data.host_user_id !== authUser.userId) {
            callback({ success: false, error: 'Unauthorized' });
            return;
          }

          const success = await roomManager.updateRoomSettings(roomCode, settings);
          if (success) {
            callback({ success: true });
          } else {
            callback({ success: false, error: 'Failed to update room settings' });
          }
        } catch (error: any) {
          console.error('[Room] Update room error:', error);
          callback({ success: false, error: error.message || 'Failed to update room' });
        }
      }
    );

    socket.on('delete_room', async (roomCode: string, callback) => {
      if (!checkRateLimit()) return;

      try {
        // Require authentication
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

        const success = await roomManager.deactivateRoom(roomCode, authUser.userId);
        if (success) {
          // Notify all players in the room
          io.to(roomCode).emit('room_deleted', { reason: 'Host deleted the room' });
          callback({ success: true });
        } else {
          callback({ success: false, error: 'Failed to delete room or unauthorized' });
        }
      } catch (error: any) {
        console.error('[Room] Delete room error:', error);
        callback({ success: false, error: error.message || 'Failed to delete room' });
      }
    });

    socket.on('reactivate_room', async (roomCode: string, callback) => {
      if (!checkRateLimit()) return;

      try {
        // Require authentication
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

        const result = await roomManager.reactivateRoom(roomCode, authUser.userId);
        callback(result);
      } catch (error: any) {
        console.error('[Room] Reactivate room error:', error);
        callback({ success: false, error: error.message || 'Failed to reactivate room' });
      }
    });

    socket.on('regenerate_host_token', async (roomCode: string, callback) => {
      if (!checkRateLimit()) return;

      try {
        // Require authentication
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

        const result = await roomManager.regenerateHostToken(roomCode, authUser.userId);
        callback(result);
      } catch (error: any) {
        console.error('[Room] Regenerate host token error:', error);
        callback({ success: false, error: error.message || 'Failed to regenerate token' });
      }
    });

    // ========================================================================
    // GAME MANAGEMENT (HOST ONLY)
    // ========================================================================

    socket.on('start_game', async (gameType: GameType, settings?: any) => {
      if (!checkRateLimit()) return;

      const roomInfo = roomManager.getRoomBySocketId(socket.id);
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
              `[Game] Failed to save settings for ${gameType} in room ${room.code}:`,
              error
            );
          } else {
            console.log(`[Game] Saved settings for ${gameType} in room ${room.code}`);
          }
        } catch (error: any) {
          console.error(`[Game] Error saving settings:`, error);
        }
      }

      console.log(
        `[Game] Attempting to start ${gameType} in room ${room.code} with settings:`,
        settings
      );
      const game = await roomManager.startGame(room.code, gameType, settings);
      if (!game) {
        console.error(
          `[Game] Failed to start ${gameType} in room ${room.code} - startGame returned null`
        );
        socket.emit('error', 'Failed to start game');
        return;
      }

      const gameState = game.getState();
      console.log(`[Game] Game created successfully: ${gameType} in room ${room.code}`, {
        state: gameState.state,
        round: gameState.round,
        maxRounds: gameState.maxRounds,
        hasItem: !!(gameState as any).currentItem,
        hasPrompt: !!(gameState as any).currentPrompt,
        hostSocket: room.hostId?.substring(0, 8),
      });

      io.to(room.code).emit('game_started', gameType);

      // Immediately broadcast game state to ensure host and players receive STARTING state
      broadcastGameState(room.code);

      // Also send directly to the host socket as a backup (in case host isn't in room socket.io room)
      const hostSocket = io.sockets.sockets.get(room.hostId);
      if (hostSocket && room.hostId) {
        const game = roomManager.getGame(room.code);
        if (game) {
          const firstPlayerId =
            room.players.size > 0 ? room.players.keys().next().value : room.hostId;
          if (firstPlayerId) {
            const hostState = game.getClientState(firstPlayerId);
            hostSocket.emit('game_state_update', hostState);
            console.log(
              `[Game] Directly sent game_state_update to host ${room.hostId.substring(0, 8)} for immediate reaction, state: ${hostState?.state}`
            );
          }
        }
      } else {
        console.warn(
          `[Game] Host socket ${room.hostId?.substring(0, 8) || 'unknown'} not found when starting game`
        );
      }

      // Broadcast again after game transitions to PLAYING (after 3 second countdown)
      // This ensures host and players get game content (currentQuestion, etc.) immediately
      // We use 4000ms to give extra time for onPlaying() and startNextQuestion() to complete
      setTimeout(() => {
        const game = roomManager.getGame(room.code);
        if (game) {
          const state = game.getState();
          console.log(
            `[Game] Broadcasting after PLAYING transition - state: ${state.state}, hasQuestion: ${!!(state as any).currentQuestion}, round: ${state.round}`
          );
        }
        broadcastGameState(room.code);
        console.log(
          `[Game] Broadcasted game state after transition to PLAYING for ${gameType} in room ${room.code}`
        );
      }, 4000); // 4 seconds to ensure PLAYING state, onPlaying(), and startNextQuestion() have completed

      // Additional broadcast after 5 seconds as a safety net to ensure question is definitely sent
      // This helps catch any edge cases where the first broadcast might have timing issues
      setTimeout(() => {
        const game = roomManager.getGame(room.code);
        if (game) {
          const state = game.getState();
          if (state.state === GameState.PLAYING) {
            const hasQuestion = !!(state as any).currentQuestion;
            const hasItem = !!(state as any).currentItem;
            const hasPrompt = !!(state as any).currentPrompt;
            console.log(
              `[Game] Safety broadcast - state: ${state.state}, hasQuestion: ${hasQuestion}, hasItem: ${hasItem}, hasPrompt: ${hasPrompt}, round: ${state.round}`
            );
            if (hasQuestion || hasItem || hasPrompt) {
              broadcastGameState(room.code);
              console.log(`[Game] Safety broadcast sent for ${gameType} in room ${room.code}`);
            }
          }
        }
      }, 5000); // 5 seconds as a safety net

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
        saveLeaderboard(
          room.code,
          gameType,
          scoreboard,
          supabase,
          roomManager,
          achievementManager,
          io
        );

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
        if (!finalizedRooms.has(room.code)) {
          finalizedRooms.add(room.code);
          io.to(room.code).emit('game_ended', { scoreboard, gameType });
        }

        // Now destroy the game after all broadcasts are sent
        roomManager.endGame(room.code);
      } else {
        // No active game, just end the room and notify players
        roomManager.endGame(room.code);
        if (!finalizedRooms.has(room.code)) {
          finalizedRooms.add(room.code);
          io.to(room.code).emit('game_ended', { scoreboard, gameType });
        }
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

    socket.on('bingo_mark', (row: number, col: number) => {
      handleGameAction('mark', { row, col });
    });

    // ========================================================================
    // REMOVED: list_public_rooms - public rooms feature removed (one-room-per-host)
    // ========================================================================

    socket.on('get_room_theme', async (roomCode: string, callback) => {
      if (!checkRateLimit()) return;

      const room = roomManager.getRoom(roomCode);
      if (!room) {
        callback({ success: false, error: 'Room not found' });
        return;
      }

      try {
        // Get theme from room settings or database
        let themeSettings: any = {};

        if (room.settings?.theme) {
          const theme = room.settings.theme as any;
          themeSettings = {
            snowEffect: theme.snowEffect ?? true,
            backgroundMusic: theme.soundEnabled ?? theme.backgroundMusic ?? true,
            sparkles: theme.sparkles ?? true,
            icicles: theme.icicles ?? false,
            frostPattern: theme.frostPattern ?? true,
            colorScheme: theme.colorScheme ?? 'mixed',
          };
        } else if (supabase) {
          // Try to load from database
          const { data: roomData } = await supabase
            .from('rooms')
            .select('settings')
            .eq('code', roomCode)
            .single();

          if (roomData?.settings?.theme) {
            const theme = roomData.settings.theme as any;
            themeSettings = {
              snowEffect: theme.snowEffect ?? true,
              backgroundMusic: theme.soundEnabled ?? theme.backgroundMusic ?? true,
              sparkles: theme.sparkles ?? true,
              icicles: theme.icicles ?? false,
              frostPattern: theme.frostPattern ?? true,
              colorScheme: theme.colorScheme ?? 'mixed',
            };
          }
        }

        callback({ success: true, theme: themeSettings });
      } catch (error: any) {
        console.error('[Socket] Error getting room theme:', error);
        callback({ success: false, error: error.message || 'Failed to get room theme' });
      }
    });

    socket.on(
      'update_room_settings',
      async (
        settings: {
          roomName?: string;
          description?: string;
          backgroundMusic?: boolean;
          snowEffect?: boolean;
          sparkles?: boolean;
          icicles?: boolean;
          frostPattern?: boolean;
          colorScheme?: 'traditional' | 'winter' | 'mixed';
        },
        callback
      ) => {
        if (!checkRateLimit()) return;

        const roomInfo = roomManager.getRoomBySocketId(socket.id);
        if (!roomInfo || !roomInfo.isHost) {
          callback({ success: false, error: 'Only host can update room settings' });
          return;
        }
        const room = roomInfo.room;

        try {
          // Update room settings
          if (settings.roomName !== undefined) {
            room.settings.roomName = settings.roomName;
          }
          if (settings.description !== undefined) {
            room.settings.description = settings.description;
          }
          // Helper function to ensure theme has all required properties
          const ensureTheme = () => {
            if (!room.settings.theme) {
              room.settings.theme = {
                primaryColor: '#c41e3a',
                secondaryColor: '#0f8644',
                snowEffect: true,
                soundEnabled: true,
                sparkles: true,
                icicles: false,
                frostPattern: true,
                colorScheme: 'mixed',
              } as any;
            }
          };

          // Update theme settings in memory FIRST
          if (settings.backgroundMusic !== undefined) {
            ensureTheme();
            (room.settings.theme as any).soundEnabled = settings.backgroundMusic;
            (room.settings.theme as any).backgroundMusic = settings.backgroundMusic;
          }
          if (settings.snowEffect !== undefined) {
            ensureTheme();
            (room.settings.theme as any).snowEffect = settings.snowEffect;
          }
          if (settings.sparkles !== undefined) {
            ensureTheme();
            (room.settings.theme as any).sparkles = settings.sparkles;
          }
          if (settings.icicles !== undefined) {
            ensureTheme();
            (room.settings.theme as any).icicles = settings.icicles;
          }
          if (settings.frostPattern !== undefined) {
            ensureTheme();
            (room.settings.theme as any).frostPattern = settings.frostPattern;
          }
          if (settings.colorScheme !== undefined) {
            ensureTheme();
            (room.settings.theme as any).colorScheme = settings.colorScheme;
          }

          // Update database - use memory state as source of truth
          if (supabase) {
            const updateData: any = {};
            if (settings.roomName !== undefined) {
              updateData.room_name = settings.roomName;
            }
            if (settings.description !== undefined) {
              updateData.description = settings.description;
            }

            // Store theme settings in settings JSONB column
            const hasThemeUpdates =
              settings.backgroundMusic !== undefined ||
              settings.snowEffect !== undefined ||
              settings.sparkles !== undefined ||
              settings.icicles !== undefined ||
              settings.frostPattern !== undefined ||
              settings.colorScheme !== undefined;

            if (hasThemeUpdates) {
              // Read current settings from database to preserve other settings
              const { data: roomData, error: fetchError } = await supabase
                .from('rooms')
                .select('settings')
                .eq('code', room.code)
                .single();

              if (fetchError && fetchError.code !== 'PGRST116') {
                console.error('[Room] Error fetching room settings:', fetchError);
              }

              // Merge current settings with updated theme from memory
              const currentSettings = (roomData?.settings as any) || {};
              const updatedTheme = room.settings.theme as any;

              // Use memory state (room.settings.theme) as source of truth
              updateData.settings = {
                ...currentSettings,
                theme: {
                  ...currentSettings.theme,
                  soundEnabled:
                    updatedTheme?.soundEnabled ?? currentSettings.theme?.soundEnabled ?? true,
                  backgroundMusic:
                    updatedTheme?.backgroundMusic ??
                    updatedTheme?.soundEnabled ??
                    currentSettings.theme?.backgroundMusic ??
                    currentSettings.theme?.soundEnabled ??
                    true,
                  snowEffect: updatedTheme?.snowEffect ?? currentSettings.theme?.snowEffect ?? true,
                  sparkles: updatedTheme?.sparkles ?? currentSettings.theme?.sparkles ?? true,
                  icicles: updatedTheme?.icicles ?? currentSettings.theme?.icicles ?? false,
                  frostPattern:
                    updatedTheme?.frostPattern ?? currentSettings.theme?.frostPattern ?? true,
                  colorScheme:
                    updatedTheme?.colorScheme ?? currentSettings.theme?.colorScheme ?? 'mixed',
                },
              };
            }

            const { error: updateError } = await supabase
              .from('rooms')
              .update(updateData)
              .eq('code', room.code);

            if (updateError) {
              console.error('[Room] Error updating room settings in database:', updateError);
              // Don't fail the request, but log the error
            } else {
              console.log(`[Room] Settings saved to database for room ${room.code}`);
            }
          }

          // Broadcast room update - use memory state (already updated above)
          const theme = room.settings.theme as any;
          io.to(room.code).emit('room_settings_updated', {
            roomName: room.settings.roomName,
            description: room.settings.description,
            backgroundMusic: theme?.backgroundMusic ?? theme?.soundEnabled ?? true,
            snowEffect: theme?.snowEffect ?? true,
            sparkles: theme?.sparkles ?? true,
            icicles: theme?.icicles ?? false,
            frostPattern: theme?.frostPattern ?? true,
            colorScheme: theme?.colorScheme ?? 'mixed',
          });

          callback({
            success: true,
            room: {
              code: room.code,
              roomName: room.settings.roomName,
              description: room.settings.description,
              backgroundMusic: room.settings.theme?.soundEnabled,
              snowEffect: room.settings.theme?.snowEffect,
            },
          });

          console.log(`[Room] Settings updated for room ${room.code}`);
        } catch (error: any) {
          console.error('[Room] Update settings error:', error);
          callback({ success: false, error: error.message || 'Failed to update room settings' });
        }
      }
    );

    // Jukebox control handler
    socket.on(
      'jukebox_control',
      (
        roomCode: string,
        action:
          | 'play'
          | 'pause'
          | 'next'
          | 'previous'
          | 'select'
          | 'shuffle'
          | 'repeat'
          | 'volume'
          | 'seek',
        data?: any
      ) => {
        if (!checkRateLimit()) return;

        const roomInfo = roomManager.getRoomBySocketId(socket.id);
        if (!roomInfo || !roomInfo.isHost) {
          return; // Silently ignore non-host requests
        }

        const room = roomInfo.room;
        if (room.code !== roomCode) {
          return; // Room code mismatch
        }

        let jukeboxState = roomManager.getJukeboxState(roomCode);
        if (!jukeboxState) {
          // Initialize if missing
          jukeboxState = {
            currentTrack: 0,
            isPlaying: false,
            shuffle: false,
            repeat: 'all',
            volume: 0.3,
          };
          roomManager.setJukeboxState(roomCode, jukeboxState);
        }

        // Handle different actions
        switch (action) {
          case 'play':
            roomManager.updateJukeboxState(roomCode, { isPlaying: true });
            break;
          case 'pause':
            roomManager.updateJukeboxState(roomCode, { isPlaying: false });
            break;
          case 'next':
            // Increment track (will wrap around)
            const nextTrack = (jukeboxState.currentTrack + 1) % (data?.maxTracks || 999);
            roomManager.updateJukeboxState(roomCode, { currentTrack: nextTrack });
            break;
          case 'previous':
            // Decrement track (will wrap around)
            const prevTrack =
              jukeboxState.currentTrack === 0
                ? (data?.maxTracks || 999) - 1
                : jukeboxState.currentTrack - 1;
            roomManager.updateJukeboxState(roomCode, { currentTrack: prevTrack });
            break;
          case 'select':
            if (typeof data?.trackIndex === 'number' && data.trackIndex >= 0) {
              roomManager.updateJukeboxState(roomCode, { currentTrack: data.trackIndex });
            }
            break;
          case 'shuffle':
            roomManager.updateJukeboxState(roomCode, { shuffle: !jukeboxState.shuffle });
            break;
          case 'repeat':
            const repeatModes: ('none' | 'one' | 'all')[] = ['none', 'one', 'all'];
            const currentIndex = repeatModes.indexOf(jukeboxState.repeat);
            const nextMode = repeatModes[(currentIndex + 1) % repeatModes.length];
            roomManager.updateJukeboxState(roomCode, { repeat: nextMode });
            break;
          case 'volume':
            if (typeof data?.volume === 'number') {
              const volume = Math.max(0, Math.min(1, data.volume));
              roomManager.updateJukeboxState(roomCode, { volume });
            }
            break;
          case 'seek':
            // Seek is handled client-side, but we can sync the state
            // Progress is not stored server-side as it changes continuously
            break;
        }

        // Broadcast updated state to all players in room
        const updatedState = roomManager.getJukeboxState(roomCode);
        if (updatedState) {
          io.to(roomCode).emit('jukebox_state', {
            currentTrack: updatedState.currentTrack,
            isPlaying: updatedState.isPlaying,
            shuffle: updatedState.shuffle,
            repeat: updatedState.repeat,
            volume: updatedState.volume,
          });
        }
      }
    );

    // ========================================================================
    // PLAYER PROFILE MANAGEMENT
    // ========================================================================

    socket.on('get_player_profile', async (playerName: string, callback) => {
      if (!checkRateLimit()) return;

      try {
        if (!supabase) {
          callback({ success: false, error: 'Database not available' });
          return;
        }

        const { data, error } = await supabase
          .from('player_profiles')
          .select('*')
          .eq('player_name', playerName)
          .single();

        if (error && error.code !== 'PGRST116') {
          callback({ success: false, error: error.message });
          return;
        }

        if (!data) {
          callback({ success: false, error: 'Profile not found' });
          return;
        }

        callback({
          success: true,
          profile: {
            playerName: data.player_name,
            totalScore: data.total_score,
            gamesPlayed: data.games_played,
            bestGameScore: data.best_game_score,
            preferredAvatar: data.preferred_avatar,
            avatarStyle: data.avatar_style,
            displayName: data.display_name,
            bio: data.bio,
            themePreference: data.theme_preference,
            favoriteGameType: data.favorite_game_type,
            firstPlayedAt: data.first_played_at,
            lastPlayedAt: data.last_played_at,
          },
        });
      } catch (error: any) {
        console.error('[Profile] Get error:', error);
        callback({ success: false, error: error.message || 'Failed to get profile' });
      }
    });

    socket.on(
      'update_player_profile',
      async (
        updates: {
          displayName?: string;
          bio?: string;
          preferredAvatar?: string;
          avatarStyle?: string;
          themePreference?: string;
        },
        callback
      ) => {
        if (!checkRateLimit()) return;

        try {
          // Get player name from room or token
          const roomInfo = roomManager.getRoomBySocketId(socket.id);
          if (!roomInfo) {
            callback({ success: false, error: 'Not in a room' });
            return;
          }

          // Find player name
          let playerName: string | undefined;
          if (!roomInfo.isHost) {
            const player = roomInfo.room.players.get(socket.id);
            playerName = player?.name;
          }

          if (!playerName) {
            callback({ success: false, error: 'Player name not found' });
            return;
          }

          if (!supabase) {
            callback({ success: false, error: 'Database not available' });
            return;
          }

          const updateData: any = {};
          if (updates.displayName !== undefined) updateData.display_name = updates.displayName;
          if (updates.bio !== undefined) updateData.bio = updates.bio;
          if (updates.preferredAvatar !== undefined)
            updateData.preferred_avatar = updates.preferredAvatar;
          if (updates.avatarStyle !== undefined) updateData.avatar_style = updates.avatarStyle;
          if (updates.themePreference !== undefined)
            updateData.theme_preference = updates.themePreference;
          updateData.updated_at = new Date().toISOString();

          const { data, error } = await supabase
            .from('player_profiles')
            .upsert(
              {
                player_name: playerName,
                ...updateData,
              },
              {
                onConflict: 'player_name',
              }
            )
            .select()
            .single();

          if (error) {
            callback({ success: false, error: error.message });
            return;
          }

          callback({
            success: true,
            profile: {
              playerName: data.player_name,
              displayName: data.display_name,
              bio: data.bio,
              preferredAvatar: data.preferred_avatar,
              avatarStyle: data.avatar_style,
              themePreference: data.theme_preference,
            },
          });

          console.log(`[Profile] Updated profile for ${playerName}`);
        } catch (error: any) {
          console.error('[Profile] Update error:', error);
          callback({ success: false, error: error.message || 'Failed to update profile' });
        }
      }
    );

    socket.on('get_player_stats', async (playerName: string, callback) => {
      if (!checkRateLimit()) return;

      try {
        if (!supabase) {
          callback({ success: false, error: 'Database not available', stats: [] });
          return;
        }

        const { data, error } = await supabase
          .from('player_game_stats')
          .select('*')
          .eq('player_name', playerName)
          .order('games_played', { ascending: false });

        if (error) {
          callback({ success: false, error: error.message, stats: [] });
          return;
        }

        const stats = (data || []).map((stat) => ({
          gameType: stat.game_type,
          gamesPlayed: stat.games_played,
          totalScore: stat.total_score,
          bestScore: stat.best_score,
          wins: stat.wins,
          averageScore: parseFloat(stat.average_score) || 0,
          lastPlayedAt: stat.last_played_at,
        }));

        callback({ success: true, stats });
      } catch (error: any) {
        console.error('[Profile] Get stats error:', error);
        callback({ success: false, error: error.message || 'Failed to get stats', stats: [] });
      }
    });

    socket.on('get_player_achievements', async (playerName: string, callback) => {
      if (!checkRateLimit()) return;

      try {
        if (!supabase) {
          callback({ success: false, error: 'Database not available', achievements: [] });
          return;
        }

        const { data, error } = await supabase
          .from('player_achievements')
          .select('*')
          .eq('player_name', playerName)
          .order('unlocked_at', { ascending: false });

        if (error) {
          callback({ success: false, error: error.message, achievements: [] });
          return;
        }

        const achievements = (data || []).map((ach) => ({
          achievementId: ach.achievement_id,
          achievementName: ach.achievement_name,
          unlockedAt: ach.unlocked_at,
          progress: ach.progress || {},
        }));

        callback({ success: true, achievements });
      } catch (error: any) {
        console.error('[Profile] Get achievements error:', error);
        callback({
          success: false,
          error: error.message || 'Failed to get achievements',
          achievements: [],
        });
      }
    });

    socket.on('link_profile_to_user', async (playerName: string, userId: string, callback) => {
      if (!checkRateLimit()) return;

      try {
        if (!supabase) {
          callback({ success: false, error: 'Database not available' });
          return;
        }

        // Verify user is authenticated (userId should match the auth user)
        const authToken = (socket.handshake.auth as any)?.token;
        if (!authToken) {
          callback({ success: false, error: 'Authentication required' });
          return;
        }

        const authUser = await verifyAuthToken(authToken);
        if (!authUser || authUser.userId !== userId) {
          callback({ success: false, error: 'Unauthorized' });
          return;
        }

        // Call the database function to link profile
        const { data, error } = await supabase.rpc('link_profile_to_user', {
          p_player_name: playerName,
          p_user_id: userId,
        });

        if (error) {
          callback({ success: false, error: error.message });
          return;
        }

        if (data) {
          callback({ success: true, linked: true });
          console.log(`[Profile] Linked profile ${playerName} to user ${userId}`);
        } else {
          callback({ success: false, error: 'Profile not found or already linked' });
        }
      } catch (error: any) {
        console.error('[Profile] Link error:', error);
        callback({ success: false, error: error.message || 'Failed to link profile' });
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

        if (error && error.code !== 'PGRST116') {
          // PGRST116 = no rows returned
          callback({ success: false, error: error.message, settings: {} });
          return;
        }

        callback({ success: true, settings: data?.settings || {} });
      } catch (error: any) {
        console.error('[Settings] Get error:', error);
        callback({
          success: false,
          error: error.message || 'Failed to get settings',
          settings: {},
        });
      }
    });

    socket.on(
      'update_game_time_settings',
      async (roomCode: string, gameType: GameType, timeSettings: any, callback) => {
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

          // Get or create game settings for this room and game type
          const { data: existingSettings } = await supabase
            .from('game_settings')
            .select('settings')
            .eq('room_code', roomCode)
            .eq('game_type', gameType)
            .single();

          const currentSettings = existingSettings?.settings || {};

          // Update settings with time settings
          const updatedSettings = {
            ...currentSettings,
            ...timeSettings,
          };

          // Upsert game settings
          const { error } = await supabase.from('game_settings').upsert(
            {
              room_code: roomCode,
              game_type: gameType,
              settings: updatedSettings,
              updated_at: new Date().toISOString(),
            },
            {
              onConflict: 'room_code,game_type',
            }
          );

          if (error) {
            callback({ success: false, error: error.message });
            return;
          }

          callback({ success: true });
          console.log(`[Time Settings] Updated ${gameType} time settings for room ${roomCode}`);
        } catch (error: any) {
          console.error('[Time Settings] Update error:', error);
          callback({ success: false, error: error.message || 'Failed to update time settings' });
        }
      }
    );

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
          translations: q.translations || undefined,
        }));

        callback({ success: true, questions });
      } catch (error: any) {
        console.error('[Custom] Get questions error:', error);
        callback({
          success: false,
          error: error.message || 'Failed to get questions',
          questions: [],
        });
      }
    });

    socket.on('get_custom_items', async (setId: string, callback) => {
      if (!checkRateLimit()) return;

      try {
        if (!supabase) {
          callback({ success: false, error: 'Database not available', items: [] });
          return;
        }

        const { data, error } = await supabase.from('price_items').select('*').eq('set_id', setId);

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
          translations: item.translations || undefined,
        }));

        callback({ success: true, items });
      } catch (error: any) {
        console.error('[Custom] Get items error:', error);
        callback({ success: false, error: error.message || 'Failed to get items', items: [] });
      }
    });

    socket.on('update_question', async (questionId: string, question: any, callback) => {
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

        if (
          typeof question.correctIndex !== 'number' ||
          question.correctIndex < 0 ||
          question.correctIndex >= question.answers.length
        ) {
          callback({ success: false, error: 'Invalid correct answer index' });
          return;
        }

        // Build translations object
        const translations: any = {
          en: {
            question: question.question.trim(),
            answers: question.answers.filter((a: string) => a && a.trim()),
          },
        };

        // Add French translation if provided
        if (question.translations?.fr) {
          translations.fr = question.translations.fr;
        }

        // Update question
        const { data, error } = await supabase
          .from('trivia_questions')
          .update({
            question: question.question.trim(),
            answers: question.answers.filter((a: string) => a && a.trim()),
            correct_index: question.correctIndex,
            difficulty: question.difficulty || 'medium',
            category: question.category?.trim() || null,
            image_url: question.imageUrl?.trim() || null,
            translations: Object.keys(translations).length > 1 ? translations : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', questionId)
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
            translations: data.translations || undefined,
          },
        });

        console.log(`[Question Sets] Updated question: ${questionId}`);
      } catch (error: any) {
        console.error('[Question Sets] Update question error:', error);
        callback({ success: false, error: error.message || 'Failed to update question' });
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
        // Verify host permissions and get room
        const roomInfo = roomManager.getRoomBySocketId(socket.id);
        if (!roomInfo || !roomInfo.isHost) {
          callback({ success: false, error: 'You must be a host', sets: [] });
          return;
        }

        if (!supabase) {
          callback({ success: false, error: 'Database not available', sets: [] });
          return;
        }

        // Get question sets for this room (room-scoped)
        const { data, error } = await supabase
          .from('question_sets')
          .select('*')
          .eq('room_code', roomInfo.room.code)
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
        callback({
          success: false,
          error: error.message || 'Failed to list question sets',
          sets: [],
        });
      }
    });

    socket.on(
      'create_question_set',
      async (name: string, description: string | undefined, callback) => {
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
              room_code: roomInfo.room.code,
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
      }
    );

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

        if (
          typeof question.correctIndex !== 'number' ||
          question.correctIndex < 0 ||
          question.correctIndex >= question.answers.length
        ) {
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

        // Build translations object
        const translations: any = {
          en: {
            question: question.question.trim(),
            answers: question.answers.filter((a: string) => a && a.trim()),
          },
        };

        // Add French translation if provided
        if (question.translations?.fr) {
          translations.fr = question.translations.fr;
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
            translations: Object.keys(translations).length > 1 ? translations : null,
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
            translations: data.translations || undefined,
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
        const { error } = await supabase.from('question_sets').delete().eq('id', setId);

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
        const { error } = await supabase.from('game_settings').upsert(
          {
            room_code: roomCode,
            game_type: GameType.TRIVIA_ROYALE,
            settings: updatedSettings,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'room_code,game_type',
          }
        );

        if (error) {
          callback({ success: false, error: error.message });
          return;
        }

        callback({ success: true });
        console.log(
          `[Question Sets] Set room ${roomCode} to use question set: ${setId || 'default'}`
        );
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
          translations: q.translations || undefined,
        }));

        callback({ success: true, questions });
      } catch (error: any) {
        console.error('[Question Sets] Get questions error:', error);
        callback({
          success: false,
          error: error.message || 'Failed to get questions',
          questions: [],
        });
      }
    });

    // ========================================================================
    // PRICE IS RIGHT ITEM SETS MANAGEMENT
    // ========================================================================

    socket.on('list_item_sets', async (callback) => {
      if (!checkRateLimit()) return;

      try {
        // Verify host permissions
        const roomInfo = roomManager.getRoomBySocketId(socket.id);
        if (!roomInfo || !roomInfo.isHost) {
          callback({ success: false, error: 'You must be a host', sets: [] });
          return;
        }

        if (!supabase) {
          callback({ success: false, error: 'Database not available', sets: [] });
          return;
        }

        const { data, error } = await supabase
          .from('price_item_sets')
          .select('*')
          .eq('room_code', roomInfo.room.code)
          .order('created_at', { ascending: false });

        if (error) {
          callback({ success: false, error: error.message, sets: [] });
          return;
        }

        const sets = (data || []).map((set) => ({
          id: set.id,
          name: set.name,
          description: set.description || undefined,
          itemCount: set.item_count || 0,
          createdAt: set.created_at,
        }));

        callback({ success: true, sets });
      } catch (error: any) {
        console.error('[Item Sets] List error:', error);
        callback({ success: false, error: error.message || 'Failed to list item sets', sets: [] });
      }
    });

    socket.on(
      'create_item_set',
      async (name: string, description: string | undefined, callback) => {
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
          const setId = `itemset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

          const { data, error } = await supabase
            .from('price_item_sets')
            .insert({
              id: setId,
              name: name.trim(),
              description: description?.trim() || null,
              room_code: roomInfo.room.code,
              item_count: 0,
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
              itemCount: 0,
            },
          });

          console.log(`[Item Sets] Created set: ${setId} by host ${roomInfo.room.hostId}`);
        } catch (error: any) {
          console.error('[Item Sets] Create error:', error);
          callback({ success: false, error: error.message || 'Failed to create item set' });
        }
      }
    );

    socket.on('get_items_for_set', async (setId: string, callback) => {
      if (!checkRateLimit()) return;

      try {
        if (!supabase) {
          callback({ success: false, error: 'Database not available', items: [] });
          return;
        }

        const { data, error } = await supabase
          .from('price_items')
          .select('*')
          .eq('set_id', setId)
          .order('created_at', { ascending: true });

        if (error) {
          callback({ success: false, error: error.message, items: [] });
          return;
        }

        const items = (data || []).map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description || '',
          price: parseFloat(item.price),
          imageUrl: item.image_url,
          category: item.category || '',
        }));

        callback({ success: true, items });
      } catch (error: any) {
        console.error('[Item Sets] Get items error:', error);
        callback({ success: false, error: error.message || 'Failed to get items', items: [] });
      }
    });

    socket.on('add_item_to_set', async (setId: string, item: any, callback) => {
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

        // Validate item
        if (!item.name || !item.name.trim()) {
          callback({ success: false, error: 'Item name is required' });
          return;
        }

        if (typeof item.price !== 'number' || item.price <= 0) {
          callback({ success: false, error: 'Valid price is required' });
          return;
        }

        if (!item.imageUrl || !item.imageUrl.trim()) {
          callback({ success: false, error: 'Image URL is required' });
          return;
        }

        // Verify set exists
        const { data: setData, error: setError } = await supabase
          .from('price_item_sets')
          .select('id')
          .eq('id', setId)
          .single();

        if (setError || !setData) {
          callback({ success: false, error: 'Item set not found' });
          return;
        }

        // Build translations object
        const translations: any = {
          en: {
            name: item.name.trim(),
            description: item.description?.trim() || '',
          },
        };

        // Add French translation if provided
        if (item.translations?.fr) {
          translations.fr = item.translations.fr;
        }

        // Insert item
        const { data, error } = await supabase
          .from('price_items')
          .insert({
            name: item.name.trim(),
            description: item.description?.trim() || null,
            price: item.price,
            image_url: item.imageUrl.trim(),
            category: item.category?.trim() || null,
            set_id: setId,
            translations: Object.keys(translations).length > 1 ? translations : null,
          })
          .select()
          .single();

        if (error) {
          callback({ success: false, error: error.message });
          return;
        }

        callback({
          success: true,
          item: {
            id: data.id,
            name: data.name,
            description: data.description || '',
            price: parseFloat(data.price),
            imageUrl: data.image_url,
            category: data.category || '',
            translations: data.translations || undefined,
          },
        });

        console.log(`[Item Sets] Added item to set ${setId}`);
      } catch (error: any) {
        console.error('[Item Sets] Add item error:', error);
        callback({ success: false, error: error.message || 'Failed to add item' });
      }
    });

    socket.on('update_item', async (itemId: string, item: any, callback) => {
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

        // Validate item
        if (!item.name || !item.name.trim()) {
          callback({ success: false, error: 'Item name is required' });
          return;
        }

        if (typeof item.price !== 'number' || item.price <= 0) {
          callback({ success: false, error: 'Valid price is required' });
          return;
        }

        if (!item.imageUrl || !item.imageUrl.trim()) {
          callback({ success: false, error: 'Image URL is required' });
          return;
        }

        // Build translations object
        const translations: any = {
          en: {
            name: item.name.trim(),
            description: item.description?.trim() || '',
          },
        };

        // Add French translation if provided
        if (item.translations?.fr) {
          translations.fr = item.translations.fr;
        }

        // Update item
        const { data, error } = await supabase
          .from('price_items')
          .update({
            name: item.name.trim(),
            description: item.description?.trim() || null,
            price: item.price,
            image_url: item.imageUrl.trim(),
            category: item.category?.trim() || null,
            translations: Object.keys(translations).length > 1 ? translations : null,
          })
          .eq('id', itemId)
          .select()
          .single();

        if (error) {
          callback({ success: false, error: error.message });
          return;
        }

        callback({
          success: true,
          item: {
            id: data.id,
            name: data.name,
            description: data.description || '',
            price: parseFloat(data.price),
            imageUrl: data.image_url,
            category: data.category || '',
            translations: data.translations || undefined,
          },
        });

        console.log(`[Item Sets] Updated item ${itemId}`);
      } catch (error: any) {
        console.error('[Item Sets] Update item error:', error);
        callback({ success: false, error: error.message || 'Failed to update item' });
      }
    });

    socket.on('delete_item', async (itemId: string, callback) => {
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

        const { error } = await supabase.from('price_items').delete().eq('id', itemId);

        if (error) {
          callback({ success: false, error: error.message });
          return;
        }

        callback({ success: true });
        console.log(`[Item Sets] Deleted item ${itemId}`);
      } catch (error: any) {
        console.error('[Item Sets] Delete item error:', error);
        callback({ success: false, error: error.message || 'Failed to delete item' });
      }
    });

    socket.on('delete_item_set', async (setId: string, callback) => {
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

        // Delete all items in the set first (trigger will update count)
        const { error: itemsError } = await supabase
          .from('price_items')
          .delete()
          .eq('set_id', setId);

        if (itemsError) {
          callback({ success: false, error: itemsError.message });
          return;
        }

        // Delete the set
        const { error } = await supabase.from('price_item_sets').delete().eq('id', setId);

        if (error) {
          callback({ success: false, error: error.message });
          return;
        }

        callback({ success: true });
        console.log(`[Item Sets] Deleted set: ${setId}`);
      } catch (error: any) {
        console.error('[Item Sets] Delete error:', error);
        callback({ success: false, error: error.message || 'Failed to delete item set' });
      }
    });

    socket.on('set_room_item_set', async (roomCode: string, setId: string | null, callback) => {
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
            .from('price_item_sets')
            .select('id')
            .eq('id', setId)
            .single();

          if (setError || !setData) {
            callback({ success: false, error: 'Item set not found' });
            return;
          }
        }

        // Get or create game settings for this room and game type
        const { data: existingSettings } = await supabase
          .from('game_settings')
          .select('settings')
          .eq('room_code', roomCode)
          .eq('game_type', GameType.PRICE_IS_RIGHT)
          .single();

        const currentSettings = existingSettings?.settings || {};

        // Update settings with the new item set ID
        const updatedSettings = {
          ...currentSettings,
          customItemSetId: setId || null,
        };

        // Upsert game settings
        const { error } = await supabase.from('game_settings').upsert(
          {
            room_code: roomCode,
            game_type: GameType.PRICE_IS_RIGHT,
            settings: updatedSettings,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'room_code,game_type',
          }
        );

        if (error) {
          callback({ success: false, error: error.message });
          return;
        }

        callback({ success: true });
        console.log(`[Item Sets] Set room ${roomCode} to use item set: ${setId || 'default'}`);
      } catch (error: any) {
        console.error('[Item Sets] Set room item set error:', error);
        callback({ success: false, error: error.message || 'Failed to set item set' });
      }
    });

    // ========================================================================
    // NAUGHTY OR NICE PROMPT SETS MANAGEMENT
    // ========================================================================

    socket.on('list_prompt_sets', async (callback) => {
      if (!checkRateLimit()) return;

      try {
        // Verify host permissions
        const roomInfo = roomManager.getRoomBySocketId(socket.id);
        if (!roomInfo || !roomInfo.isHost) {
          callback({ success: false, error: 'You must be a host', sets: [] });
          return;
        }

        if (!supabase) {
          callback({ success: false, error: 'Database not available', sets: [] });
          return;
        }

        const { data, error } = await supabase
          .from('naughty_prompt_sets')
          .select('*')
          .eq('room_code', roomInfo.room.code)
          .order('created_at', { ascending: false });

        if (error) {
          callback({ success: false, error: error.message, sets: [] });
          return;
        }

        const sets = (data || []).map((set) => ({
          id: set.id,
          name: set.name,
          description: set.description || undefined,
          promptCount: set.prompt_count || 0,
          createdAt: set.created_at,
        }));

        callback({ success: true, sets });
      } catch (error: any) {
        console.error('[Prompt Sets] List error:', error);
        callback({
          success: false,
          error: error.message || 'Failed to list prompt sets',
          sets: [],
        });
      }
    });

    socket.on(
      'create_prompt_set',
      async (name: string, description: string | undefined, callback) => {
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
          const setId = `promptset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

          const { data, error } = await supabase
            .from('naughty_prompt_sets')
            .insert({
              id: setId,
              name: name.trim(),
              description: description?.trim() || null,
              room_code: roomInfo.room.code,
              prompt_count: 0,
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
              promptCount: 0,
            },
          });

          console.log(`[Prompt Sets] Created set: ${setId} by host ${roomInfo.room.hostId}`);
        } catch (error: any) {
          console.error('[Prompt Sets] Create error:', error);
          callback({ success: false, error: error.message || 'Failed to create prompt set' });
        }
      }
    );

    socket.on('get_prompts_for_set', async (setId: string, callback) => {
      if (!checkRateLimit()) return;

      try {
        if (!supabase) {
          callback({ success: false, error: 'Database not available', prompts: [] });
          return;
        }

        const { data, error } = await supabase
          .from('naughty_prompts')
          .select('*')
          .eq('set_id', setId)
          .order('created_at', { ascending: true });

        if (error) {
          callback({ success: false, error: error.message, prompts: [] });
          return;
        }

        const prompts = (data || []).map((p) => ({
          id: p.id,
          prompt: p.prompt,
          category: p.category || '',
          contentRating: p.content_rating || 'pg',
          translations: p.translations || undefined,
        }));

        callback({ success: true, prompts });
      } catch (error: any) {
        console.error('[Prompt Sets] Get prompts error:', error);
        callback({ success: false, error: error.message || 'Failed to get prompts', prompts: [] });
      }
    });

    socket.on('add_prompt_to_set', async (setId: string, prompt: any, callback) => {
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

        // Validate prompt
        if (!prompt.prompt || !prompt.prompt.trim()) {
          callback({ success: false, error: 'Prompt text is required' });
          return;
        }

        // Verify set exists
        const { data: setData, error: setError } = await supabase
          .from('naughty_prompt_sets')
          .select('id')
          .eq('id', setId)
          .single();

        if (setError || !setData) {
          callback({ success: false, error: 'Prompt set not found' });
          return;
        }

        // Build translations object
        const translations: any = {
          en: {
            prompt: prompt.prompt.trim(),
          },
        };

        // Add French translation if provided
        if (prompt.translations?.fr) {
          translations.fr = prompt.translations.fr;
        }

        // Insert prompt
        const { data, error } = await supabase
          .from('naughty_prompts')
          .insert({
            prompt: prompt.prompt.trim(),
            category: prompt.category?.trim() || null,
            content_rating: prompt.contentRating || 'pg',
            set_id: setId,
            translations: Object.keys(translations).length > 1 ? translations : null,
          })
          .select()
          .single();

        if (error) {
          callback({ success: false, error: error.message });
          return;
        }

        callback({
          success: true,
          prompt: {
            id: data.id,
            prompt: data.prompt,
            category: data.category || '',
            contentRating: data.content_rating || 'pg',
            translations: data.translations || undefined,
          },
        });

        console.log(`[Prompt Sets] Added prompt to set ${setId}`);
      } catch (error: any) {
        console.error('[Prompt Sets] Add prompt error:', error);
        callback({ success: false, error: error.message || 'Failed to add prompt' });
      }
    });

    socket.on('update_prompt', async (promptId: string, prompt: any, callback) => {
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

        // Validate prompt
        if (!prompt.prompt || !prompt.prompt.trim()) {
          callback({ success: false, error: 'Prompt text is required' });
          return;
        }

        // Build translations object
        const translations: any = {
          en: {
            prompt: prompt.prompt.trim(),
          },
        };

        // Add French translation if provided
        if (prompt.translations?.fr) {
          translations.fr = prompt.translations.fr;
        }

        // Update prompt
        const { data, error } = await supabase
          .from('naughty_prompts')
          .update({
            prompt: prompt.prompt.trim(),
            category: prompt.category?.trim() || null,
            content_rating: prompt.contentRating || 'pg',
            translations: Object.keys(translations).length > 1 ? translations : null,
          })
          .eq('id', promptId)
          .select()
          .single();

        if (error) {
          callback({ success: false, error: error.message });
          return;
        }

        callback({
          success: true,
          prompt: {
            id: data.id,
            prompt: data.prompt,
            category: data.category || '',
            contentRating: data.content_rating || 'pg',
            translations: data.translations || undefined,
          },
        });

        console.log(`[Prompt Sets] Updated prompt ${promptId}`);
      } catch (error: any) {
        console.error('[Prompt Sets] Update prompt error:', error);
        callback({ success: false, error: error.message || 'Failed to update prompt' });
      }
    });

    socket.on('delete_prompt', async (promptId: string, callback) => {
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

        const { error } = await supabase.from('naughty_prompts').delete().eq('id', promptId);

        if (error) {
          callback({ success: false, error: error.message });
          return;
        }

        callback({ success: true });
        console.log(`[Prompt Sets] Deleted prompt ${promptId}`);
      } catch (error: any) {
        console.error('[Prompt Sets] Delete prompt error:', error);
        callback({ success: false, error: error.message || 'Failed to delete prompt' });
      }
    });

    socket.on('delete_prompt_set', async (setId: string, callback) => {
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

        // Delete all prompts in the set first (trigger will update count)
        const { error: promptsError } = await supabase
          .from('naughty_prompts')
          .delete()
          .eq('set_id', setId);

        if (promptsError) {
          callback({ success: false, error: promptsError.message });
          return;
        }

        // Delete the set
        const { error } = await supabase.from('naughty_prompt_sets').delete().eq('id', setId);

        if (error) {
          callback({ success: false, error: error.message });
          return;
        }

        callback({ success: true });
        console.log(`[Prompt Sets] Deleted set: ${setId}`);
      } catch (error: any) {
        console.error('[Prompt Sets] Delete error:', error);
        callback({ success: false, error: error.message || 'Failed to delete prompt set' });
      }
    });

    socket.on('set_room_prompt_set', async (roomCode: string, setId: string | null, callback) => {
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
            .from('naughty_prompt_sets')
            .select('id')
            .eq('id', setId)
            .single();

          if (setError || !setData) {
            callback({ success: false, error: 'Prompt set not found' });
            return;
          }
        }

        // Get or create game settings for this room and game type
        const { data: existingSettings } = await supabase
          .from('game_settings')
          .select('settings')
          .eq('room_code', roomCode)
          .eq('game_type', GameType.NAUGHTY_OR_NICE)
          .single();

        const currentSettings = existingSettings?.settings || {};

        // Update settings with the new prompt set ID
        const updatedSettings = {
          ...currentSettings,
          customPromptSetId: setId || null,
        };

        // Upsert game settings
        const { error } = await supabase.from('game_settings').upsert(
          {
            room_code: roomCode,
            game_type: GameType.NAUGHTY_OR_NICE,
            settings: updatedSettings,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'room_code,game_type',
          }
        );

        if (error) {
          callback({ success: false, error: error.message });
          return;
        }

        callback({ success: true });
        console.log(`[Prompt Sets] Set room ${roomCode} to use prompt set: ${setId || 'default'}`);
      } catch (error: any) {
        console.error('[Prompt Sets] Set room prompt set error:', error);
        callback({ success: false, error: error.message || 'Failed to set prompt set' });
      }
    });

    // ========================================================================
    // IMAGE UPLOAD HANDLER
    // ========================================================================

    socket.on(
      'upload_item_image',
      async (fileData: { name: string; type: string; data: string }, callback) => {
        console.log('[Image Upload] Received upload request:', {
          fileName: fileData.name,
          fileType: fileData.type,
          dataLength: fileData.data?.length || 0,
          socketId: socket.id,
          hasCallback: typeof callback === 'function',
        });

        if (!checkRateLimit()) {
          console.warn('[Image Upload] Rate limit exceeded');
          callback({ success: false, error: 'Rate limit exceeded. Please try again in a moment.' });
          return;
        }

        try {
          // Verify host permissions
          const roomInfo = roomManager.getRoomBySocketId(socket.id);
          console.log('[Image Upload] Room info check:', {
            hasRoomInfo: !!roomInfo,
            isHost: roomInfo?.isHost,
            roomCode: roomInfo?.room?.code,
          });

          if (!roomInfo || !roomInfo.isHost) {
            console.warn('[Image Upload] Not a host or room not found');
            callback({ success: false, error: 'You must be a host' });
            return;
          }

          if (!supabase) {
            console.error('[Image Upload] Supabase not available');
            callback({ success: false, error: 'Database not available' });
            return;
          }

          console.log('[Image Upload] Starting validation...');

          // Validate file type
          const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
          if (!allowedTypes.includes(fileData.type)) {
            callback({
              success: false,
              error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.',
            });
            return;
          }

          // Validate file size (max 5MB)
          const fileSize = Buffer.from(fileData.data, 'base64').length;
          const maxSize = 5 * 1024 * 1024; // 5MB
          if (fileSize > maxSize) {
            callback({ success: false, error: 'File size exceeds 5MB limit' });
            return;
          }

          // Generate unique filename
          const fileExt = fileData.name.split('.').pop() || 'jpg';
          const fileName = `price-items/${roomInfo.room.hostId}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;

          // Convert base64 to buffer
          console.log('[Image Upload] Converting base64 to buffer...');
          const fileBuffer = Buffer.from(fileData.data, 'base64');
          console.log('[Image Upload] Buffer created:', {
            size: fileBuffer.length,
            sizeKB: (fileBuffer.length / 1024).toFixed(2),
          });

          // Upload to Supabase storage
          console.log('[Image Upload] Uploading to Supabase storage:', fileName);
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('price-item-images')
            .upload(fileName, fileBuffer, {
              contentType: fileData.type,
              upsert: false,
            });

          if (uploadError) {
            console.error('[Image Upload] Storage error:', uploadError);
            callback({ success: false, error: uploadError.message || 'Failed to upload image' });
            return;
          }

          console.log('[Image Upload] Upload successful, getting public URL...');

          // Get public URL
          const { data: urlData } = supabase.storage
            .from('price-item-images')
            .getPublicUrl(fileName);

          if (!urlData?.publicUrl) {
            console.error('[Image Upload] Failed to get public URL');
            callback({ success: false, error: 'Failed to get image URL' });
            return;
          }

          console.log('[Image Upload] ✅ Success! URL:', urlData.publicUrl);
          callback({
            success: true,
            imageUrl: urlData.publicUrl,
          });

          console.log(`[Image Upload] Uploaded image: ${fileName}`);
        } catch (error: any) {
          console.error('[Image Upload] Error:', error);
          callback({ success: false, error: error.message || 'Failed to upload image' });
        }
      }
    );

    // ========================================================================
    // GUESSING GAME HANDLERS
    // ========================================================================
    setupGuessingHandlers(socket, roomManager, supabase);

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
      if (!room) {
        console.log(`[Game] broadcastGameState: Room ${roomCode} not found`);
        return;
      }

      const game = roomManager.getGame(roomCode);
      if (!game) {
        console.log(`[Game] broadcastGameState: Game not found for room ${roomCode}`);
        return;
      }

      // Sync room.gameState with game engine's current state
      // This ensures reconnections get the correct state
      const gameStateValue = game.getState().state;
      const previousState = lastGameState.get(roomCode);

      // Detect state transitions and emit sound events
      if (previousState !== gameStateValue) {
        const timestamp = Date.now();
        let soundToEmit: 'gameStart' | 'roundEnd' | 'gameEnd' | null = null;

        // Determine which sound to play based on state transition
        if (gameStateValue === GameState.STARTING) {
          soundToEmit = 'gameStart';
        } else if (gameStateValue === GameState.ROUND_END) {
          soundToEmit = 'roundEnd';
        } else if (gameStateValue === GameState.GAME_END) {
          soundToEmit = 'gameEnd';
        }

        // Emit sound event if state transition warrants it and we haven't already emitted for this state
        if (soundToEmit) {
          const lastSound = lastSoundEvent.get(roomCode);
          // Only emit if we haven't already emitted this sound for this state transition
          // or if enough time has passed (prevent rapid duplicates)
          const shouldEmit =
            !lastSound ||
            lastSound.state !== gameStateValue ||
            timestamp - lastSound.timestamp > 1000; // 1 second debounce

          if (shouldEmit) {
            io.to(roomCode).emit('sound_event', {
              sound: soundToEmit,
              timestamp: timestamp,
            });
            lastSoundEvent.set(roomCode, {
              sound: soundToEmit,
              state: gameStateValue,
              timestamp: timestamp,
            });
            console.log(
              `[Sound] Emitted ${soundToEmit} event for room ${roomCode} (state: ${gameStateValue})`
            );
          }
        }

        // Update last known state
        lastGameState.set(roomCode, gameStateValue);
      }

      if (room.gameState !== gameStateValue) {
        room.gameState = gameStateValue;
        console.log(`[Game] Synced room.gameState to ${gameStateValue} for room ${roomCode}`);
      }

      // Get a reference player ID for host view (use first player or host ID if no players)
      const firstPlayerId = room.players.size > 0 ? room.players.keys().next().value : room.hostId;

      if (!firstPlayerId) {
        console.warn(
          `[Game] No valid player ID found for game state broadcast in room ${roomCode}`
        );
        return;
      }

      // Send personalized state to each player
      room.players.forEach((player) => {
        const playerSocket = io.sockets.sockets.get(player.id);
        if (playerSocket) {
          const clientState = game.getClientState(player.id);
          playerSocket.emit('game_state_update', clientState);
          console.log(
            `[Game] Sent game_state_update to player ${player.id.substring(0, 8)} in room ${roomCode}, state: ${clientState?.state}`
          );
        }
      });

      // Always send game state to host (even if no players exist)
      const hostSocket = io.sockets.sockets.get(room.hostId);
      if (hostSocket) {
        // Host gets a full view of the game (uses first player's view or host ID if no players)
        const hostState = game.getClientState(firstPlayerId);
        // Log question presence for debugging
        if (hostState?.state === GameState.PLAYING || hostState?.state === 'playing') {
          console.log(
            `[Game] Host state check - state: ${hostState?.state}, hasQuestion: ${!!hostState?.currentQuestion}, hasItem: ${!!hostState?.currentItem}, hasPrompt: ${!!hostState?.currentPrompt}, round: ${hostState?.round}`
          );
        }
        hostSocket.emit('game_state_update', hostState);
        console.log(
          `[Game] Sent game_state_update to host ${room.hostId.substring(0, 8)} in room ${roomCode}, state: ${hostState?.state}, hasQuestion: ${!!hostState?.currentQuestion}, players: ${room.players.size}`
        );
      } else {
        console.warn(
          `[Game] Host socket ${room.hostId?.substring(0, 8)} not found for room ${roomCode}`
        );
      }
    }

    function handlePlayerLeave(socket: Socket, markDisconnected: boolean = false) {
      // Check if host or player
      const roomInfo = roomManager.getRoomBySocketId(socket.id);
      if (!roomInfo) return;

      let roomCode: string | null = null;
      if (roomInfo.isHost) {
        // Mark host disconnected but keep room
        if (markDisconnected) {
          roomCode = roomInfo.room.code;
          roomManager.leaveRoom(socket.id, true);
          io.to(roomCode).emit('host_left', { reason: 'Host disconnected' });
        } else {
          // Explicit host leave: close immediately
          roomCode = roomManager.leaveRoom(socket.id, false);
          if (roomCode) {
            io.to(roomCode).emit('host_left', { reason: 'Host left' });
          }
        }
      } else {
        roomCode = roomManager.leaveRoom(socket.id, markDisconnected);
      }
      if (roomCode) {
        if (!roomInfo.isHost) {
          // Player left
          if (markDisconnected) {
            socket.to(roomCode).emit('player_disconnected', socket.id);
          } else {
            socket.to(roomCode).emit('player_left', socket.id);
          }
        }
        socket.leave(roomCode);
        // After any membership change, broadcast authoritative list (if room still exists)
        const room = roomManager.getRoom(roomCode);
        if (room) {
          io.to(roomCode).emit('room_update', {
            players: Array.from(room.players.values()),
            playerCount: room.players.size,
          });
        }
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
  const lastBroadcastTime = new Map<string, number>();
  setInterval(() => {
    // Reap expired rooms regularly
    roomManager.cleanupExpiredRooms();
    const rooms = roomManager['rooms']; // Access private field
    if (rooms) {
      for (const [code, room] of rooms) {
        const game = roomManager.getGame(code);
        if (game) {
          const currentGameState = game.getState().state;
          const previousState = lastGameState.get(code);

          // Check for state transitions and emit sound events
          if (previousState !== currentGameState) {
            const timestamp = Date.now();
            let soundToEmit: 'gameStart' | 'roundEnd' | 'gameEnd' | null = null;

            if (currentGameState === GameState.STARTING) {
              soundToEmit = 'gameStart';
            } else if (currentGameState === GameState.ROUND_END) {
              soundToEmit = 'roundEnd';
            } else if (currentGameState === GameState.GAME_END) {
              soundToEmit = 'gameEnd';
            }

            if (soundToEmit) {
              const lastSound = lastSoundEvent.get(code);
              const shouldEmit =
                !lastSound ||
                lastSound.state !== currentGameState ||
                timestamp - lastSound.timestamp > 1000;

              if (shouldEmit) {
                io.to(code).emit('sound_event', {
                  sound: soundToEmit,
                  timestamp: timestamp,
                });
                lastSoundEvent.set(code, {
                  sound: soundToEmit,
                  state: currentGameState,
                  timestamp: timestamp,
                });
                console.log(
                  `[Sound] Emitted ${soundToEmit} event for room ${code} (state: ${currentGameState})`
                );
              }
            }

            lastGameState.set(code, currentGameState);
          }
        }

        if (game && game.getState().state === GameState.PLAYING) {
          // Only broadcast for games in PLAYING state (real-time games)
          // This optimizes bandwidth for turn-based games

          // Check if state has changed (use JSON string comparison for simplicity)
          const currentState = JSON.stringify(game.getState());
          const lastState = lastBroadcastState.get(code);

          // Special handling for bingo: emit item_called event when new item is called
          const gameState = game.getState();
          if (gameState.gameType === GameType.BINGO && 'currentItem' in gameState) {
            const bingoState = gameState as any;
            const lastBingoState = JSON.parse(lastState || '{}');

            // Check if currentItem changed
            if (
              bingoState.currentItem &&
              (!lastBingoState.currentItem ||
                lastBingoState.currentItem.id !== bingoState.currentItem.id)
            ) {
              // New item was called - emit event
              io.to(code).emit(
                'bingo_item_called',
                bingoState.currentItem,
                bingoState.itemsCalled || 0
              );
              console.log(
                `[Bingo] Item called: ${bingoState.currentItem.emoji} ${bingoState.currentItem.name} in room ${code}`
              );

              // Also check for completed lines and emit those events
              if (bingoState.winners && bingoState.winners.length > 0) {
                bingoState.winners.forEach((winnerId: string) => {
                  const completedLines = bingoState.completedLines?.[winnerId] || [];
                  if (completedLines.length > 0) {
                    const player = room.players.get(winnerId);
                    if (player) {
                      // Calculate points for this line (simplified)
                      const points = bingoState.scores?.[winnerId] || 0;
                      const lineType = completedLines[completedLines.length - 1]; // Last completed line
                      io.to(code).emit('bingo_line_completed', winnerId, lineType, points);
                      console.log(
                        `[Bingo] Line completed by ${player.name}: ${lineType} for ${points} points`
                      );
                    }
                  }
                });
              }
            }
          }

          // Only broadcast if state changed OR if it's been more than 200ms since last broadcast (throttle to 5Hz max)
          const now = Date.now();
          const lastBroadcast = lastBroadcastTime.get(code) || 0;
          const timeSinceLastBroadcast = now - lastBroadcast;
          const stateChanged = currentState !== lastState;
          const shouldBroadcast = stateChanged && (timeSinceLastBroadcast >= 200 || !lastState);

          if (shouldBroadcast) {
            lastBroadcastState.set(code, currentState);
            lastBroadcastTime.set(code, now);
            room.players.forEach((player) => {
              const socket = io.sockets.sockets.get(player.id);
              if (socket) {
                socket.emit('game_state_update', game.getClientState(player.id));
              }
            });

            // Also send to host
            const hostSocket = io.sockets.sockets.get(room.hostId);
            if (hostSocket) {
              const firstPlayerId =
                room.players.size > 0 ? room.players.keys().next().value : room.hostId;
              if (firstPlayerId) {
                hostSocket.emit('game_state_update', game.getClientState(firstPlayerId));
              }
            }
          }
        } else if (game && game.getState().state === GameState.GAME_END) {
          // Auto-finalize when games end themselves (e.g., last round)
          if (!finalizedRooms.has(code)) {
            const state = game.getState();
            const scoreboard = game.getScoreboard();
            const gameType = state.gameType;
            finalizedRooms.add(code);
            // Send final personalized state update with scoreboard
            room.players.forEach((player) => {
              const socket = io.sockets.sockets.get(player.id);
              if (socket) {
                const finalState = game.getClientState(player.id);
                finalState.state = GameState.GAME_END;
                finalState.scoreboard = scoreboard;
                socket.emit('game_state_update', finalState);
              }
            });
            // Emit consolidated end event
            io.to(code).emit('game_ended', { scoreboard, gameType });
            // Persist
            saveLeaderboard(
              code,
              gameType,
              scoreboard,
              supabase,
              roomManager,
              achievementManager,
              io
            );
            // End and cleanup
            roomManager.endGame(code);
          }
          // Clear cache for ended games
          lastBroadcastState.delete(code);
          lastBroadcastTime.delete(code);
          lastGameState.delete(code);
          lastSoundEvent.delete(code);
        } else {
          // Clear state cache when game ends
          lastBroadcastState.delete(code);
          lastBroadcastTime.delete(code);
          // Don't clear lastGameState or lastSoundEvent here - they might be needed for cleanup
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
  roomManager: RoomManager,
  achievementManager: AchievementManager | undefined,
  io: Server | undefined
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

      await supabase.from('global_leaderboard').upsert(
        {
          player_name: entry.name,
          total_score: currentTotal + entry.score,
          games_played: currentGames + 1,
          last_played_at: new Date().toISOString(),
          best_game_score: Math.max(currentBest, entry.score),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'player_name',
        }
      );
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

      const newTotal = currentTotal + entry.score;
      const newGames = currentGames + 1;
      const newBest = Math.max(currentBest, entry.score);

      await supabase.from('player_profiles').upsert(
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
          gameType as GameType,
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
              achievements: unlockedAchievements.map((id) => {
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
    console.error('[Leaderboard] Error saving to database:', error);
  }
}
