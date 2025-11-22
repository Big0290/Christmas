import { io, Socket } from 'socket.io-client';
import { writable, get } from 'svelte/store';
import type { ServerToClientEvents, ClientToServerEvents } from '@christmas/core';
import { GameState } from '@christmas/core';
import { browser } from '$app/environment';
import { getAccessToken } from './supabase';
import { normalizeGameState, normalizeGameType } from './utils/game-state';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const socket = writable<TypedSocket>(null as any);
export const connected = writable(false);
export const gameState = writable<any>(null);
export const players = writable<any[]>([]);

// Track last received versions for gap detection
let lastStateVersion: number | null = null;
let lastPlayerListVersion: number | null = null;

let socketInstance: TypedSocket | null = null;
let listenersRegistered = false; // Track if event listeners are already registered
let isConnecting = false; // Track if we're currently in the process of connecting
let connectionPromise: Promise<TypedSocket | null> | null = null; // Track ongoing connection promise

// Keep-alive system for lobby connections
let keepAliveInterval: ReturnType<typeof setInterval> | null = null;
let pendingKeepAlive: Map<number, { timestamp: number; timeout: ReturnType<typeof setTimeout> }> = new Map();
let keepAliveId = 0;
let currentRoomCode: string | null = null;
let lastKeepAliveSuccess: number | null = null;
let keepAliveFailureCount = 0;

// Server time synchronization
let serverTimeOffset = 0; // Difference between server time and client time (server - client)

/**
 * Get the current server time based on synchronized offset
 */
export function getServerTime(): number {
  return Date.now() + serverTimeOffset;
}

/**
 * Synchronize client time with server time
 * Call this when receiving a timestamp from the server
 */
function syncServerTime(serverTimestamp: number, clientReceiveTime: number) {
  // Calculate round-trip time estimate (simple approach)
  // In a more sophisticated implementation, we'd do multiple round trips
  const estimatedServerTime = serverTimestamp;
  serverTimeOffset = estimatedServerTime - clientReceiveTime;
  console.log('[Socket] Server time synchronized, offset:', serverTimeOffset, 'ms');
}

