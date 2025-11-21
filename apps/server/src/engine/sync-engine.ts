import { Server, Socket } from 'socket.io';
import { GameState, GameType, Room, Player } from '@christmas/core';
import type { RoomManager } from '../managers/room-manager.js';
import type { ConnectionManager } from './connection-manager.js';
import type { GameManager } from './game-manager.js';

export type ClientRole = 'player' | 'host-control' | 'host-display';

export interface SyncOptions {
  /** Custom event name (defaults to role-based event) */
  eventName?: string;
  /** Include version and timestamp in state */
  includeVersion?: boolean;
  /** Force sync even if state hasn't changed */
  force?: boolean;
  /** Skip certain client types */
  skipRoles?: ClientRole[];
  /** Additional metadata to include */
  metadata?: Record<string, any>;
}

export interface SyncedState {
  [key: string]: any;
  version?: number;
  timestamp?: number;
}

/**
 * SyncEngine centralizes all state synchronization logic.
 * 
 * Responsibilities:
 * - Centralized state synchronization for all client types
 * - Role-based event routing (player, host-control, host-display)
 * - State versioning and timestamping
 * - Reconnection state recovery
 * - Consistent state format across all clients
 */
export class SyncEngine {
  private io: Server | null = null;
  private roomManager: RoomManager | null = null;
  private connectionManager: ConnectionManager | null = null;
  private gameManager: GameManager | null = null;
  
  // State versioning per room
  private roomVersions: Map<string, number> = new Map();
  
  // Track last synced state per socket (for conflict detection)
  private lastSyncedVersion: Map<string, number> = new Map();
  
  // Track last synced timestamp per room (for sound events)
  private lastStateTransition: Map<string, { state: GameState; timestamp: number }> = new Map();
  
  // Track last sound event per room (for debouncing)
  private lastSoundEvent: Map<string, { sound: string; state: GameState; timestamp: number }> = new Map();

  // ACK tracking data structures
  // Track which sockets need to ACK each version: Map<roomCode, Map<version, Set<socketId>>>
  private pendingAcks: Map<string, Map<number, Set<string>>> = new Map();
  
  // Track which versions each socket has ACKed: Map<roomCode, Map<socketId, Set<version>>>
  private ackReceived: Map<string, Map<string, Set<number>>> = new Map();
  
  // Track missing ACKs per socket: Map<roomCode, Map<socketId, Set<version>>>
  private missingAcks: Map<string, Map<string, Set<number>>> = new Map();
  
  // Track state snapshots for resync: Map<roomCode, Map<version, SyncedState>>
  private stateSnapshots: Map<string, Map<number, SyncedState>> = new Map();
  
  // Track player list versions per room
  private playerListVersions: Map<string, number> = new Map();
  
  // Track player list snapshots for resync: Map<roomCode, Map<version, Player[]>>
  private playerListSnapshots: Map<string, Map<number, Player[]>> = new Map();
  
  // Track settings versions per room
  private settingsVersions: Map<string, number> = new Map();
  
  // Track settings snapshots for resync: Map<roomCode, Map<version, any>>
  private settingsSnapshots: Map<string, Map<number, any>> = new Map();
  
  // ACK metrics tracking
  private ackMetrics: Map<string, {
    totalSent: number;
    totalAcked: number;
    totalMissing: number;
    avgLatency: number;
    latencySamples: number[];
  }> = new Map();

  // Keep-alive metrics tracking
  private keepAliveMetrics: Map<string, {
    totalSent: number;
    totalAcked: number;
    totalFailed: number;
    lastKeepAlive: Map<string, number>; // socketId -> timestamp
  }> = new Map();

  /**
   * Initialize SyncEngine with required dependencies
   */
  initialize(
    io: Server,
    roomManager: RoomManager,
    connectionManager: ConnectionManager,
    gameManager: GameManager
  ): void {
    this.io = io;
    this.roomManager = roomManager;
    this.connectionManager = connectionManager;
    this.gameManager = gameManager;
    console.log('[SyncEngine] Initialized');
  }

  /**
   * Main sync method - synchronizes state to all appropriate clients
   */
  syncState(
    roomCode: string,
    state: any,
    options: SyncOptions = {}
  ): void {
    if (!this.io || !this.roomManager) {
      console.warn('[SyncEngine] Cannot sync state: not initialized');
      return;
    }

    const room = this.roomManager.getRoom(roomCode);
    if (!room) {
      console.log(`[SyncEngine] Room ${roomCode} not found`);
      return;
    }

    // Increment version for this room
    const version = (this.roomVersions.get(roomCode) || 0) + 1;
    this.roomVersions.set(roomCode, version);

    // Prepare synced state with versioning
    const syncedState: SyncedState = { ...state };
    if (options.includeVersion !== false) {
      syncedState.version = version;
      syncedState.timestamp = Date.now();
    }

    // Add metadata if provided
    if (options.metadata) {
      Object.assign(syncedState, options.metadata);
    }

    // Detect state transitions for sound events and state events
    this.handleStateTransitions(roomCode, state.state, state);

    // Store state snapshot for resync
    if (!this.stateSnapshots.has(roomCode)) {
      this.stateSnapshots.set(roomCode, new Map());
    }
    this.stateSnapshots.get(roomCode)!.set(version, { ...syncedState });

    // Record expected ACKs before emitting (non-blocking)
    this.recordExpectedAcks(roomCode, version, options);

    // Sync to all parties
    this.syncToPlayers(roomCode, syncedState, options);
    this.syncToHost(roomCode, syncedState, options);
    this.syncToDisplay(roomCode, syncedState, options);

    console.log(`[SyncEngine] Synced state v${version} to room ${roomCode}, state: ${state.state}`);
  }

  /**
   * Sync state to all players in a room
   */
  syncToPlayers(
    roomCode: string,
    state: SyncedState,
    options: SyncOptions = {}
  ): void {
    if (!this.io || !this.roomManager || options.skipRoles?.includes('player')) {
      return;
    }

    const room = this.roomManager.getRoom(roomCode);
    if (!room) return;

    const eventName = options.eventName || 'game_state_update';
    let syncedCount = 0;

    room.players.forEach((player) => {
      const playerSocket = this.io!.sockets.sockets.get(player.id);
      if (playerSocket) {
        // Get personalized state if gameManager is available
        let clientState = state;
        if (this.gameManager) {
          const game = this.gameManager.getGame(roomCode);
          if (game) {
            try {
              const personalizedState = game.getClientState(player.id);
              // Merge personalized state with synced state
              clientState = {
                ...state,
                ...personalizedState,
                version: state.version,
                timestamp: state.timestamp,
              };
            } catch (e) {
              // Fallback to generic state if getClientState fails
              console.warn(`[SyncEngine] Failed to get personalized state for player ${player.id.substring(0, 8)}:`, e);
            }
          }
        }

        playerSocket.emit(eventName, clientState);
        this.lastSyncedVersion.set(player.id, state.version || 0);
        syncedCount++;
      }
    });

    if (syncedCount > 0) {
      console.log(`[SyncEngine] Synced to ${syncedCount} player(s) in room ${roomCode}`);
    }
  }

