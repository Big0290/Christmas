import { io, Socket } from 'socket.io-client';
import { writable, get } from 'svelte/store';
import type { ServerToClientEvents, ClientToServerEvents } from '@christmas/core';
import { GameState } from '@christmas/core';
import { browser } from '$app/environment';
import { getAccessToken } from './supabase';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const socket = writable<TypedSocket>(null as any);
export const connected = writable(false);
export const gameState = writable<any>(null);
export const players = writable<any[]>([]);

let socketInstance: TypedSocket | null = null;
let listenersRegistered = false; // Track if event listeners are already registered
let isConnecting = false; // Track if we're currently in the process of connecting
let connectionPromise: Promise<TypedSocket | null> | null = null; // Track ongoing connection promise

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
    socket.set(socketInstance);
    return socketInstance;
  }
  
  // If socket exists but not connected, reuse it (before setting isConnecting)
  if (socketInstance && !forceReconnect) {
    console.log('[Socket] Socket instance already exists, reusing it (socket.io will handle reconnection)');
    socket.set(socketInstance);
    // Register listeners if not already registered
    if (!listenersRegistered) {
      registerSocketListeners(socketInstance);
      listenersRegistered = true;
    }
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
      hasQuestion: !!state?.currentQuestion,
      hasItem: !!state?.currentItem,
      hasPrompt: !!state?.currentPrompt,
      hasEmojis: !!state?.availableEmojis,
      socketId: socketInstance.id,
      socketConnected: socketInstance.connected
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
    // Update the store
    console.log('[Socket] Updating gameState store with state:', state?.state, 'hasQuestion:', !!state?.currentQuestion);
    gameState.set(state);
    // Verify the store was updated by checking it immediately
    const updatedState = get(gameState);
    console.log('[Socket] ✅ GameState store updated, verified currentQuestion exists:', !!updatedState?.currentQuestion);
  });

  socketInstance.on('game_ended', (data: any) => {
    // Update game state to GAME_END for all players
    gameState.update((currentState) => {
      if (currentState) {
        return {
          ...currentState,
          state: GameState.GAME_END,
          scoreboard: data.scoreboard || currentState.scoreboard,
        };
      } else {
        // If no current state, create a minimal game end state
        return {
          gameType: data.gameType || null,
          state: GameState.GAME_END,
          round: 0,
          maxRounds: 0,
          startedAt: 0,
          scores: {},
          scoreboard: data.scoreboard || [],
        };
      }
    });
  });

  socketInstance.on('player_joined', (player) => {
    console.log('[Socket] Player joined event:', player);
    // Only add if not already present (prevent duplicates)
    // But room_update is authoritative, so this is just for immediate UI feedback
    players.update((p) => {
      const exists = p.some((existing) => existing.id === player.id);
      if (exists) {
        console.log('[Socket] Player already in list, skipping add');
        return p;
      }
      console.log('[Socket] Adding player to list:', player.name);
      return [...p, player];
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
      socketConnected: socketInstance.connected
    });
    if (data && Array.isArray(data.players)) {
      console.log(`🔴 [Socket] Setting players list with ${data.players.length} player(s)`);
      // This is authoritative - replace entire list
      players.set(data.players);
      // Verify update using get() since we're in a non-reactive context
      const updatedPlayers = get(players);
      console.log('🔴 [Socket] Players store UPDATED. New value:', updatedPlayers);
      console.log('🔴 [Socket] Players store length after update:', updatedPlayers.length);
      
      // Dispatch a custom event so components can react if needed
      if (browser) {
        window.dispatchEvent(new CustomEvent('players_updated', { 
          detail: { players: updatedPlayers, count: updatedPlayers.length } 
        }));
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
}

export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}