export async function connectSocket(url?: string, forceReconnect: boolean = false) {
  if (!browser) {
    console.log('[Socket] Not in browser environment, skipping connection');
    return null;
  }
  
  // Prevent multiple simultaneous connection attempts - check this FIRST
  // Use a synchronous check before any async operations
  if (isConnecting && connectionPromise && !forceReconnect) {
    console.log('[Socket] Connection already in progress, waiting for existing connection...');
    return connectionPromise;
  }
  
  // If socket exists and is connected, return it immediately (before setting isConnecting)
  if (socketInstance?.connected && !forceReconnect) {
    console.log('[Socket] Reusing existing connected socket');
    socket.set(socketInstance);
    return socketInstance;
  }
  
  // If socket exists but not connected, reuse it (before setting isConnecting)
  // This prevents creating multiple socket instances during navigation
  if (socketInstance && !forceReconnect) {
    console.log('[Socket] Socket instance already exists, reusing it (socket.io will handle reconnection)');
    socket.set(socketInstance);
    // Register listeners if not already registered
    if (!listenersRegistered) {
      registerSocketListeners(socketInstance);
      listenersRegistered = true;
    }
    // Don't create a new connection - let socket.io handle reconnection automatically
    return socketInstance;
  }
  
  // If forcing reconnect, disconnect existing socket first and remove listeners
  if (forceReconnect && socketInstance) {
    console.log('[Socket] Force reconnecting - disconnecting existing socket');
    // Remove all listeners before disconnecting
    socketInstance.removeAllListeners();
    socketInstance.disconnect();
    socketInstance = null;
    connected.set(false);
    listenersRegistered = false;
    isConnecting = false;
    connectionPromise = null;
    // Clear players store on disconnect to prevent stale data
    players.set([]);
  }

  // Set connecting flag IMMEDIATELY to prevent duplicate calls
  // This must happen before any async operations, but after checking for existing sockets
  isConnecting = true;
  
  // Auto-detect server URL from current window location
  // In production (fly.dev or any production domain), use same origin (no port)
  // In development (localhost:5173), use localhost:3000
  // On local network (IP:5173), use IP:3000
  const serverUrl = url || (() => {
    if (typeof window !== 'undefined') {
      const { protocol, hostname, port } = window.location;
      
      // Production: If no port or standard ports (80/443), use same origin
      // This covers fly.dev, custom domains, and any production deployment
      if (!port || port === '80' || port === '443') {
        const url = `${protocol}//${hostname}`;
        console.log('[Socket] Production mode detected, using same origin:', url);
        return url;
      }
      
      // Development: localhost on port 5173 -> connect to port 3000
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        const url = `${protocol}//${hostname}:3000`;
        console.log('[Socket] Development mode detected, using:', url);
        return url;
      }
      
      // Local network or other ports - use port 3000
      const url = `${protocol}//${hostname}:3000`;
      console.log('[Socket] Local network detected, using:', url);
      return url;
    }
    const fallback = 'http://localhost:3000';
    console.log('[Socket] Fallback URL:', fallback);
    return fallback;
  })();

  // Get auth token if available
  const authToken = await getAccessToken();
  
  console.log('[Socket] Connecting to server:', serverUrl);
  console.log('[Socket] Browser environment:', browser);
  console.log('[Socket] Auth token available:', !!authToken);
  
  // Create connection promise
  connectionPromise = (async () => {
    try {
      socketInstance = io(serverUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
        timeout: 10000, // 10 second timeout for connection
        auth: authToken ? { token: authToken } : undefined,
      }) as TypedSocket;

      // Set socket in store immediately so components can access it
      socket.set(socketInstance);

      // Check if socket is already connected (can happen if reusing existing connection)
      if (socketInstance.connected) {
        console.log('[Socket] Already connected, syncing connected state');
        connected.set(true);
        isConnecting = false;
        connectionPromise = null;
      } else {
        console.log('[Socket] Socket not yet connected, waiting for connect event');
        // Ensure connected state is false if not connected
        connected.set(false);
        
        // Set isConnecting to false once connected or on error
        socketInstance.once('connect', () => {
          isConnecting = false;
          connectionPromise = null;
        });
        socketInstance.once('connect_error', () => {
          isConnecting = false;
          connectionPromise = null;
        });
      }

      // Only register event listeners once to prevent duplicates
      if (!listenersRegistered) {
        console.log('[Socket] Registering event listeners');
        registerSocketListeners(socketInstance);
        listenersRegistered = true;
      } else {
        console.log('[Socket] Event listeners already registered, skipping');
      }
      
      return socketInstance;
    } catch (error) {
      isConnecting = false;
      connectionPromise = null;
      console.error('[Socket] Error creating socket instance:', error);
      throw error;
    }
  })();
  
  return connectionPromise;
}

