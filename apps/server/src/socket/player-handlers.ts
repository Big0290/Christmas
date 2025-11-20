import { Server, Socket } from 'socket.io';
import { SupabaseClient } from '@supabase/supabase-js';
import { sanitizePlayerName, GameState, RateLimiter } from '@christmas/core';
import type { RoomEngine } from '../engine/room-engine.js';
import type { AchievementManager } from '../managers/achievement-manager.js';

const rateLimiter = new RateLimiter(20, 1000); // 20 requests per second

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

  const handleGameAction = (action: string, data: any): void => {
    if (!checkRateLimit()) return;

    const roomInfo = roomEngine.connectionManager.getRoomInfoBySocketId(socket.id);
    if (!roomInfo || roomInfo.isHost) return; // Only players can perform game actions, not hosts

    roomEngine.handlePlayerAction(roomInfo.roomCode, socket.id, action, data);
    broadcastGameState(roomInfo.roomCode);
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
      callbackOrUndefined?: Function
    ) => {
      if (!checkRateLimit()) return;

      // Handle backward compatibility with multiple signatures
      let preferredAvatar: string | undefined;
      let language: 'en' | 'fr' = 'en';
      let callback: Function;

      if (typeof preferredAvatarOrLanguageOrCallback === 'function') {
        callback = preferredAvatarOrLanguageOrCallback;
        preferredAvatar = undefined;
        language = 'en';
      } else if (typeof languageOrCallback === 'function') {
        preferredAvatar = preferredAvatarOrLanguageOrCallback;
        callback = languageOrCallback;
        language = 'en';
      } else {
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

        // Verify connection is registered (should be done in roomEngine.joinRoom)
        const playerConnectionInfo = roomEngine.connectionManager.getSocketInfo(socket.id);
        if (!playerConnectionInfo || !playerConnectionInfo.roomCode) {
          // Connection wasn't registered - register it now as a fallback
          console.warn(`[Player] Connection not registered for ${socket.id.substring(0, 8)}, registering now...`);
          roomEngine.connectionManager.registerConnection(socket.id, codeNormalized, false);
        }

        // CRITICAL: Join the socket to the room AFTER player is added to room.players
        // This ensures the player exists in the room before Socket.IO room membership
        // Order: 1) roomEngine.joinRoom() adds player to room.players, 2) socket.join() adds to Socket.IO room
        socket.join(codeNormalized);
        console.log(`[Player] Socket ${socket.id.substring(0, 8)} joined Socket.IO room ${codeNormalized}`);

        // Update last accessed timestamp
        await roomEngine.updateLastAccessed(codeNormalized);

        // Notify room of new player
        socket.to(codeNormalized).emit('player_joined', result.player);

        // Broadcast authoritative players list to entire room
        io.to(codeNormalized).emit('room_update', {
          players: Array.from(result.room?.players.values() || []),
          playerCount: result.room?.players.size || 0,
        });
        
        // Also send directly to the newly joined socket to ensure it's received
        // This prevents timing issues where socket.join() hasn't fully processed yet
        socket.emit('room_update', {
          players: Array.from(result.room?.players.values() || []),
          playerCount: result.room?.players.size || 0,
        });
        console.log(`[Player] Sent room_update directly to newly joined player ${sanitizedName} (${socket.id.substring(0, 8)})`);

        // If there's an active game, send game state to the newly joined player
        // This ensures they see the current game state immediately
        const game = roomEngine.getGame(codeNormalized);
        if (game && result.room) {
          const clientState = game.getClientState(socket.id);
          // Send directly to this socket (not broadcast) so they get personalized state
          socket.emit('game_state_update', clientState);
          console.log(`[Player] Sent game_state_update to newly joined player ${sanitizedName} (${socket.id.substring(0, 8)}) in room ${codeNormalized}, state: ${clientState?.state}`);
        } else if (result.room) {
          // No active game - send LOBBY state so client knows there's no game
          const lobbyState = {
            state: result.room.gameState || GameState.LOBBY,
            gameType: result.room.currentGame || null,
            round: 0,
            maxRounds: 0,
            scores: {
              [socket.id]: result.player?.score || 0,
            },
            scoreboard: [],
            players: Array.from(result.room.players.values()).map((p) => ({
              id: p.id,
              name: p.name,
              score: p.score || 0,
              avatar: p.avatar,
              status: p.status,
            })),
          };
          socket.emit('game_state_update', lobbyState);
          console.log(`[Player] Sent LOBBY game_state_update to newly joined player ${sanitizedName} (${socket.id.substring(0, 8)}) in room ${codeNormalized}`);
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
      const room = roomEngine.getRoom(roomCode);
      if (room) {
        io.to(roomCode).emit('room_update', {
          players: Array.from(room.players.values()),
          playerCount: room.players.size,
        });
      }
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
        io.to(codeNormalized).emit('room_update', {
          players: Array.from(room.players.values()),
          playerCount: room.players.size,
        });

        // Get game state
        const game = roomEngine.getGame(codeNormalized);
        let clientState: any;

        if (game) {
          // Restore player's score in the game
          if (restoredScore !== undefined && restoredScore >= 0) {
            roomEngine.restorePlayerScoreInGame(codeNormalized, socket.id, info?.name || '');
          }
          clientState = game.getClientState(socket.id);
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
        }

        // Send game state update to reconnecting player
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

        console.log(`[Player] ✅ Token-based reconnection completed: player=${reconnected.name}, room=${codeNormalized}, score=${restoredScore}`);
      } catch (error) {
        console.error('[Player] ❌ Reconnection error:', error);
        callback({ success: false, error: 'Failed to reconnect' });
      }
    }
  );

  // ========================================================================
  // GAME ACTIONS (PLAYER ONLY)
  // ========================================================================

  socket.on('trivia_answer', (answerIndex: number) => {
    handleGameAction('answer', { answerIndex });
  });

  // Throttle gift_move events
  const lastMoveTime = new Map<string, number>();
  const MOVE_THROTTLE_MS = 50;

  socket.on('gift_move', (direction: { x: number; y: number }) => {
    if (!checkRateLimit()) return;

    const now = Date.now();
    const lastMove = lastMoveTime.get(socket.id) || 0;
    if (now - lastMove < MOVE_THROTTLE_MS) {
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
}

