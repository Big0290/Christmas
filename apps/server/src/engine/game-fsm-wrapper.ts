import { BaseGameEngine, BaseGameState, GameState, GameType, Player, FSMState } from '@christmas/core';
import { FSMEngine, FSMTransition } from './fsm-engine.js';
import type { GamePlugin, PluginContext } from '@christmas/core';
import type { Server } from 'socket.io';

/**
 * GameFSMWrapper wraps BaseGameEngine with FSM functionality.
 * 
 * Responsibilities:
 * - Map game states to FSM states
 * - Intercept game state transitions
 * - Validate transitions before applying
 * - Emit fsm_transition events
 * - Provide plugin interface integration
 */
export class GameFSMWrapper {
  private fsm: FSMEngine;
  private game: BaseGameEngine;
  private plugin: GamePlugin | null = null;
  private roomCode: string;
  private io: Server | null = null;

  constructor(
    game: BaseGameEngine,
    roomCode: string,
    gameType: GameType | null = null,
    io?: Server | null
  ) {
    this.game = game;
    this.roomCode = roomCode;
    this.io = io || null;
    this.fsm = new FSMEngine(gameType);
    
    // Initialize FSM state based on current game state
    const gameState = game.getState();
    const fsmState = FSMEngine.mapGameStateToFSM(
      gameState.state,
      gameState.round,
      gameState.maxRounds
    );
    // Set initial state without transition (no history entry)
    (this.fsm as any).currentState = fsmState;
    this.fsm.setRound(gameState.round, gameState.maxRounds);
  }

  /**
   * Set Socket.IO server for emitting FSM transition events
   */
  setSocketIO(io: Server | null): void {
    this.io = io;
  }

  /**
   * Set plugin for this wrapper
   */
  setPlugin(plugin: GamePlugin): void {
    this.plugin = plugin;
  }

  /**
   * Get wrapped game
   */
  getGame(): BaseGameEngine {
    return this.game;
  }

  /**
   * Get FSM engine
   */
  getFSM(): FSMEngine {
    return this.fsm;
  }

  /**
   * Get current FSM state
   */
  getFSMState(): FSMState {
    return this.fsm.getState();
  }

  /**
   * Handle game state change and map to FSM
   */
  onGameStateChange(newGameState: GameState, round: number, maxRounds: number): void {
    const newFSMState = FSMEngine.mapGameStateToFSM(newGameState, round, maxRounds);
    const currentFSMState = this.fsm.getState();

    // Update round info
    this.fsm.setRound(round, maxRounds);

    // Transition if state changed
    if (newFSMState !== currentFSMState) {
      const transitioned = this.fsm.transition(newFSMState, `Game state changed to ${newGameState}`);
      if (transitioned) {
        console.log(
          `[GameFSMWrapper] FSM transitioned to ${newFSMState} for room ${this.roomCode}`
        );
        
        // Emit FSM transition event
        this.emitFSMTransition();
      }
    }
  }

  /**
   * Emit FSM transition event to all clients in the room
   */
  private emitFSMTransition(): void {
    if (!this.io) return;
    
    const history = this.fsm.getStateHistory();
    if (history.length === 0) return;
    
    const lastTransition = history[history.length - 1];
    const gameState = this.game.getState();
    
    const transitionEvent = {
      roomCode: this.roomCode,
      from: lastTransition.from,
      to: lastTransition.to,
      gameType: gameState.gameType,
      round: gameState.round,
      timestamp: lastTransition.timestamp,
    };
    
    this.io.to(this.roomCode).emit('fsm_transition', transitionEvent);
    console.log(`[GameFSMWrapper] Emitted FSM transition event: ${lastTransition.from} → ${lastTransition.to}`);
  }

  /**
   * Start game with FSM transition
   */
  start(): void {
    // Transition to SETUP first
    if (this.fsm.canTransition(FSMState.SETUP)) {
      this.fsm.transition(FSMState.SETUP, 'Game starting');
      this.emitFSMTransition();
    }
    
    // Start the game
    this.game.start();
    
    // Immediately sync FSM with game's STARTING state
    const gameState = this.game.getState();
    this.onGameStateChange(gameState.state, gameState.round, gameState.maxRounds);
    
    // After game starts, it will transition to PLAYING after 3 seconds
    // We need to hook into that transition
    setTimeout(() => {
      const updatedGameState = this.game.getState();
      if (updatedGameState.state === GameState.PLAYING) {
        this.onGameStateChange(updatedGameState.state, updatedGameState.round, updatedGameState.maxRounds);
      }
    }, 3100); // Slightly after the 3 second timeout in BaseGameEngine.start()
  }

  /**
   * End game with FSM transition
   */
  end(): void {
    // Transition to GAME_END
    if (this.fsm.canTransition(FSMState.GAME_END)) {
      this.fsm.transition(FSMState.GAME_END, 'Game ending');
    }
    
    this.game.end();
  }

  /**
   * Pause game (doesn't change FSM state, pause is a modifier)
   */
  pause(): void {
    this.game.pause();
  }

  /**
   * Resume game (doesn't change FSM state, pause is a modifier)
   */
  resume(): void {
    this.game.resume();
  }

  /**
   * Next round with FSM transition
   */
  nextRound(): void {
    const gameState = this.game.getState();
    
    // Transition through FSM states
    if (this.fsm.getState() === FSMState.ROUND_END) {
      this.fsm.transition(FSMState.SCOREBOARD, 'Showing scoreboard');
    }
    
    if (this.fsm.getState() === FSMState.SCOREBOARD) {
      this.fsm.transition(FSMState.NEXT_ROUND, 'Moving to next round');
    }
    
    if (this.fsm.getState() === FSMState.NEXT_ROUND) {
      this.fsm.transition(FSMState.ROUND_START, 'Starting next round');
    }
    
    this.game.nextRound();
  }

  /**
   * Get game state (delegates to wrapped game)
   */
  getState(): BaseGameState {
    return this.game.getState();
  }

  /**
   * Handle player action (delegates to wrapped game)
   */
  handlePlayerAction(playerId: string, action: string, data: any): void {
    this.game.handlePlayerAction(playerId, action, data);
    
    // Update FSM state based on new game state
    const gameState = this.game.getState();
    this.onGameStateChange(gameState.state, gameState.round, gameState.maxRounds);
  }

  /**
   * Get client state (delegates to wrapped game)
   */
  getClientState(playerId: string): any {
    return this.game.getClientState(playerId);
  }

  /**
   * Get scoreboard (delegates to wrapped game)
   */
  getScoreboard(): Array<{ playerId: string; name: string; score: number }> {
    return this.game.getScoreboard();
  }

  /**
   * Migrate player (delegates to wrapped game)
   */
  migratePlayer(oldPlayerId: string, newPlayerId: string): void {
    this.game.migratePlayer(oldPlayerId, newPlayerId);
  }

  /**
   * Destroy game (delegates to wrapped game)
   */
  destroy(): void {
    this.game.destroy();
    
    // Reset FSM
    this.fsm.reset();
  }

  /**
   * Create plugin context from current state
   */
  createPluginContext(room: import('@christmas/core').Room, players: Map<string, Player>): PluginContext {
    const gameState = this.game.getState();
    return {
      room,
      gameState,
      players,
      gameType: gameState.gameType,
      fsmState: this.fsm.getState(),
      round: gameState.round,
      maxRounds: gameState.maxRounds,
    };
  }
}

