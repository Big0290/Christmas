import {
  BaseGameEngine,
  GameType,
  GameState,
  NaughtyOrNiceGameState,
  NaughtyPrompt,
  Player,
  shuffleArray,
} from '@christmas/core';

const DEFAULT_PROMPTS: NaughtyPrompt[] = [
  { id: '1', prompt: 'Someone who talks during movies', category: 'Social', contentRating: 'pg' },
  { id: '2', prompt: "People who don't return shopping carts", category: 'Social', contentRating: 'pg' },
  { id: '3', prompt: 'Friends who spoil TV shows', category: 'Social', contentRating: 'pg' },
  { id: '4', prompt: 'Someone who chews with their mouth open', category: 'Manners', contentRating: 'pg' },
  { id: '5', prompt: "People who don't use turn signals", category: 'Driving', contentRating: 'pg' },
  { id: '6', prompt: 'Someone who steals food from the office fridge', category: 'Work', contentRating: 'pg' },
  { id: '7', prompt: 'People who leave the toilet seat up', category: 'Home', contentRating: 'pg' },
  { id: '8', prompt: "Someone who's always late", category: 'Social', contentRating: 'pg' },
  { id: '9', prompt: "People who don't silence their phone in movies", category: 'Social', contentRating: 'pg' },
  { id: '10', prompt: 'Someone who regifts presents', category: 'Holidays', contentRating: 'pg' },
];

export class NaughtyOrNiceGame extends BaseGameEngine<NaughtyOrNiceGameState> {
  private prompts: NaughtyPrompt[] = [];

  constructor(players: Map<string, Player>) {
    super(GameType.NAUGHTY_OR_NICE, players);
    this.prompts = shuffleArray(DEFAULT_PROMPTS);
    // Update maxRounds now that prompts are initialized
    this.state.maxRounds = Math.min(this.prompts.length, 10);
  }

  protected createInitialState(): NaughtyOrNiceGameState {
    const scores: Record<string, number> = {};
    this.players.forEach((player) => {
      scores[player.id] = 0;
    });

    return {
      gameType: GameType.NAUGHTY_OR_NICE,
      state: GameState.LOBBY,
      round: 0,
      maxRounds: 10, // Default value, will be updated in constructor
      startedAt: 0,
      scores,
      currentPrompt: null,
      votes: {},
      votingClosed: false,
    };
  }

  protected onPlaying(): void {
    // Start first round (round starts at 0, so we need to increment)
    if (this.state.round === 0) {
      this.state.round = 1;
    }
    this.startVoting();
  }

  protected onRoundStart(): void {
    this.startVoting();
  }

  private startVoting(): void {
    // Use round - 1 for array indexing (round is 1-indexed)
    const promptIndex = this.state.round - 1;
    if (promptIndex >= this.prompts.length) {
      this.end();
      return;
    }
    this.state.currentPrompt = this.prompts[promptIndex];
    this.state.votes = {};
    this.state.votingClosed = false;

    // Timer to end voting
    this.setTimer(() => {
      this.endVoting();
    }, 15000);
  }

  private endVoting(): void {
    this.state.votingClosed = true;

    // Calculate results
    let naughtyCount = 0;
    let niceCount = 0;

    Object.values(this.state.votes).forEach((vote) => {
      if (vote === 'naughty') naughtyCount++;
      else niceCount++;
    });

    // Award points to majority voters
    const majority = naughtyCount > niceCount ? 'naughty' : 'nice';
    Object.entries(this.state.votes).forEach(([playerId, vote]) => {
      if (vote === majority) {
        this.updateScore(playerId, 10);
      }
    });

    this.state.state = GameState.ROUND_END;

    // Move to next round
    this.setTimer(() => {
      this.nextRound();
    }, 5000);
  }

  handlePlayerAction(playerId: string, action: string, data: any): void {
    if (action === 'vote' && this.state.state === GameState.PLAYING && !this.state.votingClosed) {
      if (!this.state.votes[playerId]) {
        this.state.votes[playerId] = data.choice;

        // If all players voted, end voting early
        if (Object.keys(this.state.votes).length === this.players.size) {
          this.clearTimer();
          this.endVoting();
        }
      }
    }
  }

  getClientState(playerId: string): any {
    return {
      ...this.state,
      hasVoted: this.state.votes[playerId] !== undefined,
      scoreboard: this.getScoreboard(),
    };
  }
}
