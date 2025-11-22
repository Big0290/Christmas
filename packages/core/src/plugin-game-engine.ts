import { BaseGameState, GameType, GameState, Player, Room, Intent, IntentResult, GameEvent } from './types.js';
import { BaseGameEngine } from './game-engine.js';
import { FSMState, GamePlugin, PluginContext, RenderDescriptor, BaseGamePlugin } from './plugin-api.js';

/**
 * PluginGameEngine combines BaseGameEngine, FSMEngine, and GamePlugin into a unified base class.
 * 
 * Games should extend this instead of BaseGameEngine to get:
 * - Game logic (from BaseGameEngine)
 * - FSM state management (built-in)
 * - Plugin interface (for intent processing)
 * - State synchronization (automatic)
 * 
 * This eliminates the need for wrapper classes and adapters.
 */
export abstract class PluginGameEngine<TState extends BaseGameState = BaseGameState> 
  extends BaseGameEngine<TState> 
  implements GamePlugin {
  
  protected fsmState: FSMState = FSMState.LOBBY;
  protected fsmHistory: Array<{ from: FSMState; to: FSMState; timestamp: number; reason?: string }> = [];
  protected roomCode: string;
  protected room: Room | null = null;
  protected io: any = null; // Socket.IO Server instance

  // FSM transition validation
  private static readonly VALID_TRANSITIONS: Map<FSMState, Set<FSMState>> = new Map<FSMState, Set<FSMState>>([
    [FSMState.LOBBY, new Set([FSMState.SETUP])],
    [FSMState.SETUP, new Set([FSMState.ROUND_START, FSMState.LOBBY])],
    [FSMState.ROUND_START, new Set([FSMState.ROUND_END, FSMState.GAME_END])],
    [FSMState.ROUND_END, new Set([FSMState.SCOREBOARD, FSMState.GAME_END])],
    [FSMState.SCOREBOARD, new Set([FSMState.NEXT_ROUND, FSMState.GAME_END])],
    [FSMState.NEXT_ROUND, new Set([FSMState.ROUND_START, FSMState.GAME_END])],
    [FSMState.GAME_END, new Set([FSMState.LOBBY])],
  ]);

  constructor(
    gameType: GameType,
    players: Map<string, Player>,
    roomCode: string
  ) {
    super(gameType, players);
    this.roomCode = roomCode;
    this.fsmState = FSMState.LOBBY;
  }

  /**
   * Set room reference (called by GameManager)
   */
  setRoom(room: Room): void {
    this.room = room;
    this.init(room);
  }

  /**
   * Set Socket.IO server instance (called by GameManager)
   */
  setSocketIO(io: any): void {
    this.io = io;
  }

  /**
   * Get current FSM state
   */
  getFSMState(): FSMState {
    return this.fsmState;
  }

  /**
   * Get FSM state history
   */
  getFSMHistory(): Array<{ from: FSMState; to: FSMState; timestamp: number; reason?: string }> {
    return [...this.fsmHistory];
  }

  /**
   * Check if FSM can transition to target state
   */
  canTransitionFSM(to: FSMState): boolean {
    const validTargets = PluginGameEngine.VALID_TRANSITIONS.get(this.fsmState);
    return validTargets ? validTargets.has(to) : false;
  }

  /**
   * Transition FSM state (with validation)
   */
  protected transitionFSM(to: FSMState, reason?: string): boolean {
    if (!this.canTransitionFSM(to)) {
      console.warn(`[PluginGameEngine] Invalid FSM transition from ${this.fsmState} to ${to}`);
      return false;
    }

    const transition = {
      from: this.fsmState,
      to,
      timestamp: Date.now(),
      reason,
    };

    this.fsmHistory.push(transition);
    this.fsmState = to;

    // Emit FSM transition event
    this.emitFSMTransition(transition);

    return true;
  }

  /**
   * Map GameState to FSMState
   */
  protected mapGameStateToFSM(gameState: GameState, round: number, maxRounds: number): FSMState {
    switch (gameState) {
      case GameState.LOBBY:
        return FSMState.LOBBY;
      case GameState.STARTING:
        return FSMState.SETUP;
      case GameState.PLAYING:
        return FSMState.ROUND_START;
      case GameState.ROUND_END:
        return FSMState.ROUND_END;
      case GameState.GAME_END:
        return FSMState.GAME_END;
      case GameState.PAUSED:
        // Paused is a modifier, return current FSM state
        return this.fsmState;
      default:
        return FSMState.LOBBY;
    }
  }

  /**
   * Sync FSM state with game state
   */
  protected syncFSMState(): void {
    const gameState = this.getState();
    const targetFSMState = this.mapGameStateToFSM(
      gameState.state,
      gameState.round,
      gameState.maxRounds
    );

    if (targetFSMState !== this.fsmState) {
      this.transitionFSM(targetFSMState, `Game state changed to ${gameState.state}`);
    }
  }

  /**
   * Emit FSM transition event
   */
  private emitFSMTransition(transition: { from: FSMState; to: FSMState; timestamp: number; reason?: string }): void {
    if (!this.io) return;

    const gameState = this.getState();
    const transitionEvent = {
      roomCode: this.roomCode,
      from: transition.from,
      to: transition.to,
      gameType: gameState.gameType,
      round: gameState.round,
      timestamp: transition.timestamp,
    };

    this.io.to(this.roomCode).emit('fsm_transition', transitionEvent);
    console.log(`[PluginGameEngine] Emitted FSM transition: ${transition.from} → ${transition.to}`);
  }

  // ========================================================================
  // Override BaseGameEngine lifecycle methods to sync FSM
  // ========================================================================

  start(): void {
    // Transition to SETUP first
    this.transitionFSM(FSMState.SETUP, 'Game starting');
    
    // Call parent start (sets state to STARTING)
    super.start();
    
    // Sync FSM immediately
    this.syncFSMState();
    
    // Sync FSM again after transition to PLAYING
    setTimeout(() => {
      this.syncFSMState();
    }, 3100);
  }

  pause(): void {
    super.pause();
    // FSM state doesn't change on pause (it's a modifier)
  }

  resume(): void {
    super.resume();
    // Sync FSM state after resume
    this.syncFSMState();
  }

  end(): void {
    this.transitionFSM(FSMState.GAME_END, 'Game ending');
    super.end();
    this.syncFSMState();
  }

  nextRound(): void {
    // Transition through FSM states
    if (this.fsmState === FSMState.ROUND_END) {
      this.transitionFSM(FSMState.SCOREBOARD, 'Showing scoreboard');
    }
    if (this.fsmState === FSMState.SCOREBOARD) {
      this.transitionFSM(FSMState.NEXT_ROUND, 'Moving to next round');
    }
    if (this.fsmState === FSMState.NEXT_ROUND) {
      this.transitionFSM(FSMState.ROUND_START, 'Starting next round');
    }
    
    super.nextRound();
    this.syncFSMState();
  }

  // Override handlePlayerAction to sync FSM after state changes
  // Subclasses should override handlePlayerActionImpl for game-specific logic
  handlePlayerAction(playerId: string, action: string, data: any): void {
    // Call game-specific implementation (subclasses implement this)
    this.handlePlayerActionImpl(playerId, action, data);
    
    // Sync FSM after action
    this.syncFSMState();
  }

  /**
   * Game-specific player action handling (implemented by subclasses)
   * This is called by handlePlayerAction and should contain the game logic
   */
  protected abstract handlePlayerActionImpl(playerId: string, action: string, data: any): void;

  // ========================================================================
  // GamePlugin interface implementation
  // ========================================================================

  /**
   * Initialize plugin (called when room is set)
   */
  abstract init(roomState: Room): void;

  /**
   * Handle intent (default implementation delegates to handlePlayerAction)
   */
  async onIntent(intent: Intent, ctx: PluginContext): Promise<IntentResult> {
    // Default: delegate to handlePlayerAction
    try {
      this.handlePlayerAction(intent.playerId, intent.action, intent.data);
      
      return {
        success: true,
        intentId: intent.id,
        eventId: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        version: ctx.room.version + 1,
      };
    } catch (error: any) {
      return {
        success: false,
        intentId: intent.id,
        error: error.message || 'Failed to process intent',
      };
    }
  }

  /**
   * Validate intent (default implementation)
   */
  validate(intent: Intent, ctx: PluginContext): boolean {
    // Default validation: check intent has required fields
    if (!intent.id || !intent.type || !intent.playerId || !intent.roomCode || !intent.action) {
      return false;
    }

    // Check player exists
    if (!ctx.players.has(intent.playerId)) {
      return false;
    }

    // Check game is in valid state for actions
    const gameState = ctx.gameState.state;
    if (gameState !== GameState.PLAYING && gameState !== GameState.STARTING) {
      return false;
    }

    return true;
  }

  /**
   * Apply event (default: no-op, games can override)
   */
  applyEvent(event: GameEvent, ctx: PluginContext): void {
    // Default: no-op, games can override if needed
  }

  /**
   * Serialize state for synchronization
   */
  serializeState(roomState: Room): BaseGameState {
    return this.getState();
  }

  /**
   * Cleanup when game ends
   */
  cleanup(roomState: Room): void {
    this.destroy();
  }

  /**
   * Get render descriptor (must be implemented by subclasses)
   */
  abstract getRenderDescriptor(): RenderDescriptor;
}

