import { GameType, GameState, BaseGameState, Player } from './types.js';

export abstract class BaseGameEngine<TState extends BaseGameState = BaseGameState> {
  protected state: TState;
  protected players: Map<string, Player>;
  protected timer: NodeJS.Timeout | null = null;

  constructor(
    protected gameType: GameType,
    players: Map<string, Player>
  ) {
    this.players = players;
    this.state = this.createInitialState();
  }

  // Abstract methods that must be implemented by each game
  protected abstract createInitialState(): TState;
  abstract handlePlayerAction(playerId: string, action: string, data: any): void;
  abstract getClientState(playerId: string): any;
  
  // Lifecycle methods
  start(): void {
    this.state.state = GameState.STARTING;
    this.onStart();
    setTimeout(() => {
      this.state.state = GameState.PLAYING;
      this.state.startedAt = Date.now();
      this.onPlaying();
    }, 3000); // 3 second countdown
  }

  pause(): void {
    this.state.state = GameState.PAUSED;
    this.clearTimer();
    this.onPause();
  }

  resume(): void {
    this.state.state = GameState.PLAYING;
    this.onResume();
  }

  end(): void {
    this.state.state = GameState.GAME_END;
    this.clearTimer();
    this.onEnd();
  }

  // Optional lifecycle hooks
  protected onStart(): void {}
  protected onPlaying(): void {}
  protected onPause(): void {}
  protected onResume(): void {}
  protected onEnd(): void {}

  // State management
  getState(): TState {
    return this.state;
  }

  updateScore(playerId: string, points: number): void {
    if (this.state.scores[playerId] === undefined) {
      this.state.scores[playerId] = 0;
    }
    this.state.scores[playerId] += points;
  }

  getScoreboard(): Array<{ playerId: string; name: string; score: number }> {
    return Array.from(this.players.values())
      .map(player => ({
        playerId: player.id,
        name: player.name,
        score: this.state.scores[player.id] || 0,
      }))
      .sort((a, b) => b.score - a.score);
  }

  // Round management
  nextRound(): void {
    if (this.state.round < this.state.maxRounds) {
      this.state.round++;
      this.state.state = GameState.PLAYING;
      this.onRoundStart();
    } else {
      this.end();
    }
  }

  protected onRoundStart(): void {}

  // Timer utilities
  protected setTimer(callback: () => void, delay: number): void {
    this.clearTimer();
    this.timer = setTimeout(callback, delay);
  }

  protected clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  // Player migration for reconnection
  // Migrates player data from old playerId to new playerId when player reconnects
  // Override in subclasses to handle game-specific data (answers, guesses, picks, votes)
  migratePlayer(oldPlayerId: string, newPlayerId: string): void {
    // Update players map
    const player = this.players.get(oldPlayerId);
    if (player) {
      // Update player ID
      player.id = newPlayerId;
      // Remove old entry and add with new ID
      this.players.delete(oldPlayerId);
      this.players.set(newPlayerId, player);
      
      // Migrate score if it exists
      if (this.state.scores && this.state.scores[oldPlayerId] !== undefined) {
        const score = this.state.scores[oldPlayerId];
        this.state.scores[newPlayerId] = score;
        delete this.state.scores[oldPlayerId];
      }
    }
    
    // Call game-specific migration
    this.onMigratePlayer(oldPlayerId, newPlayerId);
  }

  // Override this in subclasses to migrate game-specific data
  protected onMigratePlayer(oldPlayerId: string, newPlayerId: string): void {}

  // Cleanup
  destroy(): void {
    this.clearTimer();
    this.onDestroy();
  }

  protected onDestroy(): void {}
}
