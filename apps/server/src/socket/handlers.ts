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
  // NOTE: lastSoundEvent removed - sound events are handled by SyncEngine.handleStateTransitions()

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

  // Periodic ACK metrics logging (every 2 minutes)
  const ackMetricsInterval = setInterval(() => {
    try {
      roomEngine.syncEngine.logAckMetrics();
    } catch (error) {
      console.error('[ACKMetrics] Error during ACK metrics check:', error);
    }
  }, 2 * 60 * 1000); // Every 2 minutes

  // Clean up intervals on server shutdown
  process.on('SIGTERM', () => {
    clearInterval(healthCheckInterval);
    clearInterval(ackMetricsInterval);
  });

  io.on('connection', (socket: Socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Setup split handlers
    setupHostHandlers(io, socket, roomEngine, supabase);
    setupPlayerHandlers(io, socket, roomEngine, supabase, achievementManager);
    
    // Setup guessing handlers (now uses RoomEngine)
    setupGuessingHandlers(socket, roomEngine, supabase);

    // Handle state ACKs from clients
    socket.on('state_ack', (data: { version: number; messageType?: 'state' | 'player_list' | 'settings'; timestamp?: number }) => {
      try {
        const connectionInfo = roomEngine.connectionManager.getSocketInfo(socket.id);
        if (!connectionInfo || !connectionInfo.roomCode) {
          console.warn(`[Socket] ⚠️ Received ACK from socket ${socket.id.substring(0, 8)} but no room found`);
          return;
        }

        const { roomCode } = connectionInfo;
        const version = data.version;
        const messageType = data.messageType || 'state';
        const ackTimestamp = data.timestamp;

        console.log(`[Socket] 📥 Received ${messageType} ACK from socket ${socket.id.substring(0, 8)}: version ${version} for room ${roomCode}`);

        // Handle different message types
        if (messageType === 'player_list' && version > 0) {
          // Convert to negative version for internal tracking
          const negativeVersion = -version;
          console.log(`[Socket] 📥 Processing player_list ACK: converting version ${version} to ${negativeVersion}`);
          roomEngine.syncEngine.handleAck(roomCode, socket.id, negativeVersion, 'player_list', ackTimestamp);
        } else if (messageType === 'settings') {
          // Handle settings ACKs (version passed as-is, SyncEngine handles key mapping)
          roomEngine.syncEngine.handleAck(roomCode, socket.id, version, 'settings', ackTimestamp);
        } else {
          // Handle state ACKs
          roomEngine.syncEngine.handleAck(roomCode, socket.id, version, 'state', ackTimestamp);
        }
      } catch (error: any) {
        console.error(`[Socket] ❌ Error handling state_ack:`, error);
      }
    });

    // Handle state gap detection from clients (request resync)
    socket.on('state_gap_detected', (data: { lastVersion: number; currentVersion: number; missingVersions: number }) => {
      try {
        const connectionInfo = roomEngine.connectionManager.getSocketInfo(socket.id);
        if (!connectionInfo || !connectionInfo.roomCode) {
          console.warn(`[Socket] ⚠️ Received gap detection from socket ${socket.id.substring(0, 8)} but no room found`);
          return;
        }

        const { roomCode } = connectionInfo;
        console.warn(`[Socket] ⚠️ Client ${socket.id.substring(0, 8)} detected version gap in room ${roomCode}: missing ${data.missingVersions} version(s) between ${data.lastVersion} and ${data.currentVersion}`);
        
        // Trigger resync for this socket
        const role = roomEngine.connectionManager.getSocketRole(socket.id) || 'player';
        roomEngine.syncEngine.resyncSocket(roomCode, socket.id, role);
        console.log(`[Socket] ✅ Triggered resync for socket ${socket.id.substring(0, 8)} due to version gap`);
      } catch (error: any) {
        console.error(`[Socket] ❌ Error handling state_gap_detected:`, error);
      }
    });

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
                // Sync players list to all parties using RoomEngine
                roomEngine.syncPlayerList(roomCode);
                console.log(`[Socket] ✅ Player ${player.name} (${socket.id.substring(0, 8)}) disconnected from room ${roomCode}`);
                
                // Sync game state using RoomEngine (handles both active game and lobby state)
                roomEngine.syncGameState(roomCode, undefined, { force: true });
                const game = roomEngine.getGame(roomCode);
                if (game) {
                  const gameState = game.getState();
                  console.log(`[Socket] Synced game state after player disconnect in room ${roomCode}, state: ${gameState.state}`);
                } else {
                  console.log(`[Socket] Synced LOBBY state after player disconnect in room ${roomCode}`);
                }
              }
            } else {
              // Player not found - may have already been removed
            // Still sync players list to ensure consistency
            console.warn(`[Socket] ⚠️ Player ${socket.id.substring(0, 8)} not found in room ${roomCode} during disconnect`);
            roomEngine.syncPlayerList(roomCode);
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
                  // Sync players list to all parties using RoomEngine
                  roomEngine.syncPlayerList(roomCode);
                  
                  // Sync game state using RoomEngine (handles both active game and lobby state)
                  roomEngine.syncGameState(roomCode, undefined, { force: true });
                  const game = roomEngine.getGame(roomCode);
                  if (game) {
                    const gameState = game.getState();
                    console.log(`[Socket] Synced game state after host disconnect in room ${roomCode}, state: ${gameState.state}`);
                  } else {
                    console.log(`[Socket] Synced LOBBY state after host disconnect in room ${roomCode}`);
                  }
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
        
        // Sync game state through syncEngine after host disconnect
        const roomAfterHostDisconnect = roomEngine.getRoom(roomCode);
        if (roomAfterHostDisconnect) {
          // Sync players list to all parties using RoomEngine
          roomEngine.syncPlayerList(roomCode);
          
          // Sync game state using RoomEngine (handles both active game and lobby state)
          roomEngine.syncGameState(roomCode, undefined, { force: true });
          const game = roomEngine.getGame(roomCode);
          if (game) {
            const gameState = game.getState();
            console.log(`[Socket] Synced game state after host disconnect in room ${roomCode}, state: ${gameState.state}`);
          } else {
            console.log(`[Socket] Synced LOBBY state after host disconnect in room ${roomCode}`);
          }
        }
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
            
            // Sync players list to all parties using RoomEngine
            const roomAfterLeave = roomEngine.getRoom(roomCode);
            if (roomAfterLeave) {
              roomEngine.syncPlayerList(roomCode);
            }
            
            // Sync game state using RoomEngine (handles both active game and lobby state)
            roomEngine.syncGameState(roomCode, undefined, { force: true });
            const game = roomEngine.getGame(roomCode);
            if (game) {
              const gameState = game.getState();
              console.log(`[Socket] Synced game state after player marked disconnected in room ${roomCode}, state: ${gameState.state}`);
            } else {
              console.log(`[Socket] Synced LOBBY state after player marked disconnected in room ${roomCode}`);
            }
          } else {
            // Player not found in room - may have already been removed
            // Still sync players list to ensure consistency
            console.warn(`[Socket] ⚠️ Player ${socket.id.substring(0, 8)} not found in room ${roomCode} during disconnect - may have already been removed`);
            roomEngine.syncPlayerList(roomCode);
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
      
      // After any membership change, sync players list and game state (if room still exists)
      // Note: This is a final sync to ensure consistency, but individual paths above should
      // have already synced. This acts as a safety net.
      const room = roomEngine.getRoom(roomCode);
      if (room) {
        // Sync players list to all parties using RoomEngine
        roomEngine.syncPlayerList(roomCode);
        
        // Sync game state using RoomEngine (handles both active game and lobby state)
        roomEngine.syncGameState(roomCode, undefined, { force: true });
        const game = roomEngine.getGame(roomCode);
        if (game) {
          const gameState = game.getState();
          console.log(`[Socket] Synced game state after disconnect in room ${roomCode}, state: ${gameState.state}`);
        } else {
          console.log(`[Socket] Synced LOBBY state after disconnect in room ${roomCode}`);
        }
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

          // NOTE: sound_event is handled by SyncEngine.handleStateTransitions()
          // SyncEngine emits sound_event when state transitions occur via syncState()
          // No need to emit here - SyncEngine is the authoritative source

          lastGameState.set(code, currentGameState);
        }
      }

      if (game) {
        const gameState = game.getState();
        const currentGameState = gameState.state;
        const previousState = lastGameState.get(code);

        // Check for state transitions - sync immediately when state changes (critical for ACK tracking)
        const stateChanged = previousState !== currentGameState;
        if (stateChanged && previousState !== undefined) {
          // State transition detected - sync immediately via SyncEngine (includes ACK tracking)
          console.log(`[PeriodicBroadcast] State transition detected in room ${code}: ${previousState} → ${currentGameState}, syncing immediately`);
          roomEngine.broadcastGameState(code);
          lastGameState.set(code, currentGameState);
          // Update last broadcast time to prevent immediate re-broadcast
          lastBroadcastTime.set(code, Date.now());
        }

        // For PLAYING state, also do periodic broadcasts for real-time updates
        if (currentGameState === GameState.PLAYING) {
          // Check if state has changed (use JSON string comparison for simplicity)
          const currentState = JSON.stringify(gameState);
          const lastState = lastBroadcastState.get(code);

          // Special handling for bingo: emit item_called event when new item is called
          let bingoItemChanged = false;
          if (gameState.gameType === GameType.BINGO && 'currentItem' in gameState) {
            const bingoState = gameState as any;
            const lastBingoState = JSON.parse(lastState || '{}');

            // Check if currentItem changed
            if (
              bingoState.currentItem &&
              (!lastBingoState.currentItem ||
                lastBingoState.currentItem.id !== bingoState.currentItem.id)
            ) {
              bingoItemChanged = true;
              // New item was called - emit event (for immediate UI feedback)
              // Note: The state sync below will also include this change with ACK tracking
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
          // For bingo item changes, sync immediately to ensure ACK tracking
          const now = Date.now();
          const lastBroadcast = lastBroadcastTime.get(code) || 0;
          const timeSinceLastBroadcast = now - lastBroadcast;
          const minBroadcastInterval = 200; // 5Hz = 200ms intervals
          const shouldBroadcast = 
            bingoItemChanged || // Always sync immediately when bingo item changes
            ((lastState !== currentState || timeSinceLastBroadcast >= minBroadcastInterval) &&
             timeSinceLastBroadcast >= minBroadcastInterval);

          if (shouldBroadcast) {
            // Use SyncEngine to sync state (includes ACK tracking)
            roomEngine.broadcastGameState(code);
            lastBroadcastState.set(code, currentState);
            lastBroadcastTime.set(code, now);
          }
        } else if (currentGameState === GameState.GAME_END) {
          // Clear cache for ended games
          lastBroadcastState.delete(code);
          lastBroadcastTime.delete(code);
          lastGameState.delete(code);
        }
      }
    }
  }, 100); // Check every 100ms but throttle broadcasts to 5Hz (200ms intervals)
}