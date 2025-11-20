import { Server, Socket } from 'socket.io';
import { SupabaseClient } from '@supabase/supabase-js';
import { AchievementManager } from '../managers/achievement-manager.js';
import { RoomEngine } from '../engine/room-engine.js';
import { setupGuessingHandlers } from './guessing-handlers.js';
import { setupHostHandlers } from './host-handlers.js';
import { setupPlayerHandlers } from './player-handlers.js';
import { GameType, GameState } from '@christmas/core';

export function setupSocketHandlers(
  io: Server,
  roomEngine: RoomEngine,
  supabase: SupabaseClient | null,
  achievementManager?: AchievementManager
) {
  // Track last game state per room to detect transitions for sound events
  const lastGameState = new Map<string, GameState>();
  
  // Track last sound event per room to prevent duplicates
  const lastSoundEvent = new Map<string, { sound: string; state: GameState; timestamp: number }>();

  // Periodic connection health check (every 30 seconds)
  const healthCheckInterval = setInterval(() => {
    try {
      // Get all active socket IDs from Socket.IO
      const activeSockets = new Set<string>();
      for (const [socketId] of io.sockets.sockets) {
        activeSockets.add(socketId);
      }
      
      // Sync ConnectionManager with Socket.IO state
      const syncResult = roomEngine.connectionManager.syncWithSocketIO(activeSockets);
      
      // Clean up stale connections
      const cleaned = roomEngine.connectionManager.cleanupStaleConnections(5);
      
      // Get health metrics
      const metrics = roomEngine.connectionManager.getHealthMetrics();
      
      // Log health metrics every 5 minutes
      if (Date.now() % (5 * 60 * 1000) < 30000) {
        console.log(`[ConnectionHealth] Total: ${metrics.totalConnections}, Connected: ${metrics.connected}, Disconnected: ${metrics.disconnected}, Stale: ${metrics.stale}`);
      }
      
      if (syncResult.removed > 0 || cleaned > 0) {
        console.log(`[ConnectionHealth] Cleaned up ${syncResult.removed + cleaned} stale/orphaned connections`);
      }
    } catch (error) {
      console.error('[ConnectionHealth] Error during health check:', error);
    }
  }, 30 * 1000); // Every 30 seconds

  // Clean up interval on server shutdown
  process.on('SIGTERM', () => {
    clearInterval(healthCheckInterval);
  });

  io.on('connection', (socket: Socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Setup split handlers
    setupHostHandlers(io, socket, roomEngine, supabase);
    setupPlayerHandlers(io, socket, roomEngine, supabase, achievementManager);
    
    // Setup guessing handlers (now uses RoomEngine)
    setupGuessingHandlers(socket, roomEngine, supabase);

    // Handle socket disconnect - mark as disconnected for reconnection
    socket.on('disconnect', (reason) => {
      const disconnectLog = {
        socketId: socket.id.substring(0, 8),
        reason,
        timestamp: new Date().toISOString(),
      };
      console.log(`[Socket] Client disconnected: ${socket.id.substring(0, 8)}, reason: ${reason}`, disconnectLog);
      
      try {
        // Get connection info BEFORE removing (use handleDisconnectionSync which marks as disconnected but doesn't remove)
        const connectionInfo = roomEngine.connectionManager.handleDisconnectionSync(socket.id);
        
        if (!connectionInfo || !connectionInfo.roomCode) {
          // Try alternative methods to find room info
          // Check if it's a player by checking PlayerManager directly
          const roomFromPlayer = roomEngine.getRoomByPlayer(socket.id);
          if (roomFromPlayer) {
            // Found room via player - handle as player disconnect
            // Defensive check: verify player exists before marking as disconnected
            const roomCode = roomFromPlayer.code;
            const player = roomFromPlayer.players.get(socket.id);
            if (player) {
              // Player exists - safe to mark as disconnected
              // connectionInfo was null, so we haven't marked as disconnected yet
              roomEngine.leaveRoom(socket.id, true, false); // Not already marked
              socket.leave(roomCode);
              socket.to(roomCode).emit('player_disconnected', socket.id);
              
              const room = roomEngine.getRoom(roomCode);
              if (room) {
                io.to(roomCode).emit('room_update', {
                  players: Array.from(room.players.values()),
                  playerCount: room.players.size,
                });
                console.log(`[Socket] ✅ Player ${player.name} (${socket.id.substring(0, 8)}) disconnected from room ${roomCode}`);
              }
            } else {
              // Player not found - may have already been removed
              console.warn(`[Socket] ⚠️ Player ${socket.id.substring(0, 8)} not found in room ${roomCode} during disconnect`);
              socket.leave(roomCode);
              roomEngine.connectionManager.removeSocket(socket.id);
            }
            
            if (reason === 'ping timeout' || reason === 'transport close') {
              console.warn(`[Socket] ⚠️ Player ${socket.id.substring(0, 8)} disconnected due to ${reason} - may indicate network issues`);
            }
            return;
          }
          
          // Check if it's a host by checking all rooms
          const allRooms = (roomEngine.roomManager as any)['rooms'];
          if (allRooms) {
            for (const [roomCode, room] of allRooms) {
              if (room.hostId === socket.id) {
                // Found room via host - handle as host disconnect
                roomEngine.markHostDisconnected(roomCode);
                socket.leave(roomCode);
                io.to(roomCode).emit('host_left', { reason: 'Host disconnected' });
                
                const roomAfterDisconnect = roomEngine.getRoom(roomCode);
                if (roomAfterDisconnect) {
                  io.to(roomCode).emit('room_update', {
                    players: Array.from(roomAfterDisconnect.players.values()),
                    playerCount: roomAfterDisconnect.players.size,
                  });
                }
                
                if (reason === 'ping timeout' || reason === 'transport close') {
                  console.warn(`[Socket] ⚠️ Host ${socket.id.substring(0, 8)} disconnected due to ${reason} - may indicate network issues`);
                }
                
                // Clean up connection manager
                roomEngine.connectionManager.removeSocket(socket.id);
                return;
              }
            }
          }
          
          // No room found - socket may have disconnected before joining
          // This is normal for clients that connect but never join a room
          // Just clean up connection manager silently (no need to log unless it's suspicious)
          const socketInfo = roomEngine.connectionManager.getSocketInfo(socket.id);
          if (socketInfo && socketInfo.connected) {
            // Socket was registered but no room found - this shouldn't happen, log it
            console.warn(`[Socket] Socket ${socket.id.substring(0, 8)} was registered but no room found - cleaning up`);
          }
          // Clean up quietly if socket was never registered (normal for quick disconnects)
          roomEngine.connectionManager.removeSocket(socket.id);
          return;
        }

      const { roomCode, isHost } = connectionInfo;

      if (isHost) {
        // Mark host disconnected but keep room (handled by HostManager)
        roomEngine.markHostDisconnected(roomCode);
        socket.leave(roomCode);
        io.to(roomCode).emit('host_left', { reason: 'Host disconnected' });
      } else {
        // Mark player as disconnected for reconnection (handled by PlayerManager)
        // Defensive check: verify player exists in room before marking as disconnected
        const room = roomEngine.getRoom(roomCode);
        if (room) {
          const player = room.players.get(socket.id);
          if (player) {
            // Player exists - safe to mark as disconnected
            // Already marked as disconnected via handleDisconnectionSync at line 79
            roomEngine.leaveRoom(socket.id, true, true); // Already marked
            socket.leave(roomCode);
            socket.to(roomCode).emit('player_disconnected', socket.id);
            console.log(`[Socket] ✅ Player ${player.name} (${socket.id.substring(0, 8)}) marked as disconnected in room ${roomCode}`);
          } else {
            // Player not found in room - may have already been removed
            console.warn(`[Socket] ⚠️ Player ${socket.id.substring(0, 8)} not found in room ${roomCode} during disconnect - may have already been removed`);
            socket.leave(roomCode);
            roomEngine.connectionManager.removeSocket(socket.id);
          }
        } else {
          // Room doesn't exist - just clean up
          console.warn(`[Socket] ⚠️ Room ${roomCode} not found during player disconnect`);
          socket.leave(roomCode);
          roomEngine.connectionManager.removeSocket(socket.id);
        }
      }
      
      // After any membership change, broadcast authoritative list (if room still exists)
      const room = roomEngine.getRoom(roomCode);
      if (room) {
        io.to(roomCode).emit('room_update', {
          players: Array.from(room.players.values()),
          playerCount: room.players.size,
        });
      }
      
      // Clean up connection manager (already marked as disconnected, now remove completely)
      roomEngine.connectionManager.removeSocket(socket.id);
      
      // Log ping timeout disconnections specifically
      if (reason === 'ping timeout' || reason === 'transport close') {
        console.warn(`[Socket] ⚠️ ${isHost ? 'Host' : 'Player'} ${socket.id.substring(0, 8)} disconnected due to ${reason} - may indicate network issues`, {
          socketId: socket.id.substring(0, 8),
          reason,
          isHost,
          roomCode,
        });
      }
      } catch (error: any) {
        console.error(`[Socket] ❌ Error handling disconnect:`, {
          socketId: socket.id.substring(0, 8),
          reason,
          error: error?.message || String(error),
          stack: error?.stack,
        });
        // Still try to clean up
        try {
          roomEngine.connectionManager.removeSocket(socket.id);
        } catch (cleanupError: any) {
          console.error(`[Socket] ❌ Error during disconnect cleanup:`, cleanupError);
        }
      }
    });
  });

  // Periodic game state broadcast (for real-time games like Gift Grabber)
  // Reduced frequency and only broadcast when state actually changes
  const lastBroadcastState = new Map<string, string>();
  const lastBroadcastTime = new Map<string, number>();
  setInterval(() => {
    // Reap expired rooms regularly
    roomEngine.cleanupExpiredRooms();
    
    // Get all active rooms (access private rooms map via roomEngine)
    const rooms = (roomEngine as any).roomManager?.['rooms'];
    if (!rooms) return;

    for (const [code, room] of rooms) {
      const game = roomEngine.getGame(code);
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
          }
        }

        // Only broadcast if state has changed and enough time has passed
        const now = Date.now();
        const lastBroadcast = lastBroadcastTime.get(code) || 0;
        const timeSinceLastBroadcast = now - lastBroadcast;
        const minBroadcastInterval = 200; // 5Hz = 200ms intervals

        if (
          (lastState !== currentState || timeSinceLastBroadcast >= minBroadcastInterval) &&
          timeSinceLastBroadcast >= minBroadcastInterval
        ) {
          roomEngine.broadcastGameState(code);
          lastBroadcastState.set(code, currentState);
          lastBroadcastTime.set(code, now);
        }
      } else {
        // Clear cache for ended games
        lastBroadcastState.delete(code);
        lastBroadcastTime.delete(code);
        lastGameState.delete(code);
        lastSoundEvent.delete(code);
      }
    }
  }, 100); // Check every 100ms but throttle broadcasts to 5Hz (200ms intervals)
}