  /**
   * Sync state to host (control and display)
   */
  syncToHost(
    roomCode: string,
    state: SyncedState,
    options: SyncOptions = {}
  ): void {
    if (!this.io || !this.roomManager || options.skipRoles?.includes('host-control')) {
      return;
    }

    const room = this.roomManager.getRoom(roomCode);
    if (!room) return;

    const hostSocket = this.io.sockets.sockets.get(room.hostId);
    if (!hostSocket) {
      return;
    }

    // Get reference player ID for host view
    const firstPlayerId = room.players.size > 0 ? room.players.keys().next().value : room.hostId;
    
    // Get personalized state if gameManager is available
    let clientState = state;
    if (this.gameManager && firstPlayerId) {
      const game = this.gameManager.getGame(roomCode);
      if (game) {
        try {
          const personalizedState = game.getClientState(firstPlayerId);
          clientState = {
            ...state,
            ...personalizedState,
            version: state.version,
            timestamp: state.timestamp,
          };
        } catch (e) {
          console.warn(`[SyncEngine] Failed to get personalized state for host:`, e);
        }
      }
    }

    const eventName = options.eventName || 'game_state_update';
    hostSocket.emit(eventName, clientState);
    this.lastSyncedVersion.set(room.hostId, state.version || 0);
    
    console.log(`[SyncEngine] Synced to host ${room.hostId.substring(0, 8)} in room ${roomCode}`);
  }

  /**
   * Sync state to display sockets (host-display role)
   */
  syncToDisplay(
    roomCode: string,
    state: SyncedState,
    options: SyncOptions = {}
  ): void {
    if (!this.io || !this.roomManager) {
      console.error(`[SyncEngine] Cannot sync to display: SyncEngine not fully initialized (io: ${!!this.io}, roomManager: ${!!this.roomManager})`);
      return;
    }

    if (options.skipRoles?.includes('host-display')) {
      console.log(`[SyncEngine] Skipping display sync for room ${roomCode} (skipRoles includes host-display)`);
      return;
    }

    const room = this.roomManager.getRoom(roomCode);
    if (!room) {
      console.warn(`[SyncEngine] Cannot sync to display: Room ${roomCode} not found`);
      return;
    }

    const roomSockets = this.io.sockets.adapter.rooms.get(roomCode);
    if (!roomSockets) {
      console.warn(`[SyncEngine] Cannot sync to display: No sockets in room ${roomCode}`);
      return;
    }

    // Get reference player ID for host view
    const firstPlayerId = room.players.size > 0 ? room.players.keys().next().value : room.hostId;
    
    // Get personalized state if gameManager is available
    // IMPORTANT: Skip personalization for GAME_END state since game might be destroyed
    let clientState = state;
    if (this.gameManager && firstPlayerId && state.state !== GameState.GAME_END) {
      const game = this.gameManager.getGame(roomCode);
      if (game) {
        try {
          const personalizedState = game.getClientState(firstPlayerId);
          // Merge personalized state with base state, ensuring game-specific data is included
          clientState = {
            ...state,
            ...personalizedState,
            version: state.version,
            timestamp: state.timestamp,
          };
          
          // Log game-specific data to verify it's included
          const hasGameData = !!(clientState.currentQuestion || clientState.currentItem || 
                                 clientState.currentPrompt || clientState.availableEmojis ||
                                 clientState.playerCard || clientState.currentCard || 
                                 clientState.calledItems || clientState.playerCards);
          console.log(`[SyncEngine] 📺 Personalized state for display includes game data:`, {
            state: clientState.state,
            gameType: clientState.gameType,
            hasQuestion: !!clientState.currentQuestion,
            hasItem: !!clientState.currentItem,
            hasPrompt: !!clientState.currentPrompt,
            hasEmojis: !!clientState.availableEmojis,
            hasCard: !!clientState.playerCard || !!clientState.currentCard,
            hasGameData: hasGameData
          });
        } catch (e) {
          console.warn(`[SyncEngine] ⚠️ Failed to get personalized state for display:`, e);
          // Fallback to generic state if personalization fails
          console.log(`[SyncEngine] 🔄 Using generic state as fallback for display`);
          clientState = state;
        }
      } else {
        console.warn(`[SyncEngine] ⚠️ Game not found for room ${roomCode} - using generic state`);
      }
    } else {
      // Log why we're not personalizing
      if (state.state === GameState.GAME_END) {
        console.log(`[SyncEngine] 📺 Using direct state for GAME_END (game may be destroyed)`);
      } else if (!firstPlayerId) {
        console.warn(`[SyncEngine] ⚠️ No firstPlayerId available for personalization (room has ${room.players.size} players)`);
      } else if (!this.gameManager) {
        console.warn(`[SyncEngine] ⚠️ GameManager not available for personalization`);
      }
    }
    // For GAME_END state, use the state directly (already includes scoreboard)

    const eventName = options.eventName || 'display_sync_state';
    let displayCount = 0;

    for (const socketId of roomSockets) {
      const socket = this.io.sockets.sockets.get(socketId);
      if (!socket) continue;

      // Check role from socket.data or ConnectionManager
      let role: ClientRole | undefined;
      if (this.connectionManager) {
        role = this.connectionManager.getSocketRole(socketId);
      }
      if (!role) {
        role = (socket.data as any)?.role;
      }

      if (role === 'host-display') {
        // Log game-specific data being sent
        const gameDataSummary = {
          hasQuestion: !!clientState.currentQuestion,
          hasItem: !!clientState.currentItem,
          hasPrompt: !!clientState.currentPrompt,
          hasEmojis: !!clientState.availableEmojis,
          hasCard: !!(clientState.playerCard || clientState.currentCard),
          round: clientState.round,
          gameType: clientState.gameType
        };
        console.log(`[SyncEngine] ✅ Found display socket ${socketId.substring(0, 8)} in room ${roomCode}, sending ${eventName}`, {
          state: clientState.state,
          gameData: gameDataSummary,
          scoreboardLength: clientState.scoreboard?.length || 0
        });
        socket.emit(eventName, clientState);
        this.lastSyncedVersion.set(socketId, state.version || 0);
        displayCount++;
      } else if (role) {
        // Log other roles for debugging (but don't spam)
        if (state.state === GameState.STARTING || state.state === GameState.GAME_END) {
          console.log(`[SyncEngine] Socket ${socketId.substring(0, 8)} has role ${role} (not host-display), skipping`);
        }
      } else {
        // Log missing roles only for important state changes
        if (state.state === GameState.STARTING || state.state === GameState.GAME_END) {
          console.warn(`[SyncEngine] ⚠️ Socket ${socketId.substring(0, 8)} in room ${roomCode} has no role assigned`);
        }
      }
    }

    if (displayCount > 0) {
      console.log(`[SyncEngine] Synced to ${displayCount} display socket(s) in room ${roomCode}, state: ${state.state}, scoreboard: ${state.scoreboard?.length || 0} entries`);
    }
  }