// Separate function to register event listeners (prevents duplicate registration)
function registerSocketListeners(socketInstance: TypedSocket) {
  socketInstance.on('connect', () => {
    console.log('[Socket] Connected');
    connected.set(true);
    // Note: Auto-reconnect is now handled by individual pages (play/[code] and room/[code])
    // This prevents conflicts and allows pages to manage their own reconnection state
  });

  socketInstance.on('connect_error', (error) => {
    console.error('[Socket] Connection error:', error);
    console.error('[Socket] Error details:', {
      message: error.message,
      description: error.description,
      context: error.context,
      type: error.type
    });
    connected.set(false);
    // Connection error doesn't mean we should stop trying - socket.io will retry
    // But we should log it for debugging
  });

  socketInstance.on('disconnect', () => {
    console.log('[Socket] Disconnected');
    connected.set(false);
    // Stop keep-alive on disconnect
    stopKeepAlive();
    // Don't clear players on disconnect - they might reconnect
    // The room_update event will sync the correct list when reconnected
  });

  socketInstance.on('reconnect', (attemptNumber) => {
    console.log(`[Socket] Reconnected after ${attemptNumber} attempts`);
    connected.set(true);
    // Note: Socket.io automatically rejoins rooms on reconnect, but we need to
    // re-authenticate/reconnect as host/player. This is handled by individual pages.
  });

  socketInstance.on('reconnect_attempt', (attemptNumber) => {
    console.log(`[Socket] Reconnection attempt ${attemptNumber}`);
  });

  socketInstance.on('reconnect_error', (error) => {
    console.error('[Socket] Reconnection error:', error);
  });

  socketInstance.on('reconnect_failed', () => {
    console.error('[Socket] Reconnection failed');
    connected.set(false);
  });

  socketInstance.on('game_state_update', (state) => {
    console.log('[Socket] game_state_update received (socket.ts listener):', {
      state: state?.state,
      gameType: state?.gameType,
      round: state?.round,
      maxRounds: state?.maxRounds,
      hasQuestion: !!state?.currentQuestion,
      hasItem: !!state?.currentItem,
      hasPrompt: !!state?.currentPrompt,
      hasEmojis: !!state?.availableEmojis,
      socketId: socketInstance.id,
      socketConnected: socketInstance.connected,
      version: state?.version
    });
    // Log question details if present
    if (state?.currentQuestion) {
      console.log('[Socket] Question details:', {
        question: state.currentQuestion.question,
        answers: state.currentQuestion.answers,
        hasTranslations: !!state.currentQuestion.translations,
        correctIndex: state.currentQuestion.correctIndex
      });
    }
    // Normalize state and gameType to enum values before storing
    // IMPORTANT: Preserve round and maxRounds from server state
    const normalizedState = {
      ...state,
      state: normalizeGameState(state?.state) ?? state?.state,
      gameType: normalizeGameType(state?.gameType) ?? state?.gameType,
      round: state?.round ?? 0,
      maxRounds: state?.maxRounds ?? 0
    };
    // Update the store
    console.log('[Socket] Updating gameState store with normalized state:', normalizedState?.state, 'round:', normalizedState?.round, 'maxRounds:', normalizedState?.maxRounds, 'hasQuestion:', !!state?.currentQuestion);
    gameState.set(normalizedState);
    // Verify the store was updated by checking it immediately
    const updatedState = get(gameState);
    console.log('[Socket] ✅ GameState store updated, verified round:', updatedState?.round, 'maxRounds:', updatedState?.maxRounds, 'currentQuestion exists:', !!updatedState?.currentQuestion);
    
    // Track version and detect gaps
    if (state?.version !== undefined && state?.version !== null) {
      const currentVersion = state.version;
      
      // Detect version gaps
      if (lastStateVersion !== null && currentVersion > lastStateVersion + 1) {
        const gap = currentVersion - lastStateVersion - 1;
        console.warn(`[Socket] ⚠️ Version gap detected: expected ${lastStateVersion + 1}, got ${currentVersion} (missing ${gap} version(s))`);
        // Request resync by emitting a gap notification
        socketInstance.emit('state_gap_detected', {
          lastVersion: lastStateVersion,
          currentVersion: currentVersion,
          missingVersions: gap
        });
      }
      
      lastStateVersion = currentVersion;
      
      // Emit ACK
      socketInstance.emit('state_ack', {
        version: currentVersion,
        messageType: 'state',
        timestamp: state.timestamp || Date.now()
      });
      console.log(`[Socket] ✅ Emitted ACK for state version ${currentVersion}`);
    }
  });

  // Also listen to display_sync_state for consistency (used by host-display pages)
  socketInstance.on('display_sync_state', (state) => {
    console.log('[Socket] 📺 display_sync_state received (socket.ts listener):', {
      state: state?.state,
      gameType: state?.gameType,
      round: state?.round,
      maxRounds: state?.maxRounds,
      hasQuestion: !!state?.currentQuestion,
      hasItem: !!state?.currentItem,
      hasPrompt: !!state?.currentPrompt,
      hasEmojis: !!state?.availableEmojis,
      socketId: socketInstance.id,
      socketConnected: socketInstance.connected,
      version: state?.version
    });
    // Normalize state and gameType to enum values before storing
    // IMPORTANT: Preserve round and maxRounds from server state
    const normalizedState = {
      ...state,
      state: normalizeGameState(state?.state) ?? state?.state,
      gameType: normalizeGameType(state?.gameType) ?? state?.gameType,
      round: state?.round ?? 0,
      maxRounds: state?.maxRounds ?? 0
    };
    // Update the store (same as game_state_update for consistency)
    console.log('[Socket] 📺 Updating gameState store with display_sync_state:', normalizedState?.state, 'round:', normalizedState?.round, 'maxRounds:', normalizedState?.maxRounds, 'hasQuestion:', !!state?.currentQuestion);
    gameState.set(normalizedState);
    // Verify the store was updated
    const updatedState = get(gameState);
    console.log('[Socket] 📺 ✅ GameState store updated from display_sync_state, verified currentQuestion exists:', !!updatedState?.currentQuestion);
    
    // Track version and detect gaps
    if (state?.version !== undefined && state?.version !== null) {
      const currentVersion = state.version;
      
      // Detect version gaps
      if (lastStateVersion !== null && currentVersion > lastStateVersion + 1) {
        const gap = currentVersion - lastStateVersion - 1;
        console.warn(`[Socket] 📺 ⚠️ Version gap detected: expected ${lastStateVersion + 1}, got ${currentVersion} (missing ${gap} version(s))`);
        // Request resync by emitting a gap notification
        socketInstance.emit('state_gap_detected', {
          lastVersion: lastStateVersion,
          currentVersion: currentVersion,
          missingVersions: gap
        });
      }
      
      lastStateVersion = currentVersion;
      
      // Emit ACK
      socketInstance.emit('state_ack', {
        version: currentVersion,
        messageType: 'state',
        timestamp: state.timestamp || Date.now()
      });
      console.log(`[Socket] 📺 ✅ Emitted ACK for display state version ${currentVersion}`);
    }
  });

  socketInstance.on('game_ended', (data: any) => {
    console.log('[Socket] game_ended received:', data);
    // Update game state to GAME_END for all players, host/control, and host/display
    gameState.update((currentState) => {
      if (currentState) {
        return {
          ...currentState,
          state: GameState.GAME_END,
          scoreboard: data?.scoreboard || currentState.scoreboard,
          gameType: data?.gameType || currentState.gameType,
        };
      } else {
        // If no current state, create a minimal game end state
        return {
          gameType: data?.gameType || null,
          state: GameState.GAME_END,
          round: 0,
          maxRounds: 0,
          startedAt: 0,
          scores: {},
          scoreboard: data?.scoreboard || [],
        };
      }
    });
  });

  socketInstance.on('game_started', (gameType: GameType) => {
    console.log('[Socket] game_started received, clearing old state:', gameType);
    // Clear old game state when a new game starts
    // This prevents old leaderboard/results from persisting
    gameState.set({
      state: GameState.STARTING,
      gameType: gameType,
      round: 0,
      maxRounds: 0,
      startedAt: Date.now(),
      scores: {},
      scoreboard: [],
    });
  });

  // State transition events
  socketInstance.on('round_started', (data: { round: number; maxRounds: number; gameType: GameType }) => {
    console.log('[Socket] round_started received:', data);
    gameState.update((current) => {
      if (current) {
        return {
          ...current,
          round: data.round,
          maxRounds: data.maxRounds,
          state: GameState.PLAYING,
        };
      }
      return current;
    });
  });

  socketInstance.on('round_ended', (data: { round: number; maxRounds: number; gameType: GameType; scoreboard?: any[] }) => {
    console.log('[Socket] round_ended received:', data);
    gameState.update((current) => {
      if (current) {
        return {
          ...current,
          round: data.round,
          maxRounds: data.maxRounds,
          state: GameState.ROUND_END,
          scoreboard: data.scoreboard || current.scoreboard || [],
        };
      }
      return current;
    });
  });

  socketInstance.on('game_paused', (data: { gameType: GameType; round: number }) => {
    console.log('[Socket] game_paused received:', data);
    gameState.update((current) => {
      if (current) {
        return {
          ...current,
          state: GameState.PAUSED,
          round: data.round,
        };
      }
      return current;
    });
  });

  socketInstance.on('game_resumed', (data: { gameType: GameType; round: number }) => {
    console.log('[Socket] game_resumed received:', data);
    gameState.update((current) => {
      if (current) {
        return {
          ...current,
          state: GameState.PLAYING,
          round: data.round,
        };
      }
      return current;
    });
  });

  socketInstance.on('state_transition', (data: { from: GameState; to: GameState; gameType: GameType; round?: number }) => {
    console.log('[Socket] state_transition received:', data);
    // Update gameState store with new state
    gameState.update((current) => {
      if (current) {
        return {
          ...current,
          state: data.to,
          round: data.round !== undefined ? data.round : current.round,
        };
      }
      return current;
    });
  });

  socketInstance.on('player_joined', (player) => {
    console.log('[Socket] Player joined event:', player);
    
    // Validate player object has required properties
    if (!player || !player.id || !player.name || typeof player.name !== 'string' || player.name.trim().length === 0) {
      console.warn('[Socket] ⚠️ Invalid player_joined event: player missing required properties', player);
      return;
    }
    
    // Only add if not already present (prevent duplicates)
    // But room_update is authoritative, so this is just for immediate UI feedback
    players.update((p) => {
      const exists = p.some((existing) => existing.id === player.id);
      if (exists) {
        console.log('[Socket] Player already in list, skipping add');
        return p;
      }
      console.log('[Socket] Adding player to list:', player.name);
      const updatedList = [...p, player];
      
      // Dispatch custom event to trigger animations immediately
      // This ensures animations trigger even if room_update follows
      if (browser) {
        // Use setTimeout to ensure the store update completes first
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('player_joined_animation', {
            detail: { player, playerId: player.id }
          }));
        }, 0);
      }
      
      return updatedList;
    });
  });

  socketInstance.on('player_left', (playerIdOrData: any) => {
    console.log('[Socket] Player left event:', playerIdOrData);
    // Handle both formats: just ID or { playerId, player } object
    const playerId = typeof playerIdOrData === 'string' ? playerIdOrData : playerIdOrData?.playerId || playerIdOrData;
    players.update((p) => {
      const filtered = p.filter((player) => player.id !== playerId);
      console.log(`[Socket] Removed player ${playerId}, ${filtered.length} player(s) remaining`);
      return filtered;
    });
  });

  // Authoritative room roster updates - this is the source of truth
  // This should always override any player_joined/player_left events
  socketInstance.on('room_update', (data: any) => {
    console.log('🔴 [Socket] Room update event received:', data);
    console.log('🔴 [Socket] Data type check:', {
      hasData: !!data,
      isArray: Array.isArray(data?.players),
      playersLength: data?.players?.length,
      players: data?.players,
      socketId: socketInstance.id,
      socketConnected: socketInstance.connected,
      version: data?.version
    });
    if (data && Array.isArray(data.players)) {
      // Validate player objects have required properties (especially name)
      const validPlayers = data.players.filter((p: any) => {
        const hasName = p && typeof p.name === 'string' && p.name.trim().length > 0;
        if (!hasName) {
          console.warn('🔴 [Socket] ⚠️ Invalid player object missing name:', p);
        }
        return hasName;
      });
      
      if (validPlayers.length !== data.players.length) {
        console.warn(`🔴 [Socket] ⚠️ Filtered out ${data.players.length - validPlayers.length} invalid player(s) out of ${data.players.length} total`);
      }
      
      console.log(`🔴 [Socket] Setting players list with ${validPlayers.length} valid player(s)`, validPlayers.map((p: any) => ({ id: p.id?.substring(0, 8), name: p.name })));
      // This is authoritative - replace entire list
      players.set(validPlayers);
      // Verify update using get() since we're in a non-reactive context
      const updatedPlayers = get(players);
      console.log('🔴 [Socket] Players store UPDATED. New value:', updatedPlayers);
      console.log('🔴 [Socket] Players store length after update:', updatedPlayers.length);
      console.log('🔴 [Socket] Player names:', updatedPlayers.map((p: any) => p.name).join(', '));
      
      // Dispatch a custom event so components can react if needed
      if (browser) {
        window.dispatchEvent(new CustomEvent('players_updated', { 
          detail: { players: updatedPlayers, count: updatedPlayers.length } 
        }));
      }
      
      // Track version and detect gaps
      if (data?.version !== undefined && data?.version !== null) {
        const currentVersion = data.version;
        
        // Detect version gaps
        if (lastPlayerListVersion !== null && currentVersion > lastPlayerListVersion + 1) {
          const gap = currentVersion - lastPlayerListVersion - 1;
          console.warn(`🔴 [Socket] ⚠️ Player list version gap detected: expected ${lastPlayerListVersion + 1}, got ${currentVersion} (missing ${gap} version(s))`);
        }
        
        lastPlayerListVersion = currentVersion;
        
        // Emit ACK
        socketInstance.emit('state_ack', {
          version: currentVersion,
          messageType: 'player_list',
          timestamp: data.timestamp || Date.now()
        });
        console.log(`🔴 [Socket] ✅ Emitted ACK for player list version ${currentVersion}`);
      }
    } else {
      console.warn('🔴 [Socket] Room update received but data.players is not an array:', data);
    }
  });

  socketInstance.on('error', (message) => {
    console.error('[Socket] Error:', message);
    // Note: Socket error messages are already translated on the server side
    // or are technical messages that don't need translation
    alert(message);
  });

  // Room settings synchronization with ACK tracking
  socketInstance.on('room_settings_updated', (settings: any) => {
    console.log('[Socket] 📋 room_settings_updated received:', {
      hasRoomName: settings?.roomName !== undefined,
      hasDescription: settings?.description !== undefined,
      hasTheme: !!(settings?.sparkles !== undefined || settings?.icicles !== undefined || settings?.frostPattern !== undefined || settings?.colorScheme !== undefined || settings?.backgroundMusic !== undefined || settings?.snowEffect !== undefined || settings?.language !== undefined),
      version: settings?.version
    });
    
    // Track version and emit ACK
    if (settings?.version !== undefined && settings?.version !== null) {
      const currentVersion = settings.version;
      
      // Emit ACK for settings update
      socketInstance.emit('state_ack', {
        version: currentVersion,
        messageType: 'settings',
        timestamp: settings.timestamp || Date.now()
      });
      console.log(`[Socket] 📋 ✅ Emitted ACK for room_settings_updated version ${currentVersion}`);
    }
    
    // Dispatch custom event for components to handle
    // Components will handle theme updates themselves
    if (browser) {
      window.dispatchEvent(new CustomEvent('room_settings_updated', { detail: settings }));
    }
  });

  // Jukebox state synchronization
  socketInstance.on('jukebox_state', (state: { currentTrack: number; isPlaying: boolean; shuffle: boolean; repeat: 'none' | 'one' | 'all'; volume: number; progress?: number }) => {
    // This will be handled by the Jukebox component
    // Emit a custom event that components can listen to
    if (browser) {
      window.dispatchEvent(new CustomEvent('jukebox_state_update', { detail: state }));
    }
  });

  // Sound event synchronization from server
  socketInstance.on('sound_event', (data: { sound: 'gameStart' | 'roundEnd' | 'gameEnd'; timestamp: number }) => {
    if (!browser) return;
    
    // Sync server time using the timestamp from the server
    const clientReceiveTime = Date.now();
    syncServerTime(data.timestamp, clientReceiveTime);
    
    // Import playSoundOnce dynamically to avoid circular dependencies
    import('./audio').then(({ playSoundOnce }) => {
      // Use playSoundOnce to prevent duplicates, with a longer debounce for server events
      playSoundOnce(data.sound, 1000); // 1 second debounce for server events
      console.log(`[Socket] Playing server-synced sound: ${data.sound}`);
    }).catch((error) => {
      console.error('[Socket] Error importing audio module:', error);
    });
  });

  // Connection keep-alive ACK handler
  socketInstance.on('connection_keepalive_ack', (data: {
    ack: boolean;
    timestamp: number;
    serverTime: number;
    roomState: {
      roomCode: string;
      playerCount: number;
      gameState: GameState | null;
      verified: boolean;
    };
  }) => {
    // Clear pending keep-alive
    if (pendingKeepAlive.has(data.timestamp)) {
      const pending = pendingKeepAlive.get(data.timestamp);
      if (pending) {
        clearTimeout(pending.timeout);
      }
      pendingKeepAlive.delete(data.timestamp);
    }

    // Sync server time
    syncServerTime(data.serverTime, Date.now());

    // Verify room state
    if (!data.roomState.verified) {
      console.warn('[KeepAlive] ⚠️ Room verification failed:', data.roomState);
      keepAliveFailureCount++;
      
      // Trigger immediate reconnection if verification fails
      if (keepAliveFailureCount >= 2) {
        console.error('[KeepAlive] ❌ Multiple keep-alive failures, triggering reconnection');
        keepAliveFailureCount = 0;
        stopKeepAlive(); // Stop before reconnecting
        if (socketInstance && socketInstance.connected) {
          connectSocket(undefined, true);
        }
      }
      return;
    }

    // Reset failure count on success
    keepAliveFailureCount = 0;
    lastKeepAliveSuccess = Date.now();

    // Verify room code matches
    if (currentRoomCode && data.roomState.roomCode !== currentRoomCode) {
      console.warn(`[KeepAlive] ⚠️ Room code mismatch: expected ${currentRoomCode}, got ${data.roomState.roomCode}`);
      // Trigger reconnection
      stopKeepAlive(); // Stop before reconnecting
      if (socketInstance && socketInstance.connected) {
        connectSocket(undefined, true);
      }
      return;
    }

    console.log(`[KeepAlive] ✅ Keep-alive ACK received for room ${data.roomState.roomCode}, ${data.roomState.playerCount} players`);
  });
}

