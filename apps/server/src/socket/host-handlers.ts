import { Server, Socket } from 'socket.io';
import { SupabaseClient } from '@supabase/supabase-js';
import { verifyAuthToken } from '../lib/supabase.js';
import { sanitizePlayerName, GameType, GameState, isExpired, RateLimiter, Room } from '@christmas/core';
import type { RoomEngine } from '../engine/room-engine.js';
import type { AchievementManager } from '../managers/achievement-manager.js';

const rateLimiter = new RateLimiter({ maxRequests: 20, windowMs: 1000 }); // 20 requests per second

// Track processed host action IDs for idempotency: Map<actionId, { roomCode: string; timestamp: number }>
const processedHostActions: Map<string, { roomCode: string; timestamp: number }> = new Map();
const HOST_ACTION_TTL_MS = 60000; // 1 minute TTL for action IDs

/**
 * Generate unique host action ID
 */
function generateHostActionId(): string {
  return `host_action_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Check if host action ID was already processed
 */
function isHostActionProcessed(actionId: string): boolean {
  const record = processedHostActions.get(actionId);
  if (!record) {
    return false;
  }

  // Check TTL
  if (Date.now() - record.timestamp > HOST_ACTION_TTL_MS) {
    processedHostActions.delete(actionId);
    return false;
  }

  return true;
}

/**
 * Mark host action as processed
 */
function markHostActionProcessed(actionId: string, roomCode: string): void {
  processedHostActions.set(actionId, {
    roomCode,
    timestamp: Date.now(),
  });

  // Cleanup old actions periodically
  if (processedHostActions.size > 1000) {
    const now = Date.now();
    for (const [id, record] of processedHostActions) {
      if (now - record.timestamp > HOST_ACTION_TTL_MS) {
        processedHostActions.delete(id);
      }
    }
  }
}

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

  /**
   * Check if socket has host-control permission
   * Returns true if role is 'host-control', false otherwise
   */
  const checkHostControlPermission = (socket: Socket, roomEngine: RoomEngine): boolean => {
    // Get role from socket.data or ConnectionManager
    const role = (socket.data as any)?.role || roomEngine.connectionManager.getSocketRole(socket.id);
    
    if (!role) {
      // No role set - check if this is a host (backward compatibility)
      const roomInfo = roomEngine.getRoomBySocketId(socket.id);
      if (roomInfo && roomInfo.isHost) {
        // Default to host-control for hosts without role set
        return true;
      }
      return false;
    }
    
    const hasPermission = role === 'host-control';
    if (!hasPermission) {
      console.log(`[Host] Permission denied for socket ${socket.id.substring(0, 8)}: role=${role}, required=host-control`);
    }
    return hasPermission;
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

        // Sync players list to all parties using RoomEngine
        roomEngine.syncPlayerList(room.code);

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
    async (
      roomCode: string,
      hostToken: string,
      language: 'en' | 'fr' | undefined,
      roleOrCallback?: 'player' | 'host-control' | 'host-display' | Function,
      callback?: Function
    ) => {
      if (!checkRateLimit()) {
        const cb = typeof callback === 'function' ? callback : (typeof roleOrCallback === 'function' ? roleOrCallback : () => {});
        cb({ success: false, error: 'Rate limit exceeded' });
        return;
      }

      // Handle backward compatibility: role is optional
      let role: 'player' | 'host-control' | 'host-display' | undefined = undefined;
      let safeCallback: Function;
      
      if (typeof roleOrCallback === 'function') {
        // Old signature: no role parameter
        safeCallback = roleOrCallback;
        role = 'host-control'; // Default for backward compatibility
      } else if (typeof roleOrCallback === 'string' && ['player', 'host-control', 'host-display'].includes(roleOrCallback)) {
        // New signature: role provided
        role = roleOrCallback as 'player' | 'host-control' | 'host-display';
        safeCallback = typeof callback === 'function' ? callback : () => {};
      } else {
        // No role, no callback - shouldn't happen but handle gracefully
        safeCallback = () => {};
        role = 'host-control'; // Default
      }

      // Validate role
      if (role && !['player', 'host-control', 'host-display'].includes(role)) {
        safeCallback({ success: false, error: 'Invalid role specified' });
        return;
      }

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

        // Store role in socket.data before updating host socket
        const finalRole = role || 'host-control'; // Default to host-control for hosts
        (socket.data as any).role = finalRole;
        console.log(`[Host] 🔵 Stored role ${finalRole} in socket.data for socket ${socket.id.substring(0, 8)}`);

        // Update host socket (updates room hostId, marks host as connected, and registers in ConnectionManager)
        // Update host socket
        try {
          roomEngine.updateHostSocket(codeNormalized, socket.id);
          // CRITICAL: Register connection with role BEFORE joining room to ensure role is persisted
          // This ensures SyncEngine can find the socket role when syncing
          roomEngine.connectionManager.registerConnection(socket.id, codeNormalized, true, finalRole);
          // Also update role in ConnectionManager (in case connection already exists)
          roomEngine.connectionManager.updateSocketRoom(socket.id, codeNormalized, true, finalRole);
          
          // Verify role was set correctly
          const verifiedRole = roomEngine.connectionManager.getSocketRole(socket.id);
          if (verifiedRole !== finalRole) {
            console.warn(`[Host] ⚠️ Role mismatch: expected ${finalRole}, got ${verifiedRole}. Re-registering...`);
            roomEngine.connectionManager.updateSocketRoom(socket.id, codeNormalized, true, finalRole);
          }
          console.log(`[Host] ✅ Role ${finalRole} verified in ConnectionManager for socket ${socket.id.substring(0, 8)}`);
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

        // Join the room AFTER role is set and persisted
        socket.join(codeNormalized);
        console.log(`[Host] 🔵 Socket ${socket.id.substring(0, 8)} joined room ${codeNormalized} as ${finalRole}`);
        
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
        
        // CRITICAL: Get current players from room.players Map
        // If room was just restored from DB, players Map might be empty, but active players
        // should reconnect and repopulate it. For now, use what's in the Map.
        let playersList = Array.from(room.players.values());
        
        // If players list is empty but there are sockets in the room, log a warning
        // This helps identify when room was restored but players haven't reconnected yet
        const socketsInRoom = io.sockets.adapter.rooms.get(codeNormalized);
        const socketCount = socketsInRoom ? socketsInRoom.size : 0;
        if (playersList.length === 0 && socketCount > 1) {
          // More than 1 socket (host + at least one other) but no players in Map
          // This means room was restored but players haven't reconnected yet
          console.warn(`[Host] ⚠️ Room ${codeNormalized} has ${socketCount} socket(s) but players Map is empty - players may need to reconnect`);
        }
        
        console.log(`[Host] Reconnect response includes ${playersList.length} player(s) for room ${codeNormalized} (${socketCount} total socket(s))`);
        
        // Get theme from room settings
        const theme = room.settings?.theme || {};

        safeCallback({
          success: true,
          room: {
            code: room.code,
            players: playersList,
            playerCount: playersList.length,
            currentGame: room.currentGame,
            gameState: room.gameState,
          },
          // Include host token in response (especially if it was regenerated)
          hostToken: currentHostToken,
          // Include role in response so client can verify
          role: finalRole,
          // Include theme settings for persistence
          theme: {
            snowEffect: theme.snowEffect ?? true,
            soundEnabled: theme.soundEnabled ?? true,
            sparkles: theme.sparkles ?? true,
            icicles: theme.icicles ?? false,
            frostPattern: theme.frostPattern ?? true,
            colorScheme: theme.colorScheme ?? 'mixed',
          },
        });

        // CRITICAL: Use setImmediate to ensure Socket.IO room membership is fully established
        // before emitting room_update. This prevents race conditions where the socket
        // hasn't fully joined the room yet and misses the event.
        setImmediate(() => {
          // Verify socket is in the room before syncing
          const socketsInRoom = io.sockets.adapter.rooms.get(codeNormalized);
          const socketCount = socketsInRoom ? socketsInRoom.size : 0;
          const socketIds = socketsInRoom ? Array.from(socketsInRoom).map(id => id.substring(0, 8)).join(', ') : 'none';
          console.log(`[Host] 🔵 Room ${codeNormalized} now has ${socketCount} socket(s): [${socketIds}]`);
          
          // Note: SyncEngine handles fallback emits internally if socket isn't in room yet
          // We don't need to emit directly here - SyncEngine will handle it with proper ACK tracking
          const isInRoom = socketsInRoom?.has(socket.id) || false;
          if (!isInRoom) {
            console.warn(`[Host] ⚠️ Socket ${socket.id.substring(0, 8)} claims to have joined room ${codeNormalized} but is NOT in the room yet. SyncEngine will handle fallback.`);
          } else {
            console.log(`[Host] ✅ Verified: Socket ${socket.id.substring(0, 8)} is confirmed in room ${codeNormalized}`);
          }

          // CRITICAL: Re-fetch players list right before syncing to ensure we have the latest
          // This handles cases where players reconnected between getting the room and syncing
          const currentPlayersList = Array.from(room.players.values());
          const currentPlayerCount = currentPlayersList.length;
          
          if (currentPlayerCount !== playersList.length) {
            console.log(`[Host] 🔄 Player count changed: ${playersList.length} → ${currentPlayerCount} (players may have reconnected)`);
            playersList = currentPlayersList;
          }
          
          // Sync players list to all parties using RoomEngine (which uses SyncEngine internally)
          // RoomEngine handles fallbacks and timing internally
          console.log(`[Host] 🔵 About to sync ${playersList.length} player(s) to room ${codeNormalized} after reconnect`);
          roomEngine.syncPlayerList(codeNormalized, playersList);
          console.log(`[Host] ✅ Synced ${playersList.length} player(s) to room ${codeNormalized} via RoomEngine after reconnect`);

          // Send jukebox state to reconnecting host
          const jukeboxState = roomEngine.roomManager.getJukeboxState(codeNormalized);
          if (jukeboxState) {
            socket.emit('jukebox_state', jukeboxState);
            console.log(`[Host] ✅ Sent jukebox state to reconnecting host for room ${codeNormalized}`);
          }

          // Resync missing states using ACK system
          try {
            roomEngine.syncEngine.resyncSocket(codeNormalized, socket.id, finalRole);
            console.log(`[Host] ✅ Resynced missing states for reconnecting host ${socket.id.substring(0, 8)}`);
          } catch (resyncError) {
            console.error(`[Host] ❌ Error resyncing states:`, resyncError);
          }
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

  socket.on('start_game', async (gameType: GameType, settings?: any, callback?: (response: { success: boolean; error?: string; actionId?: string; duplicate?: boolean }) => void) => {
    // Extract actionId from settings if provided (for idempotency)
    const actionId = settings?.actionId || generateHostActionId();
    const isDuplicate = isHostActionProcessed(actionId);
    
    console.log(`[Host] start_game received from socket ${socket.id.substring(0, 8)} for game type ${gameType}, actionId=${actionId.substring(0, 16)}${isDuplicate ? ' (DUPLICATE)' : ''}`);
    
    if (isDuplicate) {
      const errorMsg = 'This action was already processed';
      console.log(`[Host] Duplicate start_game action detected: ${actionId.substring(0, 16)}`);
      if (callback) callback({ success: true, error: errorMsg, actionId, duplicate: true });
      return;
    }
    
    if (!checkRateLimit()) {
      const errorMsg = 'Rate limit exceeded. Please wait before trying again.';
      console.log(`[Host] Rate limit exceeded for start_game from socket ${socket.id.substring(0, 8)}`);
      socket.emit('error', errorMsg);
      if (callback) callback({ success: false, error: errorMsg, actionId });
      return;
    }

    const roomInfo = roomEngine.getRoomBySocketId(socket.id);
    if (!roomInfo || !roomInfo.isHost) {
      const errorMsg = 'Only host can start games';
      console.log(`[Host] Permission denied: start_game from socket ${socket.id.substring(0, 8)} - not a host`);
      socket.emit('error', errorMsg);
      if (callback) callback({ success: false, error: errorMsg });
      return;
    }

    // Check host-control permission
    const role = (socket.data as any)?.role || roomEngine.connectionManager.getSocketRole(socket.id);
    console.log(`[Host] Checking host-control permission for socket ${socket.id.substring(0, 8)}: role=${role || 'undefined'}, isHost=${roomInfo.isHost}`);
    
    if (!checkHostControlPermission(socket, roomEngine)) {
      const errorMsg = 'Only host controller can perform this action';
      console.log(`[Host] Permission denied: start_game from socket ${socket.id.substring(0, 8)}: role=${role || 'undefined'}, required=host-control`);
      socket.emit('error', errorMsg);
      if (callback) callback({ success: false, error: errorMsg });
      return;
    }

    const room = roomInfo.room;
    console.log(`[Host] Processing start_game for room ${room.code}, game type ${gameType}`);

    try {
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
        const errorMsg = 'Failed to start game';
        console.error(`[Host] Failed to start game: roomEngine.startGame returned null for room ${room.code}, game type ${gameType}`);
        socket.emit('error', errorMsg);
        if (callback) callback({ success: false, error: errorMsg });
        return;
      }

      const gameState = game.getState();
      console.log(`[Host] Game created successfully: ${gameType} in room ${room.code}, initial state: ${gameState.state}`);

      // Emit game_started event
      io.to(room.code).emit('game_started', gameType);

      // NOTE: Initial state sync is handled by GameManager.broadcastGameState() after game.start()
      // which is called in game-manager.ts startGame(). We don't need to sync here to avoid double sync.

      // CRITICAL: Game will transition from STARTING to PLAYING after 3 seconds
      // onPlaying() will load the first question/item, so we need to sync again after that
      // Set a timeout to sync state again after onPlaying() completes (around 3.5 seconds)
      // This ensures all clients get the PLAYING state with game-specific data (questions, items, etc.)
      setTimeout(() => {
        const currentGame = roomEngine.getGame(room.code);
        if (currentGame && currentGame === game) {
          const updatedState = currentGame.getState();
          // Only sync if state has transitioned to PLAYING and game data is loaded
          if (updatedState.state === GameState.PLAYING) {
            console.log(`[Host] 🔄 Game transitioned to PLAYING, syncing state with game data for room ${room.code}`);
            roomEngine.syncGameState(room.code, updatedState, { force: true });
            console.log(`[Host] ✅ Synced PLAYING state with game data to all parties for room ${room.code}`);
          }
        }
      }, 3500); // After game transitions to PLAYING and onPlaying() completes

      // Mark action as processed
      markHostActionProcessed(actionId, room.code);
      
      console.log(`[Host] Successfully started ${gameType} in room ${room.code}`);
      if (callback) callback({ success: true, actionId });
    } catch (error: any) {
      const errorMsg = error?.message || 'Failed to start game';
      console.error(`[Host] Error starting game in room ${room.code}:`, error);
      socket.emit('error', errorMsg);
      if (callback) callback({ success: false, error: errorMsg });
    }
  });

  socket.on('end_game', async (actionIdOrCallback?: string | ((response: { success: boolean; error?: string; actionId?: string; duplicate?: boolean }) => void), callback?: (response: { success: boolean; error?: string; actionId?: string; duplicate?: boolean }) => void) => {
    // Handle both signatures: (actionId, callback) or (callback)
    let actionId: string;
    let actualCallback: ((response: { success: boolean; error?: string; actionId?: string; duplicate?: boolean }) => void) | undefined;
    
    if (typeof actionIdOrCallback === 'string') {
      actionId = actionIdOrCallback;
      actualCallback = callback;
    } else {
      actionId = generateHostActionId();
      actualCallback = actionIdOrCallback;
    }
    
    const isDuplicate = isHostActionProcessed(actionId);
    console.log(`[Host] end_game received from socket ${socket.id.substring(0, 8)}, actionId=${actionId.substring(0, 16)}${isDuplicate ? ' (DUPLICATE)' : ''}`);
    
    if (isDuplicate) {
      const errorMsg = 'This action was already processed';
      console.log(`[Host] Duplicate end_game action detected: ${actionId.substring(0, 16)}`);
      if (actualCallback) actualCallback({ success: true, error: errorMsg, actionId, duplicate: true });
      return;
    }
    
    if (!checkRateLimit()) {
      const errorMsg = 'Rate limit exceeded. Please wait before trying again.';
      console.log(`[Host] Rate limit exceeded for end_game from socket ${socket.id.substring(0, 8)}`);
      socket.emit('error', errorMsg);
      if (actualCallback) actualCallback({ success: false, error: errorMsg, actionId });
      return;
    }

    const roomInfo = roomEngine.getRoomBySocketId(socket.id);
    if (!roomInfo || !roomInfo.isHost) {
      const errorMsg = 'Only host can end games';
      console.log(`[Host] Permission denied: end_game from socket ${socket.id.substring(0, 8)} - not a host`);
      socket.emit('error', errorMsg);
      if (callback) callback({ success: false, error: errorMsg });
      return;
    }

    // Check host-control permission
    const role = (socket.data as any)?.role || roomEngine.connectionManager.getSocketRole(socket.id);
    console.log(`[Host] Checking host-control permission for socket ${socket.id.substring(0, 8)}: role=${role || 'undefined'}, isHost=${roomInfo.isHost}`);
    
    if (!checkHostControlPermission(socket, roomEngine)) {
      const errorMsg = 'Only host controller can perform this action';
      console.log(`[Host] Permission denied: end_game from socket ${socket.id.substring(0, 8)}: role=${role || 'undefined'}, required=host-control`);
      socket.emit('error', errorMsg);
      if (callback) callback({ success: false, error: errorMsg });
      return;
    }

    const room = roomInfo.room;
    console.log(`[Host] Processing end_game for room ${room.code}`);

    try {
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

        // Get final game state with GAME_END state
        // Transform scoreboard to match client format (remove playerId, keep name and score)
        const formattedScoreboard = scoreboard.map(({ name, score }) => ({ name, score }));
        const finalGameState: any = {
          ...game.getState(),
          state: GameState.GAME_END,
          scoreboard: formattedScoreboard,
          gameType: gameType,
        };

        console.log(`[Host] Syncing GAME_END state to room ${room.code} with scoreboard:`, formattedScoreboard);

        // Use RoomEngine to sync final state to all parties
        // Force sync to ensure display gets the GAME_END state with scoreboard
        roomEngine.syncGameState(room.code, finalGameState, { force: true });

        // Emit game_ended event to entire room (includes scoreboard and gameType)
        // Also format scoreboard for game_ended event
        io.to(room.code).emit('game_ended', { scoreboard: formattedScoreboard, gameType });

        // Destroy the game
        roomEngine.endGame(room.code);
        
        // Clean up sync data for this room
        roomEngine.syncEngine.cleanupRoom(room.code);
      } else {
        // No game exists, but still need to sync all parties
        // Transform scoreboard to match client format
        const formattedScoreboard = scoreboard.map(({ name, score }) => ({ name, score }));
        const finalState = {
          state: GameState.GAME_END,
          gameType: gameType,
          round: 0,
          maxRounds: 0,
          startedAt: 0,
          scores: {},
          scoreboard: formattedScoreboard,
        };

        console.log(`[Host] Syncing GAME_END state (no game) to room ${room.code} with scoreboard:`, formattedScoreboard);

        // Use RoomEngine to sync final state
        roomEngine.syncGameState(room.code, finalState, { force: true });

        // Emit game_ended event to entire room
        io.to(room.code).emit('game_ended', { scoreboard: formattedScoreboard, gameType });

        roomEngine.endGame(room.code);
        
        // Clean up sync data for this room
        roomEngine.syncEngine.cleanupRoom(room.code);
      }

      // Mark action as processed
      markHostActionProcessed(actionId, room.code);
      
      console.log(`[Host] Successfully ended game in room ${room.code}`);
      if (actualCallback) actualCallback({ success: true, actionId });
    } catch (error: any) {
      const errorMsg = error?.message || 'Failed to end game';
      console.error(`[Host] Error ending game in room ${room.code}:`, error);
      socket.emit('error', errorMsg);
      if (callback) callback({ success: false, error: errorMsg });
    }
  });

  socket.on('pause_game', (actionId?: string) => {
    const actualActionId = actionId || generateHostActionId();
    const isDuplicate = isHostActionProcessed(actualActionId);
    
    if (isDuplicate) {
      console.log(`[Host] Duplicate pause_game action detected: ${actualActionId.substring(0, 16)}`);
      return;
    }
    
    if (!checkRateLimit()) return;

    const roomInfo = roomEngine.getRoomBySocketId(socket.id);
    if (!roomInfo || !roomInfo.isHost) return;

    // Check host-control permission
    if (!checkHostControlPermission(socket, roomEngine)) {
      socket.emit('error', 'Only host controller can perform this action');
      console.log(`[Host] Permission denied: pause_game from socket ${socket.id.substring(0, 8)}`);
      return;
    }

    const room = roomInfo.room;

    roomEngine.pauseGame(room.code);
    markHostActionProcessed(actualActionId, room.code);
    // SyncEngine will handle state sync via broadcastGameState
    broadcastGameState(room.code);
  });

  socket.on('resume_game', (actionId?: string) => {
    const actualActionId = actionId || generateHostActionId();
    const isDuplicate = isHostActionProcessed(actualActionId);
    
    if (isDuplicate) {
      console.log(`[Host] Duplicate resume_game action detected: ${actualActionId.substring(0, 16)}`);
      return;
    }
    
    if (!checkRateLimit()) return;

    const roomInfo = roomEngine.getRoomBySocketId(socket.id);
    if (!roomInfo || !roomInfo.isHost) return;

    // Check host-control permission
    if (!checkHostControlPermission(socket, roomEngine)) {
      socket.emit('error', 'Only host controller can perform this action');
      console.log(`[Host] Permission denied: resume_game from socket ${socket.id.substring(0, 8)}`);
      return;
    }

    const room = roomInfo.room;

    roomEngine.resumeGame(room.code);
    markHostActionProcessed(actualActionId, room.code);
    // SyncEngine will handle state sync via broadcastGameState
    broadcastGameState(room.code);
  });

  socket.on('kick_player', (targetPlayerId: string, callback) => {
    if (!checkRateLimit()) return;

    const roomInfo = roomEngine.getRoomBySocketId(socket.id);
    if (!roomInfo || !roomInfo.isHost) {
      callback({ success: false, error: 'Only host can kick players' });
      return;
    }

    // Check host-control permission
    if (!checkHostControlPermission(socket, roomEngine)) {
      callback({ success: false, error: 'Only host controller can perform this action' });
      console.log(`[Host] Permission denied: kick_player from socket ${socket.id.substring(0, 8)}`);
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

    // Sync players list to all parties using RoomEngine
    roomEngine.syncPlayerList(room.code);

    // Sync game state using RoomEngine (handles both active game and lobby state)
    roomEngine.syncGameState(room.code, undefined, { force: true });
    const game = roomEngine.getGame(room.code);
    if (game) {
      const gameState = game.getState();
      console.log(`[Host] Synced game state after kicking player ${targetPlayerId} from room ${room.code}, state: ${gameState.state}`);
    } else {
      console.log(`[Host] Synced LOBBY state after kicking player ${targetPlayerId} from room ${room.code}`);
    }

    callback({ success: true, message: `Player ${player?.name} was removed` });
    console.log(`[Host] Player ${targetPlayerId} kicked from room ${room.code}`);
  });

  // ========================================================================
  // TRIVIA QUESTION SETS MANAGEMENT
  // ========================================================================

  socket.on('list_question_sets', async (callback) => {
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
        .from('question_sets')
        .select('id, name, description, question_count')
        .eq('host_id', authUser.userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[Host] Error listing question sets:', error);
        callback({ success: false, error: error.message });
        return;
      }

      callback({
        success: true,
        sets: sets || [],
      });
    } catch (error: any) {
      console.error('[Host] List question sets error:', error);
      callback({ success: false, error: error.message || 'Failed to list question sets' });
    }
  });

  socket.on('create_question_set', async (name: string, description: string | undefined, callback) => {
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
        callback({ success: false, error: 'Question set name is required' });
        return;
      }

      // Generate unique ID
      const setId = `set_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

      const { data, error } = await supabase
        .from('question_sets')
        .insert({
          id: setId,
          name: name.trim(),
          description: description?.trim() || null,
          host_id: authUser.userId,
          question_count: 0,
        })
        .select('id, name, description, question_count')
        .single();

      if (error) {
        console.error('[Host] Error creating question set:', error);
        callback({ success: false, error: error.message });
        return;
      }

      callback({
        success: true,
        set: data,
      });
    } catch (error: any) {
      console.error('[Host] Create question set error:', error);
      callback({ success: false, error: error.message || 'Failed to create question set' });
    }
  });

  socket.on('get_questions_for_set', async (setId: string, callback) => {
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
        .from('question_sets')
        .select('id, host_id')
        .eq('id', setId)
        .single();

      if (setError || !setData || setData.host_id !== authUser.userId) {
        callback({ success: false, error: 'Question set not found or access denied' });
        return;
      }

      const { data: questions, error } = await supabase
        .from('trivia_questions')
        .select('id, question, answers, correct_index, difficulty, category, image_url, translations')
        .eq('set_id', setId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[Host] Error loading questions:', error);
        callback({ success: false, error: error.message });
        return;
      }

      callback({
        success: true,
        questions: questions || [],
      });
    } catch (error: any) {
      console.error('[Host] Get questions for set error:', error);
      callback({ success: false, error: error.message || 'Failed to load questions' });
    }
  });

  socket.on('add_question_to_set', async (setId: string, question: any, callback) => {
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
        .from('question_sets')
        .select('id, host_id')
        .eq('id', setId)
        .single();

      if (setError || !setData || setData.host_id !== authUser.userId) {
        callback({ success: false, error: 'Question set not found or access denied' });
        return;
      }

      const { data, error } = await supabase
        .from('trivia_questions')
        .insert({
          question: question.question,
          answers: question.answers,
          correct_index: question.correctIndex,
          difficulty: question.difficulty || 'medium',
          category: question.category || null,
          image_url: question.imageUrl || null,
          set_id: setId,
          translations: question.translations || null,
        })
        .select('id, question, answers, correct_index, difficulty, category, image_url, translations')
        .single();

      if (error) {
        console.error('[Host] Error adding question:', error);
        callback({ success: false, error: error.message });
        return;
      }

      callback({
        success: true,
        question: data,
      });
    } catch (error: any) {
      console.error('[Host] Add question to set error:', error);
      callback({ success: false, error: error.message || 'Failed to add question' });
    }
  });

  socket.on('set_room_question_set', async (roomCode: string, setId: string | null, callback) => {
    if (!checkRateLimit()) return;

    try {
      const roomInfo = roomEngine.getRoomBySocketId(socket.id);
      if (!roomInfo || !roomInfo.isHost) {
        callback({ success: false, error: 'Only host can set question set' });
        return;
      }

      if (!supabase) {
        callback({ success: false, error: 'Database not available' });
        return;
      }

      const normalizedCode = roomCode.toUpperCase();

      // Get current game settings
      const { data: currentSettings, error: fetchError } = await supabase
        .from('game_settings')
        .select('settings')
        .eq('room_code', normalizedCode)
        .eq('game_type', 'TRIVIA_ROYALE')
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('[Host] Error fetching game settings:', fetchError);
        callback({ success: false, error: fetchError.message });
        return;
      }

      const currentSettingsObj = currentSettings?.settings || {};
      const updatedSettings = {
        ...currentSettingsObj,
        customQuestionSetId: setId,
      };

      const { error: updateError } = await supabase
        .from('game_settings')
        .upsert({
          room_code: normalizedCode,
          game_type: 'TRIVIA_ROYALE',
          settings: updatedSettings,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'room_code,game_type'
        });

      if (updateError) {
        console.error('[Host] Error updating game settings:', updateError);
        callback({ success: false, error: updateError.message });
        return;
      }

      callback({ success: true });
    } catch (error: any) {
      console.error('[Host] Set room question set error:', error);
      callback({ success: false, error: error.message || 'Failed to set question set' });
    }
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

      // Check host-control permission
      if (!checkHostControlPermission(socket, roomEngine)) {
        callback({ success: false, error: 'Only host controller can perform this action' });
        console.log(`[Host] Permission denied: set_room_item_set from socket ${socket.id.substring(0, 8)}`);
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
      let roomInfo = roomEngine.getRoomBySocketId(socket.id);
      if (!roomCode) {
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

      // Get roomInfo if not already retrieved
      if (!roomInfo) {
        roomInfo = roomEngine.getRoomBySocketId(socket.id);
      }

      // Check host-control permission (but allow if roomInfo doesn't exist yet - might be during reconnect)
      if (roomInfo && roomInfo.isHost) {
        const socketRole = (socket.data as any)?.role || roomEngine.connectionManager.getSocketRole(socket.id);
        const isHostControl = socketRole === 'host-control';
        if (!isHostControl) {
          console.log(`[Host] Permission check: socket role=${socketRole}, isHost=${roomInfo.isHost}, denying update_room_settings`);
          cb({ success: false, error: 'Only host controller can perform this action' });
          return;
        }
        console.log(`[Host] Permission granted: socket role=${socketRole}, allowing update_room_settings`);
      } else if (!roomInfo) {
        // Room not in memory - might be during reconnect, allow if authenticated as host
        console.log(`[Host] Room not in memory, checking database authorization...`);
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

      if (Object.keys(themeUpdates).length > 0) {
        console.log(`[Host] Updating theme for room ${roomCode}:`, themeUpdates);
      }

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
      console.log(`[Host] Saving room settings to database for room ${roomCode}...`);
      const { error: updateError, data: updateData } = await supabase
        .from('rooms')
        .update({
          ...roomUpdates,
          settings: updatedSettings,
        })
        .eq('code', roomCode)
        .select();

      if (updateError) {
        console.error('[Host] Error updating room settings:', updateError);
        cb({ success: false, error: updateError.message });
        return;
      }

      console.log(`[Host] ✅ Successfully saved room settings for room ${roomCode}`, {
        theme: updatedTheme,
        updatedRows: updateData?.length || 0,
      });

      // Update in-memory room if it exists
      // Reuse roomInfo from earlier in the function
      if (!roomInfo) {
        roomInfo = roomEngine.getRoomBySocketId(socket.id);
      }
      if (roomInfo && roomInfo.isHost && roomInfo.room.code === roomCode) {
        const room = roomInfo.room;
        room.settings = {
          ...room.settings,
          theme: updatedTheme,
        };
      }

      // Sync settings update to room using RoomEngine (with ACK tracking)
      const settingsUpdate = {
        ...roomUpdates,
        ...themeUpdates,
      };
      roomEngine.syncSettings(roomCode, settingsUpdate);

      console.log(`[Host] Sending success callback to socket ${socket.id.substring(0, 8)} for room ${roomCode}`);
      cb({ success: true });
      console.log(`[Host] Callback sent successfully for room ${roomCode}`);
    } catch (error: any) {
      console.error('[Host] Update room settings error:', error);
      cb({ success: false, error: error.message || 'Failed to update room settings' });
    }
  });

  // ========================================================================
  // JUKEBOX CONTROL (HOST ONLY)
  // ========================================================================

  socket.on('jukebox_control', (roomCode: string, action: 'play' | 'pause' | 'next' | 'previous' | 'select' | 'shuffle' | 'repeat' | 'volume' | 'seek', data?: any) => {
    if (!checkRateLimit()) return;

    // Check host-control permission
    if (!checkHostControlPermission(socket, roomEngine)) {
      console.log(`[Host] Jukebox control denied for socket ${socket.id.substring(0, 8)}: not host-control`);
      return;
    }

    const roomInfo = roomEngine.getRoomBySocketId(socket.id);
    if (!roomInfo || !roomInfo.isHost || roomInfo.room.code !== roomCode.toUpperCase()) {
      console.log(`[Host] Jukebox control denied: not host of room ${roomCode}`);
      return;
    }

    const normalizedRoomCode = roomCode.toUpperCase();
    const currentState = roomEngine.roomManager.getJukeboxState(normalizedRoomCode) || {
      currentTrack: -1,
      isPlaying: false,
      shuffle: false,
      repeat: 'all' as 'none' | 'one' | 'all',
      volume: 0.3,
    };

    let newState = { ...currentState };

    try {
      switch (action) {
        case 'play':
          newState.isPlaying = true;
          break;

        case 'pause':
          newState.isPlaying = false;
          break;

        case 'next':
          // Increment track, wrapping around
          if (data?.maxTracks && data.maxTracks > 0) {
            newState.currentTrack = (currentState.currentTrack + 1) % data.maxTracks;
          }
          break;

        case 'previous':
          // Decrement track, wrapping around
          if (data?.maxTracks && data.maxTracks > 0) {
            newState.currentTrack = currentState.currentTrack <= 0 
              ? data.maxTracks - 1 
              : currentState.currentTrack - 1;
          }
          break;

        case 'select':
          // Select specific track
          if (data?.trackIndex !== undefined && data.trackIndex >= 0) {
            newState.currentTrack = data.trackIndex;
          }
          break;

        case 'shuffle':
          // Toggle shuffle
          newState.shuffle = !currentState.shuffle;
          break;

        case 'repeat':
          // Cycle through repeat modes: none -> one -> all -> none
          if (currentState.repeat === 'none') {
            newState.repeat = 'one';
          } else if (currentState.repeat === 'one') {
            newState.repeat = 'all';
          } else {
            newState.repeat = 'none';
          }
          break;

        case 'volume':
          // Set volume
          if (data?.volume !== undefined && data.volume >= 0 && data.volume <= 1) {
            newState.volume = data.volume;
          }
          break;

        case 'seek':
          // Seek is handled client-side, but we can log it
          console.log(`[Host] Jukebox seek requested for room ${normalizedRoomCode}`);
          break;

        default:
          console.warn(`[Host] Unknown jukebox action: ${action}`);
          return;
      }

      // Update jukebox state in RoomManager
      roomEngine.roomManager.setJukeboxState(normalizedRoomCode, newState);

      // Broadcast updated state to all clients in room
      io.to(normalizedRoomCode).emit('jukebox_state', newState);

      console.log(`[Host] Jukebox ${action} for room ${normalizedRoomCode}:`, newState);
    } catch (error: any) {
      console.error(`[Host] Jukebox control error for room ${normalizedRoomCode}:`, error);
    }
  });
}