  /**
   * Sync state to a specific player socket
   */
  syncToPlayer(
    roomCode: string,
    socketId: string,
    state: SyncedState,
    options: SyncOptions = {}
  ): void {
    if (!this.io || !this.roomManager) {
      return;
    }

    const room = this.roomManager.getRoom(roomCode);
    if (!room) return;

    const playerSocket = this.io.sockets.sockets.get(socketId);
    if (!playerSocket) return;

    // Get personalized state if gameManager is available
    let clientState = state;
    if (this.gameManager) {
      const game = this.gameManager.getGame(roomCode);
      if (game) {
        try {
          const personalizedState = game.getClientState(socketId);
          clientState = {
            ...state,
            ...personalizedState,
            version: state.version,
            timestamp: state.timestamp,
          };
        } catch (e) {
          console.warn(`[SyncEngine] Failed to get personalized state for player ${socketId.substring(0, 8)}:`, e);
        }
      }
    }

    const eventName = options.eventName || 'game_state_update';
    playerSocket.emit(eventName, clientState);
    this.lastSyncedVersion.set(socketId, state.version || 0);
    
    console.log(`[SyncEngine] Synced to player ${socketId.substring(0, 8)} in room ${roomCode}`);
  }

  /**
   * Sync player list to all parties in a room
   * This ensures host-control, host-display, and all players receive the updated player list
   */
  syncPlayers(roomCode: string, players: Player[]): void {
    console.log(`[SyncEngine] 🔵 syncPlayers called for room ${roomCode} with ${players.length} player(s)`);
    
    if (!this.io || !this.roomManager) {
      console.warn('[SyncEngine] ❌ Cannot sync players: not initialized', {
        hasIo: !!this.io,
        hasRoomManager: !!this.roomManager,
      });
      return;
    }

    const room = this.roomManager.getRoom(roomCode);
    if (!room) {
      console.log(`[SyncEngine] ❌ Room ${roomCode} not found for player sync`);
      return;
    }

    // Increment player list version
    const playerListVersion = (this.playerListVersions.get(roomCode) || 0) + 1;
    this.playerListVersions.set(roomCode, playerListVersion);

    // Store player list snapshot for resync
    if (!this.playerListSnapshots.has(roomCode)) {
      this.playerListSnapshots.set(roomCode, new Map());
    }
    this.playerListSnapshots.get(roomCode)!.set(playerListVersion, [...players]);

    const playerCount = players.length;
    const roomUpdateData = {
      players: players,
      playerCount: playerCount,
      version: playerListVersion,
      timestamp: Date.now(),
    };

    // Record expected ACKs for player list update
    this.recordExpectedPlayerListAcks(roomCode, playerListVersion);

    // CRITICAL: Use setImmediate to ensure Socket.IO room membership is fully established
    // before emitting room_update. This prevents race conditions where sockets haven't
    // fully joined the room yet and miss the event.
    setImmediate(() => {
      // Get sockets in room before emitting
      const socketsInRoom = this.io!.sockets.adapter.rooms.get(roomCode);
      const socketCount = socketsInRoom ? socketsInRoom.size : 0;
      const socketIds = socketsInRoom ? Array.from(socketsInRoom).map(id => id.substring(0, 8)).join(', ') : 'none';
      
      console.log(`[SyncEngine] 📢 Emitting room_update v${playerListVersion} to room ${roomCode}: ${playerCount} player(s), ${socketCount} socket(s) in room [${socketIds}]`);
      console.log(`[SyncEngine] 📢 Player names:`, players.map(p => p.name).join(', '));
      
      // Identify host-display sockets for explicit verification
      const hostDisplaySockets: string[] = [];
      const socketRoleMap = new Map<string, ClientRole>();
      const expectedSockets = new Set<string>();
      
      if (socketsInRoom) {
        for (const socketId of socketsInRoom) {
          const socket = this.io!.sockets.sockets.get(socketId);
          if (socket && socket.connected) {
            expectedSockets.add(socketId);
            let role: ClientRole | undefined;
            // Try ConnectionManager first (most reliable)
            if (this.connectionManager) {
              role = this.connectionManager.getSocketRole(socketId);
            }
            // Fallback to socket.data
            if (!role) {
              role = (socket.data as any)?.role;
            }
            // Store role for logging
            if (role) {
              socketRoleMap.set(socketId, role);
            }
            // Track host-display sockets specifically
            if (role === 'host-display') {
              hostDisplaySockets.push(socketId);
              console.log(`[SyncEngine] 📺 Identified host-display socket ${socketId.substring(0, 8)} in room ${roomCode}`);
            }
          }
        }
      }
      
      // Also include host socket if not in room yet (race condition protection)
      const hostSocket = this.io!.sockets.sockets.get(room.hostId);
      if (hostSocket && hostSocket.connected && !expectedSockets.has(room.hostId)) {
        expectedSockets.add(room.hostId);
        console.log(`[SyncEngine] 📢 Host socket ${room.hostId.substring(0, 8)} not in room yet, will emit directly`);
      }
      
      if (hostDisplaySockets.length > 0) {
        console.log(`[SyncEngine] 📺 Found ${hostDisplaySockets.length} host-display socket(s): [${hostDisplaySockets.map(id => id.substring(0, 8)).join(', ')}]`);
      } else {
        // Log all socket roles for debugging
        const roleSummary = Array.from(socketRoleMap.entries()).map(([id, role]) => `${id.substring(0, 8)}:${role}`).join(', ');
        if (roleSummary) {
          console.log(`[SyncEngine] 📊 Socket roles in room ${roomCode}: [${roleSummary}]`);
        }
      }
      
      // Primary: Emit to entire room - this will reach all sockets in the room (host-control, host-display, players)
      // Socket.IO automatically handles room membership
      try {
        this.io!.to(roomCode).emit('room_update', roomUpdateData);
        console.log(`[SyncEngine] ✅ room_update v${playerListVersion} event emitted to room ${roomCode} (${socketCount} socket(s))`);
        
        // EXPLICIT FALLBACK: Also emit directly to host socket if not in room
        if (hostSocket && hostSocket.connected && !socketsInRoom?.has(room.hostId)) {
          try {
            hostSocket.emit('room_update', roomUpdateData);
            console.log(`[SyncEngine] ✅ Emitted room_update directly to host socket ${room.hostId.substring(0, 8)} (not in room yet)`);
          } catch (hostError) {
            console.error(`[SyncEngine] ❌ Failed to emit to host socket ${room.hostId.substring(0, 8)}:`, hostError);
          }
        }
        
        // EXPLICIT FALLBACK: Also emit directly to host-display sockets to guarantee delivery
        // This ensures host-display always receives room_update even if there's a timing issue
        if (hostDisplaySockets.length > 0) {
          let displayEmitCount = 0;
          for (const socketId of hostDisplaySockets) {
            const socket = this.io!.sockets.sockets.get(socketId);
            if (socket && socket.connected) {
              // Verify socket is actually in the room
              const isInRoom = socketsInRoom?.has(socketId) || false;
              if (!isInRoom) {
                console.warn(`[SyncEngine] ⚠️ Host-display socket ${socketId.substring(0, 8)} not in room ${roomCode}, emitting directly anyway`);
              }
              try {
                socket.emit('room_update', roomUpdateData);
                displayEmitCount++;
                console.log(`[SyncEngine] ✅ Emitted room_update directly to host-display socket ${socketId.substring(0, 8)} (${playerCount} players)`);
              } catch (displayError) {
                console.error(`[SyncEngine] ❌ Failed to emit to host-display socket ${socketId.substring(0, 8)}:`, displayError);
              }
            } else {
              console.warn(`[SyncEngine] ⚠️ Host-display socket ${socketId.substring(0, 8)} not connected or not found`);
            }
          }
          console.log(`[SyncEngine] ✅ Fallback: emitted room_update to ${displayEmitCount}/${hostDisplaySockets.length} host-display socket(s)`);
        }
        
        // Verify socket counts match
        if (socketsInRoom && socketsInRoom.size > 0) {
          let connectedCount = 0;
          for (const socketId of socketsInRoom) {
            const socket = this.io!.sockets.sockets.get(socketId);
            if (socket && socket.connected) {
              connectedCount++;
            }
          }
          if (connectedCount !== socketCount) {
            console.warn(`[SyncEngine] ⚠️ Socket count mismatch: ${connectedCount} connected socket(s) vs ${socketCount} socket(s) in room`);
          }
        } else if (socketCount === 0) {
          console.warn(`[SyncEngine] ⚠️ No sockets in room ${roomCode} - room_update may not reach any clients`);
        }
      } catch (emitError) {
        console.error(`[SyncEngine] ❌ Error emitting room_update:`, emitError);
        
        // FALLBACK: If room emit fails, try emitting directly to individual sockets
        if (socketsInRoom && socketsInRoom.size > 0) {
          console.log(`[SyncEngine] 🔄 Attempting fallback: emitting directly to ${socketsInRoom.size} socket(s)`);
          let fallbackSuccessCount = 0;
          for (const socketId of socketsInRoom) {
            const socket = this.io!.sockets.sockets.get(socketId);
            if (socket && socket.connected) {
              try {
                socket.emit('room_update', roomUpdateData);
                fallbackSuccessCount++;
              } catch (fallbackError) {
                console.error(`[SyncEngine] ❌ Failed to emit to socket ${socketId.substring(0, 8)}:`, fallbackError);
              }
            }
          }
          console.log(`[SyncEngine] ✅ Fallback: emitted room_update to ${fallbackSuccessCount}/${socketsInRoom.size} socket(s)`);
        }
      }
    });
  }

