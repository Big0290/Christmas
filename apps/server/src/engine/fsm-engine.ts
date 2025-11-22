import { GameState, GameType, FSMState } from '@christmas/core';

// FSMState is exported from @christmas/core

/**
 * FSM transition record for replay
 */
export interface FSMTransition {
  from: FSMState;
  to: FSMState;
  timestamp: number;
  gameType: GameType | null;
  round?: number;
  reason?: string;
}

/**
 * FSMEngine wraps game state machines with standard FSM states and transitions.
 * 
 * Responsibilities:
 * - Define standard FSM states: LOBBY → SETUP → ROUND_START → ROUND_END → SCOREBOARD → NEXT_ROUND → GAME_END
 * - Validate transitions before applying
 * - Track FSM state history for replay
 * - Map game states to FSM states
 */
export class FSMEngine {
  private currentState: FSMState = FSMState.LOBBY;
  private stateHistory: FSMTransition[] = [];
  private gameType: GameType | null = null;
  private currentRound: number = 0;
  private maxRounds: number = 0;

  /**
   * Valid transition map: Map<fromState, Set<toState>>
   */
  private static readonly VALID_TRANSITIONS: Map<FSMState, Set<FSMState>> = new Map<FSMState, Set<FSMState>>([
    [FSMState.LOBBY, new Set([FSMState.SETUP])],
    [FSMState.SETUP, new Set([FSMState.ROUND_START, FSMState.LOBBY])],
    [FSMState.ROUND_START, new Set([FSMState.ROUND_END, FSMState.GAME_END])],
    [FSMState.ROUND_END, new Set([FSMState.SCOREBOARD, FSMState.GAME_END])],
    [FSMState.SCOREBOARD, new Set([FSMState.NEXT_ROUND, FSMState.GAME_END])],
    [FSMState.NEXT_ROUND, new Set([FSMState.ROUND_START, FSMState.GAME_END])],
    [FSMState.GAME_END, new Set([FSMState.LOBBY])],
  ]);

  constructor(gameType: GameType | null = null) {
    this.gameType = gameType;
  }

  /**
   * Get current FSM state
   */
  getState(): FSMState {
    return this.currentState;
  }

  /**
   * Get state history
   */
  getStateHistory(): FSMTransition[] {
    return [...this.stateHistory];
  }

  /**
   * Check if a transition is valid
   */
  canTransition(to: FSMState): boolean {
    const validTargets = FSMEngine.VALID_TRANSITIONS.get(this.currentState);
    return validTargets ? validTargets.has(to) : false;
  }

  /**
   * Transition to a new state
   * Returns true if transition was successful, false otherwise
   */
  transition(to: FSMState, reason?: string): boolean {
    if (!this.canTransition(to)) {
      console.warn(
        `[FSMEngine] Invalid transition from ${this.currentState} to ${to}`
      );
      return false;
    }

    const transition: FSMTransition = {
      from: this.currentState,
      to,
      timestamp: Date.now(),
      gameType: this.gameType,
      round: this.currentRound,
      reason,
    };

    this.stateHistory.push(transition);
    this.currentState = to;

    console.log(
      `[FSMEngine] Transitioned from ${transition.from} to ${to} (round ${this.currentRound})`
    );

    return true;
  }

  /**
   * Map GameState to FSMState
   */
  static mapGameStateToFSM(gameState: GameState, round: number, maxRounds: number): FSMState {
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
        // Paused state doesn't map to FSM - it's a modifier
        // Return the state before pause
        return FSMState.ROUND_START;
      default:
        return FSMState.LOBBY;
    }
  }

  /**
   * Map FSMState to GameState
   */
  static mapFSMToGameState(fsmState: FSMState): GameState {
    switch (fsmState) {
      case FSMState.LOBBY:
        return GameState.LOBBY;
      case FSMState.SETUP:
        return GameState.STARTING;
      case FSMState.ROUND_START:
        return GameState.PLAYING;
      case FSMState.ROUND_END:
        return GameState.ROUND_END;
      case FSMState.SCOREBOARD:
        return GameState.ROUND_END; // Scoreboard is shown during round end
      case FSMState.NEXT_ROUND:
        return GameState.PLAYING; // Next round starts playing
      case FSMState.GAME_END:
        return GameState.GAME_END;
      default:
        return GameState.LOBBY;
    }
  }

  /**
   * Set game type
   */
  setGameType(gameType: GameType | null): void {
    this.gameType = gameType;
  }

  /**
   * Set round information
   */
  setRound(round: number, maxRounds: number): void {
    this.currentRound = round;
    this.maxRounds = maxRounds;
  }

  /**
   * Get current round
   */
  getRound(): number {
    return this.currentRound;
  }

  /**
   * Get max rounds
   */
  getMaxRounds(): number {
    return this.maxRounds;
  }

  /**
   * Reset FSM to LOBBY state
   */
  reset(): void {
    this.currentState = FSMState.LOBBY;
    this.stateHistory = [];
    this.currentRound = 0;
    this.maxRounds = 0;
    this.gameType = null;
  }

  /**
   * Replay transitions from history
   * Useful for late joiners or reconnecting clients
   */
  replayTransitions(transitions: FSMTransition[]): void {
    this.reset();
    for (const transition of transitions) {
      if (this.canTransition(transition.to)) {
        this.currentState = transition.to;
        this.stateHistory.push(transition);
        if (transition.round !== undefined) {
          this.currentRound = transition.round;
        }
        if (transition.gameType !== null) {
          this.gameType = transition.gameType;
        }
      }
    }
  }
}

