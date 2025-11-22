import { Intent, IntentResult, Room, Player, BaseGameState, GameType } from './types.js';

/**
 * Standard FSM states for game lifecycle
 * This mirrors FSMState enum from fsm-engine.ts
 */
export enum FSMState {
  LOBBY = 'lobby',
  SETUP = 'setup',
  ROUND_START = 'round_start',
  ROUND_END = 'round_end',
  SCOREBOARD = 'scoreboard',
  NEXT_ROUND = 'next_round',
  GAME_END = 'game_end',
}

/**
 * Render descriptor for display layouts
 */
export interface RenderDescriptor {
  layout: 'grid' | 'canvas' | 'list' | 'scoreboard' | 'custom';
  components: RenderComponent[];
  config?: Record<string, any>;
}

export interface RenderComponent {
  type: string;
  position?: { x: number; y: number; width?: number; height?: number };
  props?: Record<string, any>;
}

/**
 * Plugin context passed to plugin methods
 */
export interface PluginContext {
  room: Room;
  gameState: BaseGameState;
  players: Map<string, Player>;
  gameType: GameType;
  fsmState: FSMState;
  round: number;
  maxRounds: number;
}

/**
 * GamePlugin interface that all games must implement
 */
export interface GamePlugin {
  /**
   * Initialize the plugin with room state
   */
  init(roomState: Room): void;

  /**
   * Handle an intent
   * Returns IntentResult indicating success or failure
   */
  onIntent(intent: Intent, ctx: PluginContext): Promise<IntentResult>;

  /**
   * Validate an intent before processing
   * Returns true if valid, false otherwise
   */
  validate(intent: Intent, ctx: PluginContext): boolean;

  /**
   * Apply an event to the game state
   * This is called when an intent is processed and generates an event
   */
  applyEvent(event: import('./types.js').GameEvent, ctx: PluginContext): void;

  /**
   * Serialize game state for synchronization
   * Returns the state object to be sent to clients
   */
  serializeState(roomState: Room): BaseGameState;

  /**
   * Cleanup when game ends or room is destroyed
   */
  cleanup(roomState: Room): void;

  /**
   * Get render descriptor for display layouts
   * Defines how the game should be rendered on host display
   */
  getRenderDescriptor(): RenderDescriptor;
}

/**
 * Base implementation of GamePlugin with default behaviors
 * Games can extend this to reduce boilerplate
 */
export abstract class BaseGamePlugin implements GamePlugin {
  abstract init(roomState: Room): void;
  abstract onIntent(intent: Intent, ctx: PluginContext): Promise<IntentResult>;
  abstract serializeState(roomState: Room): BaseGameState;
  abstract getRenderDescriptor(): RenderDescriptor;

  validate(intent: Intent, ctx: PluginContext): boolean {
    // Default validation: check intent has required fields
    return !!(intent.id && intent.type && intent.playerId && intent.roomCode && intent.action);
  }

  applyEvent(event: import('./types.js').GameEvent, ctx: PluginContext): void {
    // Default: no-op, games can override
  }

  cleanup(roomState: Room): void {
    // Default: no-op, games can override
  }
}