  /**
   * Record expected ACKs for player list update
   */
  private recordExpectedPlayerListAcks(roomCode: string, version: number): void {
    if (!this.io || !this.roomManager) return;

    const room = this.roomManager.getRoom(roomCode);
    if (!room) return;

    // Initialize maps if needed
    if (!this.pendingAcks.has(roomCode)) {
      this.pendingAcks.set(roomCode, new Map());
    }

    const pendingAcksForRoom = this.pendingAcks.get(roomCode)!;
    const expectedSockets = new Set<string>();

    // Collect all expected socket IDs
    room.players.forEach((player) => {
      const socket = this.io!.sockets.sockets.get(player.id);
      if (socket && socket.connected) {
        expectedSockets.add(player.id);
      }
    });

    const hostSocket = this.io.sockets.sockets.get(room.hostId);
    if (hostSocket && hostSocket.connected) {
      expectedSockets.add(room.hostId);
    }

    const roomSockets = this.io.sockets.adapter.rooms.get(roomCode);
    if (roomSockets) {
      for (const socketId of roomSockets) {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket && socket.connected) {
          expectedSockets.add(socketId);
        }
      }
    }

    // Record pending ACKs (use negative version to distinguish from state versions)
    const playerListVersionKey = -version; // Negative to avoid conflicts with state versions
    if (!pendingAcksForRoom.has(playerListVersionKey)) {
      pendingAcksForRoom.set(playerListVersionKey, new Set());
    }
    const pendingSet = pendingAcksForRoom.get(playerListVersionKey)!;
    expectedSockets.forEach(socketId => {
      pendingSet.add(socketId);
    });

