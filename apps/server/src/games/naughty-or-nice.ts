import {
  BaseGameEngine,
  GameType,
  GameState,
  NaughtyOrNiceGameState,
  NaughtyPrompt,
  Player,
  shuffleArray,
  calculateSpeedBonus,
} from '@christmas/core';
import { translatePrompt } from '../utils/translations.js';

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
  private timePerRound: number = 15000; // 15 seconds

  constructor(players: Map<string, Player>, customPrompts?: NaughtyPrompt[], timePerRoundSeconds?: number) {
    super(GameType.NAUGHTY_OR_NICE, players);
    this.prompts = customPrompts && customPrompts.length > 0
      ? shuffleArray(customPrompts)
      : shuffleArray(DEFAULT_PROMPTS);
    // Update maxRounds now that prompts are initialized
    this.state.maxRounds = Math.min(this.prompts.length, 10);
    // Set time per round if provided (convert seconds to milliseconds)
    if (timePerRoundSeconds !== undefined) {
      this.timePerRound = timePerRoundSeconds * 1000;
    }
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
      roundStartTime: 0,
      voteTimes: {},
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
    this.state.voteTimes = {};
    this.state.votingClosed = false;
    this.state.roundStartTime = Date.now();

    // Timer to end voting
    this.setTimer(() => {
      this.endVoting();
    }, this.timePerRound);
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

    // Award points to majority voters with speed bonus
    const majority = naughtyCount > niceCount ? 'naughty' : 'nice';
    const speedBonusMultiplier = 0.5; // Lower multiplier for voting game
    
    Object.entries(this.state.votes).forEach(([playerId, vote]) => {
      if (vote === majority) {
        let points = 10;
        
        // Speed bonus
        if (this.state.voteTimes[playerId]) {
          const voteTime = this.state.voteTimes[playerId] - this.state.roundStartTime;
          const speedBonus = calculateSpeedBonus(voteTime, this.timePerRound, speedBonusMultiplier);
          points += speedBonus;
        }
        
        this.updateScore(playerId, points);
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
        this.state.voteTimes[playerId] = Date.now();

        // If all players voted, end voting early
        if (Object.keys(this.state.votes).length === this.players.size) {
          this.clearTimer();
          this.endVoting();
        }
      }
    }
  }

  getClientState(playerId: string): any {
    // Get player's language preference, default to English
    const player = this.players.get(playerId);
    const language = player?.language || 'en';

    // Translate current prompt if it exists
    const translatedPrompt = this.state.currentPrompt
      ? translatePrompt(this.state.currentPrompt, language)
      : null;

    return {
      ...this.state,
      currentPrompt: translatedPrompt,
      hasVoted: this.state.votes[playerId] !== undefined,
      scoreboard: this.getScoreboard(),
    };
  }
}
