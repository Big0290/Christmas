import { io, Socket } from 'socket.io-client';
import { writable } from 'svelte/store';
import type { ServerToClientEvents, ClientToServerEvents } from '@christmas/core';
import { GameState } from '@christmas/core';
import { browser } from '$app/environment';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const socket = writable<TypedSocket>(null as any);
export const connected = writable(false);
export const gameState = writable<any>(null);
export const players = writable<any[]>([]);

let socketInstance: TypedSocket | null = null;

export function connectSocket(url: string = 'http://localhost:3000') {
  if (!browser) return;
  
  if (socketInstance?.connected) {
    socket.set(socketInstance);
    return;
  }

  socketInstance = io(url, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5,
  }) as TypedSocket;

  socketInstance.on('connect', () => {
    console.log('[Socket] Connected');
    connected.set(true);
  });

  socketInstance.on('disconnect', () => {
    console.log('[Socket] Disconnected');
    connected.set(false);
  });

  socketInstance.on('reconnect', (attemptNumber) => {
    console.log(`[Socket] Reconnected after ${attemptNumber} attempts`);
    connected.set(true);
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
    gameState.set(state);
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
    players.update((p) => [...p, player]);
  });

  socketInstance.on('player_left', (playerId) => {
    players.update((p) => p.filter((player) => player.id !== playerId));
  });

  socketInstance.on('error', (message) => {
    console.error('[Socket] Error:', message);
    alert(message);
  });

  socket.set(socketInstance);
  return socketInstance;
}

export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}
