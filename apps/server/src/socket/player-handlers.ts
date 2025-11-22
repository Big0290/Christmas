import { Server, Socket } from 'socket.io';
import { SupabaseClient } from '@supabase/supabase-js';
import { sanitizePlayerName, GameState, RateLimiter, Intent, IntentResult } from '@christmas/core';
import type { RoomEngine } from '../engine/room-engine.js';
import type { AchievementManager } from '../managers/achievement-manager.js';
import { MessageValidator } from '../engine/message-validator.js';
import { RoleValidator } from '../engine/role-validator.js';

const rateLimiter = new RateLimiter({ maxRequests: 20, windowMs: 1000 }); // 20 requests per second
const messageValidator = new MessageValidator();
const roleValidator = new RoleValidator();

/**
 * Sets up player-specific socket event handlers
 */
export function setupPlayerHandlers(
  io: Server,
  socket: Socket,
  roomEngine: RoomEngine,
  supabase: SupabaseClient | null,
  achievementManager?: AchievementManager
) {
  // Update connection activity on any player event to keep connection alive
  const updateActivity = () => {
    roomEngine.connectionManager.updateLastSeen(socket.id);
  };
  
  // Wrap socket.on to automatically update activity on all player events
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
  const checkRateLimit = (actionType?: string): boolean => {
    const roomInfo = roomEngine.connectionManager.getRoomInfoBySocketId(socket.id);
    const roomCode = roomInfo?.roomCode;
    
    if (!rateLimiter.isAllowedForClient(socket.id, actionType)) {
      socket.emit('error', 'Rate limit exceeded');
      return false;
    }
    
    if (roomCode && !rateLimiter.isAllowedForRoom(roomCode, actionType)) {
      socket.emit('error', 'Room rate limit exceeded');
      return false;
    }
    
    if (actionType && !rateLimiter.isAllowedForAction(actionType, socket.id, roomCode)) {
      socket.emit('error', 'Action rate limit exceeded');
      return false;
    }
    
    return true;
  };

  const broadcastGameState = (roomCode: string): void => {
    roomEngine.broadcastGameState(roomCode);
  };

  /**
   * Submit an intent for processing (new intent-based system)
   */
  const submitIntent = (action: string, data: any, callback?: (result: IntentResult) => void): void => {
    if (!checkRateLimit(action)) return;

    const roomInfo = roomEngine.connectionManager.getRoomInfoBySocketId(socket.id);
    if (!roomInfo || roomInfo.isHost) {
      socket.emit('error', 'Only players can submit game intents');
      if (callback) callback({ success: false, intentId: '', error: 'Invalid role' });
      return;
    }

    // Validate role
    const roleValidation = roleValidator.validateRoleAndAction('player', action);
    if (!roleValidation.valid) {
      socket.emit('error', roleValidation.error);
      if (callback) callback({ success: false, intentId: '', error: roleValidation.error });
      return;
    }

    // Create intent
    const intent: Intent = {
      id: `intent_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      type: `game_${action}`,
      playerId: socket.id,
      roomCode: roomInfo.roomCode,
      action,
      data,
      timestamp: Date.now(),
      status: 'pending',
    };

    // Validate intent message
    const validation = messageValidator.validateIntent(intent);
    if (!validation.valid) {
      socket.emit('error', validation.error || 'Invalid intent');
      if (callback) callback({ success: false, intentId: intent.id, error: validation.error });
      return;
    }

    // Submit intent
    const intentId = roomEngine.submitIntent(intent);
    
    // Process intent immediately (host controller approval is automatic for now)
    // In future, this could queue for host approval
    roomEngine.processIntent(intentId, roomInfo.roomCode).then((result: IntentResult) => {
      // Send result to client
      socket.emit('intent_result', result);
      
      if (callback) {
        callback(result);
      }

      // Broadcast game state if successful
      if (result.success) {
        broadcastGameState(roomInfo.roomCode);
      }
    }).catch((error: any) => {
      const errorResult: IntentResult = {
        success: false,
        intentId,
        error: error.message || 'Failed to process intent',
      };
      socket.emit('intent_result', errorResult);
      if (callback) callback(errorResult);
    });
  };

  /**
   * Handle game action (legacy support - converts to intent)
   * @deprecated Use intent system directly
   */
  const handleGameAction = (action: string, data: any): void => {
    submitIntent(action, data);
  };
  // ========================================================================
  // ROOM JOINING
  // ========================================================================

  socket.on(
    'join_room',
    async (
      code: string,
      playerName: string,
      preferredAvatarOrLanguageOrCallback?: string | Function,
      languageOrCallback?: 'en' | 'fr' | Function,
      callbackOrRoleOrUndefined?: Function | 'player' | 'host-control' | 'host-display',
      roleOrCallback?: 'player' | 'host-control' | 'host-display' | Function
    ) => {
      if (!checkRateLimit()) return;

      // Handle backward compatibility with multiple signatures
      let preferredAvatar: string | undefined;
      let language: 'en' | 'fr' = 'en';
      let callback: Function;
      let role: 'player' | 'host-control' | 'host-display' | undefined = undefined;

      // Determine callback and role from arguments
      if (typeof preferredAvatarOrLanguageOrCallback === 'function') {
        callback = preferredAvatarOrLanguageOrCallback;
        preferredAvatar = undefined;
        language = 'en';
        role = undefined;
      } else if (typeof languageOrCallback === 'function') {
        preferredAvatar = preferredAvatarOrLanguageOrCallback;
        callback = languageOrCallback;
        language = 'en';
        role = undefined;
      } else if (typeof callbackOrRoleOrUndefined === 'function') {
        preferredAvatar = preferredAvatarOrLanguageOrCallback;
        language = (languageOrCallback as 'en' | 'fr') || 'en';
        callback = callbackOrRoleOrUndefined;
        // Check if role is provided as next argument
        if (typeof roleOrCallback === 'string' && ['player', 'host-control', 'host-display'].includes(roleOrCallback)) {
          role = roleOrCallback as 'player' | 'host-control' | 'host-display';
        }
      } else {
        preferredAvatar = preferredAvatarOrLanguageOrCallback;
        language = (languageOrCallback as 'en' | 'fr') || 'en';
        // Check if callbackOrRoleOrUndefined is role or callback
        if (typeof callbackOrRoleOrUndefined === 'string' && ['player', 'host-control', 'host-display'].includes(callbackOrRoleOrUndefined)) {
          role = callbackOrRoleOrUndefined as 'player' | 'host-control' | 'host-display';
          callback = typeof roleOrCallback === 'function' ? roleOrCallback : (() => {});
        } else {
          callback = (callbackOrRoleOrUndefined as unknown as Function) || (() => {});
          if (typeof roleOrCallback === 'string' && ['player', 'host-control', 'host-display'].includes(roleOrCallback)) {
            role = roleOrCallback as 'player' | 'host-control' | 'host-display';
          }
        }
      }

      // Validate role if provided
      if (role && !['player', 'host-control', 'host-display'].includes(role)) {
        callback({ success: false, error: 'Invalid role specified' });
        return;
      }

      try {
        if (!code || typeof code !== 'string' || !playerName || typeof playerName !== 'string') {
          callback({ success: false, error: 'Room code and player name are required' });
          return;
        }
        const sanitizedName = sanitizePlayerName(playerName);
        const codeNormalized = code.toUpperCase();

        console.log(`[Player] join_room called: code=${codeNormalized}, playerName=${sanitizedName}, socketId=${socket.id}`);

        const result = await roomEngine.joinRoom(
          codeNormalized,
          socket.id,
          sanitizedName,
          preferredAvatar,
          language
        );

        if (!result.success) {
          console.error(`[Player] ❌ Failed to join room ${codeNormalized}:`, result.error);
          callback(result);
          return;
        }

        console.log(`[Player] ✅ Player ${sanitizedName} (${socket.id.substring(0, 8)}) successfully joined room ${codeNormalized}`);

        // Determine if this is a host joining (for role validation)
        const room = result.room;
        const isHostSocket = room?.hostId === socket.id;
        
        // Validate role if provided for host roles
        if (role && (role === 'host-control' || role === 'host-display')) {
          if (!isHostSocket) {
            callback({ success: false, error: 'Only the host can use host-control or host-display roles' });
            return;
          }
        }

        // Store role in socket.data for quick access
        if (role) {
          (socket.data as any).role = role;
          console.log(`[Player] Stored role ${role} in socket.data for socket ${socket.id.substring(0, 8)}`);
        } else {
          // Default role based on whether this is a host
          const defaultRole = isHostSocket ? 'host-control' : 'player';
          (socket.data as any).role = defaultRole;
        }

        // Verify connection is registered (should be done in roomEngine.joinRoom)
        const playerConnectionInfo = roomEngine.connectionManager.getSocketInfo(socket.id);
        if (!playerConnectionInfo || !playerConnectionInfo.roomCode) {
          // Connection wasn't registered - register it now as a fallback
          console.warn(`[Player] Connection not registered for ${socket.id.substring(0, 8)}, registering now...`);
          const finalRole = role || (isHostSocket ? 'host-control' : 'player');
          roomEngine.connectionManager.registerConnection(socket.id, codeNormalized, isHostSocket, finalRole);
        } else {
          // Update role in ConnectionManager if it changed
          const finalRole = role || (isHostSocket ? 'host-control' : 'player');
          roomEngine.connectionManager.updateSocketRoom(socket.id, codeNormalized, isHostSocket, finalRole);
        }

        // CRITICAL: Join the socket to the room AFTER player is added to room.players
        // This ensures the player exists in the room before Socket.IO room membership
        // Order: 1) roomEngine.joinRoom() adds player to room.players, 2) socket.join() adds to Socket.IO room
        socket.join(codeNormalized);
        console.log(`[Player] Socket ${socket.id.substring(0, 8)} joined Socket.IO room ${codeNormalized}`);

        // Update last accessed timestamp
        await roomEngine.updateLastAccessed(codeNormalized);

        // Notify room of new player (excluding the joining player)
        socket.to(codeNormalized).emit('player_joined', result.player);

        // Get players list for syncing
        const playersList = Array.from(result.room?.players.values() || []);
        console.log(`[Player] 🔵 About to sync ${playersList.length} player(s) to room ${codeNormalized} via SyncEngine`);
        console.log(`[Player] 🔵 Players list:`, playersList.map(p => ({ id: p.id.substring(0, 8), name: p.name })));

        // CRITICAL: Use setImmediate to ensure Socket.IO room membership is fully established
        // before emitting room_update. This prevents race conditions where the socket
        // hasn't fully joined the room yet and misses the event.
        // Sync players list to all parties using RoomEngine (which uses SyncEngine internally)
        // RoomEngine handles fallbacks and timing internally
        roomEngine.syncPlayerList(codeNormalized, playersList);
        console.log(`[Player] ✅ Synced player list via RoomEngine for newly joined player ${sanitizedName} (${socket.id.substring(0, 8)})`);

        // If there's an active game, sync state to the newly joined player using SyncEngine
        // This ensures they see the current game state immediately and display also gets synced
        const game = roomEngine.getGame(codeNormalized);
        if (game && result.room) {
          const gameState = game.getState();
          // Use SyncEngine to sync to this specific player (personalized state)
          roomEngine.syncEngine.syncToPlayer(codeNormalized, socket.id, gameState);
          console.log(`[Player] Synced game state to newly joined player ${sanitizedName} (${socket.id.substring(0, 8)}) in room ${codeNormalized}, state: ${gameState?.state}`);
          // Also sync to all parties (including display) to ensure everyone is in sync
          roomEngine.syncGameState(codeNormalized, gameState);
        } else if (result.room) {
          // No active game - sync LOBBY state using RoomEngine
          const lobbyState = {
            state: result.room.gameState || GameState.LOBBY,
            gameType: result.room.currentGame || null,
            round: 0,
            maxRounds: 0,
            startedAt: 0,
            scores: {
              [socket.id]: result.player?.score || 0,
            },
            scoreboard: [],
          };
          // Sync to this player (personalized) and all parties
          roomEngine.syncEngine.syncToPlayer(codeNormalized, socket.id, lobbyState);
          roomEngine.syncGameState(codeNormalized, lobbyState);
          console.log(`[Player] Synced LOBBY state to newly joined player ${sanitizedName} (${socket.id.substring(0, 8)}) in room ${codeNormalized}`);
        }

        // Issue player token for reconnection
        const playerToken = await roomEngine.issuePlayerToken(
          codeNormalized,
          socket.id,
          sanitizedName
        );

        // Update last seen timestamp to keep connection alive
        roomEngine.connectionManager.updateLastSeen(socket.id);

        callback({
          success: true,
          player: result.player,
          isHost: result.room?.hostId === socket.id,
          players: Array.from(result.room?.players.values() || []),
          roomName: result.room?.settings?.roomName,
          playerToken,
        });

        console.log(`[Player] ${sanitizedName} joined ${codeNormalized} (connection registered: ${!!roomEngine.connectionManager.getSocketInfo(socket.id)})`);
      } catch (error) {
        console.error('[Player] Join error:', error);
        callback({ success: false, error: 'Failed to join room' });
      }
    }
  );

  socket.on('leave_room', () => {
    // Explicit leave - remove player completely
    const roomCode = roomEngine.leaveRoom(socket.id, false);
    if (roomCode) {
      socket.leave(roomCode);
      
      // Use setImmediate to ensure socket has fully left the room before syncing
      setImmediate(() => {
        const room = roomEngine.getRoom(roomCode);
        if (room) {
          // Sync players list to all parties using RoomEngine (which uses SyncEngine internally)
          // RoomEngine handles fallbacks and errors internally
          try {
            roomEngine.syncPlayerList(roomCode);
            const playersList = Array.from(room.players.values());
            console.log(`[Player] ✅ Synced player list after player left room ${roomCode}, ${playersList.length} player(s) remaining`);
          } catch (syncError) {
            console.error(`[Player] ❌ Error syncing players after leave:`, syncError);
            // SyncEngine handles fallbacks internally, so we don't need to emit directly
            // If sync fails, it's logged but we don't bypass the ACK system
          }

          // Sync game state through syncEngine to ensure display and all parties are updated
          // Sync game state using RoomEngine (handles both active game and lobby state)
          roomEngine.syncGameState(roomCode, undefined, { force: true });
          const game = roomEngine.getGame(roomCode);
          if (game) {
            const gameState = game.getState();
            console.log(`[Player] Synced game state after player left room ${roomCode}, state: ${gameState.state}`);
          } else {
            console.log(`[Player] Synced LOBBY state after player left room ${roomCode}`);
          }
        } else {
          console.warn(`[Player] ⚠️ Room ${roomCode} not found after player left - may have been destroyed`);
        }
      });
    }
  });

  // ========================================================================
  // PLAYER RECONNECTION
  // ========================================================================

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
        console.log(`[Player] 🔄 Reconnection attempt: roomCode=${roomCode}, socketId=${socket.id.substring(0, 8)}`);
        
        const codeNormalized = roomCode.toUpperCase().trim();

        // Check if reconnection is allowed (rate limiting)
        if (!roomEngine.connectionManager.canAttemptReconnection(socket.id)) {
          const attempts = roomEngine.connectionManager.getReconnectionAttempts(socket.id);
          console.warn(`[Player] Socket ${socket.id.substring(0, 8)} exceeded reconnection attempts (${attempts?.count || 0}/${5})`);
          callback({ success: false, error: 'Too many reconnection attempts. Please wait before trying again.' });
          return;
        }

        // Record reconnection attempt
        const attemptInfo = roomEngine.connectionManager.recordReconnectionAttempt(socket.id);
        if (!attemptInfo.shouldRetry) {
          callback({ success: false, error: 'Maximum reconnection attempts exceeded' });
          return;
        }

        // Validate connection state before processing reconnection
        const reconnectConnectionInfo = roomEngine.connectionManager.getSocketInfo(socket.id);
        if (reconnectConnectionInfo && reconnectConnectionInfo.connected && reconnectConnectionInfo.roomCode === codeNormalized) {
          // Socket is already connected to this room - might be duplicate reconnection
          console.warn(`[Player] Socket ${socket.id.substring(0, 8)} already connected to room ${codeNormalized}, allowing reconnection anyway`);
        }

        // Get room (should be in memory or load from DB) - retry if not found initially
        let room = roomEngine.getRoom(codeNormalized);
        let retryCount = 0;
        const MAX_RETRIES = 3;
        
        while (!room && retryCount < MAX_RETRIES) {
          if (retryCount > 0) {
            // Wait a bit before retrying (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
          }
          
          // Try to load room from database
          const loaded = await (roomEngine.roomManager as any).loadRoomFromDatabase(codeNormalized);
          if (loaded) {
            (roomEngine.roomManager as any).restoreRoomToMemory(loaded.room, loaded.hostToken);
            room = roomEngine.getRoom(codeNormalized);
            if (room) {
              console.log(`[Player] Restored room ${codeNormalized} from database on retry ${retryCount + 1}`);
              break;
            }
          }
          
          retryCount++;
        }
        
        if (!room) {
          callback({ success: false, error: 'Room not found after retries' });
          return;
        }

        // Replace player socket using token
        let reconnected: any;
        try {
          reconnected = await roomEngine.replacePlayerSocketWithToken(
            codeNormalized,
            playerToken,
            socket.id,
            language
          );
        } catch (error: any) {
          console.error(`[Player] ❌ Error during player reconnection:`, {
            socketId: socket.id.substring(0, 8),
            roomCode: codeNormalized,
            error: error?.message || String(error),
            stack: error?.stack,
          });
          callback({ success: false, error: 'Failed to reconnect player. Please try again.' });
          return;
        }
        
        if (!reconnected) {
          console.error(`[Player] ❌ Reconnection failed: Invalid token or player not found`, {
            socketId: socket.id.substring(0, 8),
            roomCode: codeNormalized,
            tokenPrefix: playerToken.substring(0, 20),
          });
          callback({ success: false, error: 'Invalid token or player not found' });
          return;
        }
        
        // Verify connection is registered after reconnection
        const postReconnectConnectionInfo = roomEngine.connectionManager.getSocketInfo(socket.id);
        if (!postReconnectConnectionInfo || postReconnectConnectionInfo.roomCode !== codeNormalized) {
          // Connection not registered - register it now
          console.warn(`[Player] Connection not registered after reconnection for ${socket.id.substring(0, 8)}, registering now...`);
          roomEngine.connectionManager.registerConnection(socket.id, codeNormalized, false);
        }
        
        // Update last seen to keep connection alive
        roomEngine.connectionManager.updateLastSeen(socket.id);
        
        // Reset reconnection attempts on success
        roomEngine.connectionManager.resetReconnectionAttempts(socket.id);
        console.log(`[Player] ✅ Player ${reconnected.name} successfully reconnected to room ${codeNormalized}`, {
          socketId: socket.id.substring(0, 8),
          roomCode: codeNormalized,
          playerName: reconnected.name,
          connectionRegistered: !!roomEngine.connectionManager.getSocketInfo(socket.id),
        });

        // Restore session score
        const info = roomEngine.getPlayerInfoByToken(playerToken);
        const restoredScore = await roomEngine.restoreSessionScore(
          codeNormalized,
          info?.name || ''
        );
        if (restoredScore !== undefined && restoredScore >= 0) {
          reconnected.score = restoredScore;
        }

        // Join the room
        socket.join(codeNormalized);

        // Broadcast player reconnected
        io.to(codeNormalized).emit('player_reconnected', {
          newPlayerId: socket.id,
          player: reconnected,
        });
        
        // Sync players list to all parties using RoomEngine (which uses SyncEngine internally)
        // RoomEngine handles fallbacks and timing internally
        roomEngine.syncPlayerList(codeNormalized);

        // Resync missing states using ACK system
        try {
          roomEngine.syncEngine.resyncSocket(codeNormalized, socket.id, 'player');
          console.log(`[Player] ✅ Resynced missing states for reconnected player ${socket.id.substring(0, 8)}`);
        } catch (resyncError) {
          console.error(`[Player] ❌ Error resyncing states:`, resyncError);
        }

        // Get game state
        const game = roomEngine.getGame(codeNormalized);
        let clientState: any;

        if (game) {
          // Restore player's score in the game
          if (restoredScore !== undefined && restoredScore >= 0) {
            roomEngine.restorePlayerScoreInGame(codeNormalized, socket.id, info?.name || '');
          }
          
          // Use SyncEngine to get and sync state for reconnecting player
          clientState = roomEngine.syncEngine.handleReconnection(codeNormalized, socket.id, 'player');
          
          // Also sync to all parties (including display) to ensure everyone is in sync
          roomEngine.syncGameState(codeNormalized, undefined, { force: true });
          const gameState = game.getState();
          console.log(`[Player] Synced game state to all parties after player reconnected in room ${codeNormalized}, state: ${gameState.state}`);
          
          io.to(codeNormalized).emit('player_reconnected', {
            playerId: socket.id,
            playerName: info?.name || '',
            restoredScore: restoredScore,
          });
        } else {
          // No active game - send LOBBY state
          clientState = {
            state: room.gameState || GameState.LOBBY,
            gameType: room.currentGame || null,
            round: 0,
            maxRounds: 0,
            scores: {
              [socket.id]: restoredScore !== undefined && restoredScore >= 0 ? restoredScore : reconnected.score || 0,
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
          
          // Sync game state to reconnecting player using SyncEngine (personalized) and RoomEngine (all parties)
          const game = roomEngine.getGame(codeNormalized);
          if (game) {
            const gameState = game.getState();
            roomEngine.syncEngine.syncToPlayer(codeNormalized, socket.id, gameState);
            // Also sync to all parties to ensure display is updated
            roomEngine.syncGameState(codeNormalized, gameState);
          } else {
            // No game - sync LOBBY state
            const lobbyState = {
              state: GameState.LOBBY,
              gameType: null,
              round: 0,
              maxRounds: 0,
              startedAt: 0,
              scores: {},
              scoreboard: [],
            };
            roomEngine.syncEngine.syncToPlayer(codeNormalized, socket.id, lobbyState);
            roomEngine.syncGameState(codeNormalized, lobbyState);
          }
        }

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

        console.log(`[Player] ✅ Token-based reconnection completed: player=${reconnected.name}, room=${codeNormalized}, score=${restoredScore}`);
      } catch (error) {
        console.error('[Player] ❌ Reconnection error:', error);
        callback({ success: false, error: 'Failed to reconnect' });
      }
    }
  );

  // ========================================================================
  // INTENT SYSTEM (NEW)
  // ========================================================================

  socket.on('intent', (intentData: any, callback?: (result: IntentResult) => void) => {
    // Validate intent message
    const validation = messageValidator.validateIntent(intentData);
    if (!validation.valid) {
      socket.emit('error', validation.error || 'Invalid intent message');
      if (callback) {
        callback({ success: false, intentId: intentData.id || '', error: validation.error });
      }
      return;
    }

    const intent = validation.data!;

    // Check rate limit
    if (!checkRateLimit(intent.action)) {
      if (callback) {
        callback({ success: false, intentId: intent.id, error: 'Rate limit exceeded' });
      }
      return;
    }

    // Validate role
    const roleValidation = roleValidator.validateRoleAndAction('player', intent.action);
    if (!roleValidation.valid) {
      socket.emit('error', roleValidation.error);
      if (callback) {
        callback({ success: false, intentId: intent.id, error: roleValidation.error });
      }
      return;
    }

    // Ensure intent has correct playerId and roomCode
    const roomInfo = roomEngine.connectionManager.getRoomInfoBySocketId(socket.id);
    if (!roomInfo || roomInfo.isHost) {
      socket.emit('error', 'Only players can submit game intents');
      if (callback) {
        callback({ success: false, intentId: intent.id, error: 'Invalid role' });
      }
      return;
    }

    intent.playerId = socket.id;
    intent.roomCode = roomInfo.roomCode;

    // Submit intent
    const intentId = roomEngine.submitIntent(intent);
    
    // Process intent immediately
    roomEngine.processIntent(intentId, roomInfo.roomCode).then((result: IntentResult) => {
      socket.emit('intent_result', result);
      if (callback) {
        callback(result);
      }
      if (result.success) {
        broadcastGameState(roomInfo.roomCode);
      }
    }).catch((error: any) => {
      const errorResult: IntentResult = {
        success: false,
        intentId,
        error: error.message || 'Failed to process intent',
      };
      socket.emit('intent_result', errorResult);
      if (callback) callback(errorResult);
    });
  });

  // ========================================================================
  // GAME ACTIONS (PLAYER ONLY) - Legacy support, converts to intents
  // ========================================================================

  socket.on('trivia_answer', (answerIndex: number) => {
    submitIntent('answer', { answerIndex });
  });

  // Throttle gift_move events
  const lastMoveTime = new Map<string, number>();
  const MOVE_THROTTLE_MS = 50;

  socket.on('gift_move', (direction: { x: number; y: number }) => {
    const now = Date.now();
    const lastMove = lastMoveTime.get(socket.id) || 0;
    if (now - lastMove < MOVE_THROTTLE_MS) {
      return;
    }
    lastMoveTime.set(socket.id, now);

    submitIntent('move', direction);
  });

  socket.on('workshop_upgrade', (upgradeId: string) => {
    submitIntent('upgrade', { upgradeId });
  });

  socket.on('emoji_pick', (emoji: string) => {
    submitIntent('pick', { emoji });
  });

  socket.on('vote', (choice: 'naughty' | 'nice') => {
    submitIntent('vote', { choice });
  });

  socket.on('price_guess', (guess: number) => {
    submitIntent('guess', { guess });
  });

  socket.on('bingo_mark', (row: number, col: number) => {
    submitIntent('mark', { row, col });
  });

  // ========================================================================
  // CONNECTION KEEP-ALIVE
  // ========================================================================
  socket.on('connection_keepalive', (data: { timestamp: number; roomCode: string; socketId: string }) => {
    // Update last seen to keep connection alive
    updateActivity();
    
    const roomInfo = roomEngine.connectionManager.getRoomInfoBySocketId(socket.id);
    const serverTime = Date.now();
    
    // Verify room and connection state
    let verified = false;
    let roomState = {
      roomCode: '',
      playerCount: 0,
      gameState: null as GameState | null,
      verified: false,
    };
    
    if (roomInfo) {
      const room = roomEngine.getRoom(roomInfo.roomCode);
      if (room) {
        // Verify socket is actually in the room
        const socketsInRoom = roomEngine.connectionManager.getSocketsInRoom(roomInfo.roomCode);
        const isInRoom = socketsInRoom.includes(socket.id);
        
        // Verify player is in room's player list
        const player = room.players.get(socket.id);
        const isPlayerInRoom = !!player;
        
        // Verify room code matches
        const roomCodeMatches = roomInfo.roomCode === data.roomCode;
        
        verified = isInRoom && isPlayerInRoom && roomCodeMatches;
        
        // Get current game state
        const game = roomEngine.getGame(roomInfo.roomCode);
        const currentGameState = game ? game.getState().state : null;
        
        roomState = {
          roomCode: roomInfo.roomCode,
          playerCount: room.players.size,
          gameState: currentGameState,
          verified,
        };
        
        // Track keep-alive in SyncEngine metrics
        if (roomEngine.syncEngine) {
          roomEngine.syncEngine.trackKeepAlive(roomInfo.roomCode, socket.id, verified);
        }
        
        if (!verified) {
          console.warn(`[KeepAlive] ⚠️ Room verification failed for socket ${socket.id.substring(0, 8)}:`, {
            isInRoom,
            isPlayerInRoom,
            roomCodeMatches,
            claimedRoomCode: data.roomCode,
            actualRoomCode: roomInfo.roomCode,
          });
        }
      } else {
        console.warn(`[KeepAlive] ⚠️ Room ${roomInfo.roomCode} not found for socket ${socket.id.substring(0, 8)}`);
        roomState.roomCode = roomInfo.roomCode;
        roomState.verified = false;
      }
    } else {
      console.warn(`[KeepAlive] ⚠️ Socket ${socket.id.substring(0, 8)} not found in ConnectionManager`);
      roomState.roomCode = data.roomCode;
      roomState.verified = false;
    }
    
    // Send ACK response with room state
    socket.emit('connection_keepalive_ack', {
      ack: true,
      timestamp: data.timestamp,
      serverTime,
      roomState,
    });
    
    if (verified) {
      console.log(`[KeepAlive] ✅ Socket ${socket.id.substring(0, 8)} keep-alive verified in room ${roomState.roomCode}`);
    }
  });
}