    // Set timeout to mark missing ACKs (non-blocking, background check)
    setTimeout(() => {
      this.checkMissingPlayerListAcks(roomCode, version);
    }, 2000); // Check after 2 seconds
  }

  /**
   * Check for missing player list ACKs after timeout
   */
  private checkMissingPlayerListAcks(roomCode: string, version: number): void {
    const pendingAcksForRoom = this.pendingAcks.get(roomCode);
    if (!pendingAcksForRoom) return;

    const playerListVersionKey = -version;
    const pendingSet = pendingAcksForRoom.get(playerListVersionKey);
    if (!pendingSet || pendingSet.size === 0) return;

    // Initialize missing ACKs map if needed
    if (!this.missingAcks.has(roomCode)) {
      this.missingAcks.set(roomCode, new Map());
    }

    const missingAcksForRoom = this.missingAcks.get(roomCode)!;

    // Check which sockets haven't ACKed
    pendingSet.forEach(socketId => {
      const ackReceivedForRoom = this.ackReceived.get(roomCode);
      const socketAcks = ackReceivedForRoom?.get(socketId);
      
      if (!socketAcks || !socketAcks.has(playerListVersionKey)) {
        // Missing ACK - record it
        if (!missingAcksForRoom.has(socketId)) {
          missingAcksForRoom.set(socketId, new Set());
        }
        missingAcksForRoom.get(socketId)!.add(playerListVersionKey);

        console.warn(`[SyncEngine] ⚠️ Missing player list ACK from socket ${socketId.substring(0, 8)} for version ${version} in room ${roomCode}`);
      }
    });
  }

  /**
   * Sync state to all parties (players, host-control, host-display)
   */
  syncToAll(
    roomCode: string,
    state: SyncedState,
    options: SyncOptions = {}
  ): void {
    this.syncState(roomCode, state, options);
  }

  /**
   * Get client-specific state for a socket
   */
  getClientState(
    roomCode: string,
    socketId: string,
    role?: ClientRole
  ): SyncedState | null {
    if (!this.roomManager || !this.gameManager) {
      return null;
    }

    const room = this.roomManager.getRoom(roomCode);
    if (!room) return null;

    const game = this.gameManager.getGame(roomCode);
    if (!game) return null;

    // Determine role if not provided
    if (!role) {
      if (this.connectionManager) {
        role = this.connectionManager.getSocketRole(socketId);
      }
      if (!role && socketId === room.hostId) {
        role = 'host-control';
      }
      if (!role) {
        role = 'player';
      }
    }

    // Get reference player ID for host view
    const firstPlayerId = room.players.size > 0 ? room.players.keys().next().value : room.hostId;
    if (!firstPlayerId) {
      return null;
    }
    const referenceId = role === 'player' ? socketId : firstPlayerId;

    try {
      const personalizedState = game.getClientState(referenceId);
      const version = this.roomVersions.get(roomCode) || 0;
      
      return {
        ...personalizedState,
        version,
        timestamp: Date.now(),
      };
    } catch (e) {
      console.warn(`[SyncEngine] Failed to get client state for ${socketId.substring(0, 8)}:`, e);
      return null;
    }
  }

  /**
   * Record expected ACKs for all recipients before emitting state
   */
  private recordExpectedAcks(roomCode: string, version: number, options: SyncOptions = {}): void {
    if (!this.io || !this.roomManager) return;

    const room = this.roomManager.getRoom(roomCode);
    if (!room) return;

    // Initialize maps if needed
    if (!this.pendingAcks.has(roomCode)) {
      this.pendingAcks.set(roomCode, new Map());
    }
    if (!this.ackReceived.has(roomCode)) {
      this.ackReceived.set(roomCode, new Map());
    }

    const pendingAcksForRoom = this.pendingAcks.get(roomCode)!;
    const expectedSockets = new Set<string>();

    // Collect all expected socket IDs based on options
    if (!options.skipRoles?.includes('player')) {
      room.players.forEach((player) => {
        const socket = this.io!.sockets.sockets.get(player.id);
        if (socket && socket.connected) {
          expectedSockets.add(player.id);
        }
      });
    }

    if (!options.skipRoles?.includes('host-control')) {
      const hostSocket = this.io.sockets.sockets.get(room.hostId);
      if (hostSocket && hostSocket.connected) {
        expectedSockets.add(room.hostId);
      }
    }

    if (!options.skipRoles?.includes('host-display')) {
      const roomSockets = this.io.sockets.adapter.rooms.get(roomCode);
      if (roomSockets) {
        for (const socketId of roomSockets) {
          const socket = this.io.sockets.sockets.get(socketId);
          if (socket && socket.connected) {
            let role: ClientRole | undefined;
            if (this.connectionManager) {
              role = this.connectionManager.getSocketRole(socketId);
            }
            if (!role) {
              role = (socket.data as any)?.role;
            }
            if (role === 'host-display') {
              expectedSockets.add(socketId);
            }
          }
        }
      }
    }

    // Record pending ACKs
    if (!pendingAcksForRoom.has(version)) {
      pendingAcksForRoom.set(version, new Set());
    }
    const pendingSet = pendingAcksForRoom.get(version)!;
    expectedSockets.forEach(socketId => {
      pendingSet.add(socketId);
    });

    // Initialize ACK metrics if needed
    if (!this.ackMetrics.has(roomCode)) {
      this.ackMetrics.set(roomCode, {
        totalSent: 0,
        totalAcked: 0,
        totalMissing: 0,
        avgLatency: 0,
        latencySamples: [],
      });
    }

    const metrics = this.ackMetrics.get(roomCode)!;
    metrics.totalSent += expectedSockets.size;

    // Set timeout to mark missing ACKs (non-blocking, background check)
    setTimeout(() => {
      this.checkMissingAcks(roomCode, version);
    }, 2000); // Check after 2 seconds
  }

  /**
   * Check for missing ACKs after timeout
   */
  private checkMissingAcks(roomCode: string, version: number): void {
    const pendingAcksForRoom = this.pendingAcks.get(roomCode);
    if (!pendingAcksForRoom) return;

    const pendingSet = pendingAcksForRoom.get(version);
    if (!pendingSet || pendingSet.size === 0) return;

    // Initialize missing ACKs map if needed
    if (!this.missingAcks.has(roomCode)) {
      this.missingAcks.set(roomCode, new Map());
    }

    const missingAcksForRoom = this.missingAcks.get(roomCode)!;

    // Check which sockets haven't ACKed
    pendingSet.forEach(socketId => {
      const ackReceivedForRoom = this.ackReceived.get(roomCode);
      const socketAcks = ackReceivedForRoom?.get(socketId);
      
      if (!socketAcks || !socketAcks.has(version)) {
        // Missing ACK - record it
        if (!missingAcksForRoom.has(socketId)) {
          missingAcksForRoom.set(socketId, new Set());
        }
        missingAcksForRoom.get(socketId)!.add(version);

        // Update metrics
        const metrics = this.ackMetrics.get(roomCode);
        if (metrics) {
          metrics.totalMissing++;
        }

        console.warn(`[SyncEngine] ⚠️ Missing ACK from socket ${socketId.substring(0, 8)} for version ${version} in room ${roomCode}`);
      }
    });
  }

  /**
   * Sync room settings to all parties with ACK tracking
   */
  syncSettings(roomCode: string, settings: any): void {
    if (!this.io || !this.roomManager) {
      console.warn('[SyncEngine] Cannot sync settings: not initialized');
      return;
    }

    const room = this.roomManager.getRoom(roomCode);
    if (!room) {
      console.log(`[SyncEngine] Room ${roomCode} not found for settings sync`);
      return;
    }

    // Increment settings version for this room
    const version = (this.settingsVersions.get(roomCode) || 0) + 1;
    this.settingsVersions.set(roomCode, version);

    // Prepare synced settings with versioning
    const syncedSettings = {
      ...settings,
      version: version,
      timestamp: Date.now(),
    };

    // Store settings snapshot for resync
    if (!this.settingsSnapshots.has(roomCode)) {
      this.settingsSnapshots.set(roomCode, new Map());
    }
    this.settingsSnapshots.get(roomCode)!.set(version, { ...syncedSettings });

    // Record expected ACKs before emitting
    this.recordExpectedSettingsAcks(roomCode, version);

    // Emit to all sockets in room
    try {
      this.io.to(roomCode).emit('room_settings_updated', syncedSettings);
      console.log(`[SyncEngine] ✅ Synced settings v${version} to room ${roomCode}`);
    } catch (error) {
      console.error(`[SyncEngine] ❌ Error syncing settings:`, error);
    }
  }

  /**
   * Record expected ACKs for settings update
   */
  private recordExpectedSettingsAcks(roomCode: string, version: number): void {
    if (!this.io || !this.roomManager) return;

    const room = this.roomManager.getRoom(roomCode);
    if (!room) return;

    // Initialize maps if needed
    if (!this.pendingAcks.has(roomCode)) {
      this.pendingAcks.set(roomCode, new Map());
    }

    const pendingAcksForRoom = this.pendingAcks.get(roomCode)!;
    const expectedSockets = new Set<string>();

    // Collect all expected socket IDs (all clients need settings)
    room.players.forEach((player) => {
      const socket = this.io!.sockets.sockets.get(player.id);
      if (socket && socket.connected) {
        expectedSockets.add(player.id);
      }
    });

    const hostSocket = this.io.sockets.sockets.get(room.hostId);
    if (hostSocket && hostSocket.connected) {
      expectedSockets.add(room.hostId);
    }

    const roomSockets = this.io.sockets.adapter.rooms.get(roomCode);
    if (roomSockets) {
      for (const socketId of roomSockets) {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket && socket.connected) {
          expectedSockets.add(socketId);
        }
      }
    }

    // Record pending ACKs (use version * 1000 to distinguish from state/player_list versions)
    const settingsVersionKey = version * 1000;
    if (!pendingAcksForRoom.has(settingsVersionKey)) {
      pendingAcksForRoom.set(settingsVersionKey, new Set());
    }
    const pendingSet = pendingAcksForRoom.get(settingsVersionKey)!;
    expectedSockets.forEach(socketId => {
      pendingSet.add(socketId);
    });

    console.log(`[SyncEngine] 📋 Recorded ${expectedSockets.size} expected ACK(s) for settings v${version} in room ${roomCode}`);
  }

  /**
   * Get current settings version for a room
   */
  getSettingsVersion(roomCode: string): number {
    return this.settingsVersions.get(roomCode) || 0;
  }

  /**
   * Handle incoming ACK from client
   */
  handleAck(roomCode: string, socketId: string, version: number, messageType: 'state' | 'player_list' | 'settings' = 'state', ackTimestamp?: number): void {
    if (!this.io || !this.roomManager) {
      console.warn('[SyncEngine] Cannot handle ACK: not initialized');
      return;
    }

    const room = this.roomManager.getRoom(roomCode);
    if (!room) {
      console.warn(`[SyncEngine] Cannot handle ACK: Room ${roomCode} not found`);
      return;
    }

    // Initialize maps if needed
    if (!this.ackReceived.has(roomCode)) {
      this.ackReceived.set(roomCode, new Map());
    }
    if (!this.pendingAcks.has(roomCode)) {
      this.pendingAcks.set(roomCode, new Map());
    }
    if (!this.missingAcks.has(roomCode)) {
      this.missingAcks.set(roomCode, new Map());
    }

    const ackReceivedForRoom = this.ackReceived.get(roomCode)!;
    const pendingAcksForRoom = this.pendingAcks.get(roomCode)!;
    const missingAcksForRoom = this.missingAcks.get(roomCode)!;

    // Handle version mapping based on message type
    let versionKey = version;
    if (messageType === 'player_list' && version > 0) {
      // Player list uses negative versions
      versionKey = -version;
    } else if (messageType === 'settings') {
      // Settings uses version * 1000
      versionKey = version * 1000;
    }

    // Record ACK
    if (!ackReceivedForRoom.has(socketId)) {
      ackReceivedForRoom.set(socketId, new Set());
    }
    ackReceivedForRoom.get(socketId)!.add(versionKey);

    // Remove from pending ACKs
    const pendingSet = pendingAcksForRoom.get(versionKey);
    if (pendingSet) {
      const hadSocket = pendingSet.has(socketId);
      pendingSet.delete(socketId);
      if (pendingSet.size === 0) {
        pendingAcksForRoom.delete(versionKey);
      }
      if (!hadSocket) {
        console.warn(`[SyncEngine] ⚠️ Received ACK for ${messageType} version ${version} (key ${versionKey}) from socket ${socketId.substring(0, 8)} but socket was not in pending set`);
      }
    } else {
      console.warn(`[SyncEngine] ⚠️ Received ACK for ${messageType} version ${version} (key ${versionKey}) from socket ${socketId.substring(0, 8)} but no pending set found for this version`);
    }

    // Remove from missing ACKs
    const missingSet = missingAcksForRoom.get(socketId);
    if (missingSet) {
      missingSet.delete(versionKey);
      if (missingSet.size === 0) {
        missingAcksForRoom.delete(socketId);
      }
    }

    // Update metrics
    if (!this.ackMetrics.has(roomCode)) {
      this.ackMetrics.set(roomCode, {
        totalSent: 0,
        totalAcked: 0,
        totalMissing: 0,
        avgLatency: 0,
        latencySamples: [],
      });
    }

    const metrics = this.ackMetrics.get(roomCode)!;
    metrics.totalAcked++;

    // Calculate latency if timestamp provided
    if (ackTimestamp) {
      const latency = Date.now() - ackTimestamp;
      metrics.latencySamples.push(latency);
      // Keep only last 100 samples
      if (metrics.latencySamples.length > 100) {
        metrics.latencySamples.shift();
      }
      // Calculate average latency
      const sum = metrics.latencySamples.reduce((a, b) => a + b, 0);
      metrics.avgLatency = sum / metrics.latencySamples.length;

      // Log slow ACKs
      if (latency > 1000) {
        console.warn(`[SyncEngine] ⚠️ Slow ACK from socket ${socketId.substring(0, 8)}: ${latency}ms for version ${version} in room ${roomCode}`);
      }
    }

    console.log(`[SyncEngine] ✅ ACK received from socket ${socketId.substring(0, 8)} for ${messageType} version ${version} (key ${versionKey}) in room ${roomCode}`);
  }

  /**
   * Get list of missing state versions for a socket
   */
  getMissingStates(roomCode: string, socketId: string): {
    stateVersions: number[];
    playerListVersion: number | null;
  } {
    const missingAcksForRoom = this.missingAcks.get(roomCode);
    if (!missingAcksForRoom) {
      return { stateVersions: [], playerListVersion: null };
    }

    const missingSet = missingAcksForRoom.get(socketId);
    const stateVersions = missingSet ? Array.from(missingSet).sort((a, b) => a - b) : [];

    // Get current player list version
    const playerListVersion = this.playerListVersions.get(roomCode) || null;

    return { stateVersions, playerListVersion };
  }

  /**
   * Resync socket with missing states
   */
  resyncSocket(roomCode: string, socketId: string, role?: ClientRole): void {
    if (!this.io || !this.roomManager) {
      console.warn('[SyncEngine] Cannot resync socket: not initialized');
      return;
    }

    const socket = this.io.sockets.sockets.get(socketId);
    if (!socket || !socket.connected) {
      console.warn(`[SyncEngine] Cannot resync socket ${socketId.substring(0, 8)}: not connected`);
      return;
    }

    const room = this.roomManager.getRoom(roomCode);
    if (!room) {
      console.warn(`[SyncEngine] Cannot resync socket: Room ${roomCode} not found`);
      return;
    }

    const { stateVersions, playerListVersion } = this.getMissingStates(roomCode, socketId);

    console.log(`[SyncEngine] 🔄 Resyncing socket ${socketId.substring(0, 8)} in room ${roomCode}: ${stateVersions.length} missing state(s), playerListVersion: ${playerListVersion}`);

    // Determine event name based on role
    let eventName = 'game_state_update';
    if (role === 'host-display') {
      eventName = 'display_sync_state';
    }

    // Resend missing state versions
    const stateSnapshotsForRoom = this.stateSnapshots.get(roomCode);
    if (stateSnapshotsForRoom) {
      stateVersions.forEach(version => {
        const stateSnapshot = stateSnapshotsForRoom.get(version);
        if (stateSnapshot) {
          // Get personalized state if needed
          let clientState = stateSnapshot;
          if (this.gameManager && role !== 'host-display') {
            const game = this.gameManager.getGame(roomCode);
            if (game) {
              try {
                const personalizedState = game.getClientState(socketId);
                clientState = {
                  ...stateSnapshot,
                  ...personalizedState,
                  version: stateSnapshot.version,
                  timestamp: stateSnapshot.timestamp,
                };
              } catch (e) {
                console.warn(`[SyncEngine] Failed to get personalized state for resync:`, e);
              }
            }
          }

          socket.emit(eventName, clientState);
          console.log(`[SyncEngine] ✅ Resent state v${version} to socket ${socketId.substring(0, 8)}`);
        }
      });
    }

    // Resend player list if needed
    if (playerListVersion !== null) {
      const playerListSnapshotsForRoom = this.playerListSnapshots.get(roomCode);
      if (playerListSnapshotsForRoom) {
        const playerList = playerListSnapshotsForRoom.get(playerListVersion);
        if (playerList) {
          const roomUpdateData = {
            players: playerList,
            playerCount: playerList.length,
            version: playerListVersion,
          };
          socket.emit('room_update', roomUpdateData);
          console.log(`[SyncEngine] ✅ Resent player list v${playerListVersion} to socket ${socketId.substring(0, 8)}`);
        }
      }
    }

    // Clear missing ACKs after resync
    const missingAcksForRoom = this.missingAcks.get(roomCode);
    if (missingAcksForRoom) {
      missingAcksForRoom.delete(socketId);
    }

    console.log(`[SyncEngine] ✅ Completed resync for socket ${socketId.substring(0, 8)}`);
  }

  /**
   * Handle reconnection - sync current state to reconnecting client
   */
  handleReconnection(
    roomCode: string,
    socketId: string,
    role?: ClientRole
  ): SyncedState | null {
    const clientState = this.getClientState(roomCode, socketId, role);
    if (!clientState) {
      return null;
    }

    // Determine event name based on role
    let eventName = 'game_state_update';
    if (role === 'host-display') {
      eventName = 'display_sync_state';
    }

    const socket = this.io?.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit(eventName, clientState);
      this.lastSyncedVersion.set(socketId, clientState.version || 0);
      console.log(`[SyncEngine] Synced state to reconnecting ${role || 'client'} ${socketId.substring(0, 8)} in room ${roomCode}`);
    }

    return clientState;
  }

  /**
   * Emit a state event to all parties in a room
   */
  private emitStateEvent(
    eventType: 'round_started' | 'round_ended' | 'game_paused' | 'game_resumed' | 'state_transition',
    data: any,
    roomCode: string
  ): void {
    if (!this.io) {
      console.warn(`[SyncEngine] Cannot emit ${eventType}: Socket.IO not initialized`);
      return;
    }

    this.io.to(roomCode).emit(eventType, data);
    console.log(`[SyncEngine] Emitted ${eventType} event to room ${roomCode}:`, data);
  }

  /**
   * Handle state transitions and emit sound events and state events
   */
  private handleStateTransitions(roomCode: string, newState: GameState, stateData?: any): void {
    const previousTransition = this.lastStateTransition.get(roomCode);
    const previousState = previousTransition?.state;
    
    if (previousState === newState) {
      return; // No state change
    }

    const timestamp = Date.now();
    this.lastStateTransition.set(roomCode, { state: newState, timestamp });

    // Get room and game info for event data
    const room = this.roomManager?.getRoom(roomCode);
    const game = this.gameManager?.getGame(roomCode);
    const gameState = game?.getState();
    const gameType = gameState?.gameType || room?.currentGame || null;
    const round = gameState?.round || 0;
    const maxRounds = gameState?.maxRounds || 0;

    // Emit state_transition event for all state changes
    if (previousState !== undefined && this.io) {
      this.emitStateEvent('state_transition', {
        from: previousState,
        to: newState,
        gameType: gameType,
        round: round,
      }, roomCode);
    }

    // Emit specific state events based on transition
    if (this.io) {
      if (newState === GameState.PLAYING && (previousState === GameState.STARTING || previousState === GameState.ROUND_END)) {
        // Round started - transitioning to PLAYING from STARTING or ROUND_END
        this.emitStateEvent('round_started', {
          round: round,
          maxRounds: maxRounds,
          gameType: gameType,
        }, roomCode);
      } else if (newState === GameState.ROUND_END) {
        // Round ended
        const scoreboard = gameState?.scoreboard || [];
        this.emitStateEvent('round_ended', {
          round: round,
          maxRounds: maxRounds,
          gameType: gameType,
          scoreboard: scoreboard,
        }, roomCode);
      } else if (newState === GameState.PAUSED) {
        // Game paused
        this.emitStateEvent('game_paused', {
          gameType: gameType,
          round: round,
        }, roomCode);
      } else if (newState === GameState.PLAYING && previousState === GameState.PAUSED) {
        // Game resumed
        this.emitStateEvent('game_resumed', {
          gameType: gameType,
          round: round,
        }, roomCode);
      }
    }

    // Determine sound event based on state
    let soundToEmit: 'gameStart' | 'roundEnd' | 'gameEnd' | null = null;
    if (newState === GameState.STARTING) {
      soundToEmit = 'gameStart';
    } else if (newState === GameState.ROUND_END) {
      soundToEmit = 'roundEnd';
    } else if (newState === GameState.GAME_END) {
      soundToEmit = 'gameEnd';
    }

    if (soundToEmit && this.io) {
      const lastSound = this.lastSoundEvent.get(roomCode);
      // Debounce: only emit if we haven't emitted this sound for this state recently
      const shouldEmit =
        !lastSound ||
        lastSound.state !== newState ||
        timestamp - lastSound.timestamp > 1000; // 1 second debounce

      if (shouldEmit) {
        this.io.to(roomCode).emit('sound_event', {
          sound: soundToEmit,
          timestamp,
        });
        this.lastSoundEvent.set(roomCode, {
          sound: soundToEmit,
          state: newState,
          timestamp,
        });
        console.log(`[SyncEngine] Emitted ${soundToEmit} event for room ${roomCode} (state: ${newState})`);
      }
    }
  }

  /**
   * Get current version for a room
   */
  getRoomVersion(roomCode: string): number {
    return this.roomVersions.get(roomCode) || 0;
  }

  /**
   * Get last synced version for a socket
   */
  getLastSyncedVersion(socketId: string): number {
    return this.lastSyncedVersion.get(socketId) || 0;
  }

  /**
   * Check if socket has stale state
   */
  hasStaleState(roomCode: string, socketId: string): boolean {
    const roomVersion = this.getRoomVersion(roomCode);
    const socketVersion = this.getLastSyncedVersion(socketId);
    return socketVersion < roomVersion;
  }

  /**
   * Get current player list version for a room
   */
  getPlayerListVersion(roomCode: string): number {
    return this.playerListVersions.get(roomCode) || 0;
  }

  /**
   * Get ACK metrics for a room
   */
  /**
   * Track keep-alive ping/ack
   */
  trackKeepAlive(roomCode: string, socketId: string, verified: boolean): void {
    if (!this.keepAliveMetrics.has(roomCode)) {
      this.keepAliveMetrics.set(roomCode, {
        totalSent: 0,
        totalAcked: 0,
        totalFailed: 0,
        lastKeepAlive: new Map(),
      });
    }

    const metrics = this.keepAliveMetrics.get(roomCode)!;
    metrics.totalSent++;
    metrics.lastKeepAlive.set(socketId, Date.now());

    if (verified) {
      metrics.totalAcked++;
    } else {
      metrics.totalFailed++;
      console.warn(`[SyncEngine] ⚠️ Keep-alive verification failed for socket ${socketId.substring(0, 8)} in room ${roomCode}`);
    }
  }

  getAckMetrics(roomCode: string): {
    totalSent: number;
    totalAcked: number;
    totalMissing: number;
    avgLatency: number;
    ackRate: number;
    keepAlive?: {
      totalSent: number;
      totalAcked: number;
      totalFailed: number;
      successRate: number;
    };
  } | null {
    const metrics = this.ackMetrics.get(roomCode);
    if (!metrics) return null;

    const ackRate = metrics.totalSent > 0 
      ? (metrics.totalAcked / metrics.totalSent) * 100 
      : 0;

    // Include keep-alive metrics if available
    const keepAliveMetrics = this.keepAliveMetrics.get(roomCode);
    const keepAlive = keepAliveMetrics ? {
      totalSent: keepAliveMetrics.totalSent,
      totalAcked: keepAliveMetrics.totalAcked,
      totalFailed: keepAliveMetrics.totalFailed,
      successRate: keepAliveMetrics.totalSent > 0
        ? (keepAliveMetrics.totalAcked / keepAliveMetrics.totalSent) * 100
        : 0,
    } : undefined;

    return {
      totalSent: metrics.totalSent,
      totalAcked: metrics.totalAcked,
      totalMissing: metrics.totalMissing,
      avgLatency: metrics.avgLatency,
      ackRate: ackRate,
      keepAlive,
    };
  }

  /**
   * Log ACK metrics for monitoring (called periodically)
   */
  logAckMetrics(): void {
    if (!this.roomManager) return;

    const rooms = (this.roomManager as any)['rooms'];
    if (!rooms) return;

    for (const [roomCode, room] of rooms) {
      const metrics = this.getAckMetrics(roomCode);
      if (metrics && metrics.totalSent > 0) {
        const missingAcksForRoom = this.missingAcks.get(roomCode);
        const socketsWithMissingAcks = missingAcksForRoom ? missingAcksForRoom.size : 0;
        
        // Log keep-alive metrics if available
        if (metrics.keepAlive && metrics.keepAlive.totalSent > 0) {
          const keepAliveMsg = `KeepAlive: ${metrics.keepAlive.totalAcked}/${metrics.keepAlive.totalSent} (${metrics.keepAlive.successRate.toFixed(1)}%), Failed: ${metrics.keepAlive.totalFailed}`;
          console.log(`[ACKMetrics] Room ${roomCode} - ${keepAliveMsg}`);
        }
        
        if (metrics.ackRate < 95 || metrics.totalMissing > 0 || socketsWithMissingAcks > 0) {
          console.warn(`[SyncEngine] ⚠️ Room ${roomCode} ACK metrics:`, {
            ackRate: `${metrics.ackRate.toFixed(1)}%`,
            totalSent: metrics.totalSent,
            totalAcked: metrics.totalAcked,
            totalMissing: metrics.totalMissing,
            avgLatency: `${metrics.avgLatency.toFixed(0)}ms`,
            socketsWithMissingAcks: socketsWithMissingAcks,
          });
        } else {
          console.log(`[SyncEngine] ✅ Room ${roomCode} ACK metrics:`, {
            ackRate: `${metrics.ackRate.toFixed(1)}%`,
            totalSent: metrics.totalSent,
            totalAcked: metrics.totalAcked,
            avgLatency: `${metrics.avgLatency.toFixed(0)}ms`,
          });
        }
      }
    }
  }

  /**
   * Clean up room data when room is destroyed
   */
  cleanupRoom(roomCode: string): void {
    this.roomVersions.delete(roomCode);
    this.lastStateTransition.delete(roomCode);
    this.lastSoundEvent.delete(roomCode);
    this.pendingAcks.delete(roomCode);
    this.ackReceived.delete(roomCode);
    this.missingAcks.delete(roomCode);
    this.stateSnapshots.delete(roomCode);
    this.playerListVersions.delete(roomCode);
    this.playerListSnapshots.delete(roomCode);
    this.settingsVersions.delete(roomCode);
    this.settingsSnapshots.delete(roomCode);
    this.ackMetrics.delete(roomCode);
    
    // Clean up keep-alive metrics
    this.keepAliveMetrics.delete(roomCode);
    
    // Clean up socket versions for sockets in this room
    if (this.io && this.roomManager) {
      const room = this.roomManager.getRoom(roomCode);
      if (room) {
        this.lastSyncedVersion.delete(room.hostId);
        room.players.forEach((player) => {
          this.lastSyncedVersion.delete(player.id);
        });
      }
    }
    
    console.log(`[SyncEngine] Cleaned up sync data for room ${roomCode}`);
  }
}