/**
 * Start keep-alive ping system for lobby connections
 * Only active when socket is connected and in LOBBY state
 */
export function startKeepAlive(roomCode: string): void {
  if (!browser) return;
  
  // Stop existing keep-alive if running
  stopKeepAlive();
  
  currentRoomCode = roomCode;
  keepAliveFailureCount = 0;
  
  const sendKeepAlive = () => {
    // Check socket is still valid
    if (!socketInstance || !socketInstance.connected || !currentRoomCode) {
      stopKeepAlive();
      return;
    }

    // Check if we're in lobby state (no active game)
    const currentState = get(gameState);
    const isInLobby = !currentState || currentState.state === GameState.LOBBY || currentState.state === null;
    
    if (!isInLobby) {
      // Not in lobby, stop keep-alive
      stopKeepAlive();
      return;
    }

    const timestamp = Date.now();
    keepAliveId++;
    
    try {
      // Send keep-alive ping
      socketInstance.emit('connection_keepalive', {
        timestamp,
        roomCode: currentRoomCode,
        socketId: socketInstance.id,
      });

      // Set timeout for ACK (5 seconds)
      const timeout = setTimeout(() => {
        // Check if this timeout is still valid
        if (!pendingKeepAlive.has(timestamp)) {
          return; // Already cleared
        }
        
        console.warn(`[KeepAlive] ⚠️ Keep-alive timeout for room ${currentRoomCode}`);
        pendingKeepAlive.delete(timestamp);
        keepAliveFailureCount++;
        
        // Trigger immediate reconnection after timeout
        if (keepAliveFailureCount >= 2) {
          console.error('[KeepAlive] ❌ Multiple keep-alive timeouts, triggering reconnection');
          keepAliveFailureCount = 0;
          stopKeepAlive(); // Stop before reconnecting
          if (socketInstance && socketInstance.connected) {
            connectSocket(undefined, true);
          }
        }
      }, 5000);

      pendingKeepAlive.set(timestamp, { timestamp, timeout });
    } catch (error) {
      console.error('[KeepAlive] Error sending keep-alive:', error);
      // If socket is disconnected, stop keep-alive
      if (!socketInstance || !socketInstance.connected) {
        stopKeepAlive();
      }
    }
  };

  // Send immediately, then every 30 seconds
  sendKeepAlive();
  keepAliveInterval = setInterval(sendKeepAlive, 30000);
  console.log(`[KeepAlive] Started keep-alive for room ${roomCode}`);
}

/**
 * Stop keep-alive ping system
 */
export function stopKeepAlive(): void {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
  
  // Clear all pending timeouts
  pendingKeepAlive.forEach((pending) => {
    clearTimeout(pending.timeout);
  });
  pendingKeepAlive.clear();
  
  currentRoomCode = null;
  keepAliveFailureCount = 0;
  console.log('[KeepAlive] Stopped keep-alive');
}

/**
 * Get last successful keep-alive timestamp
 */
export function getLastKeepAliveSuccess(): number | null {
  return lastKeepAliveSuccess;
}

export function disconnectSocket() {
  // Stop keep-alive when disconnecting
  stopKeepAlive();
  
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}
