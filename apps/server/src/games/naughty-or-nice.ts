import {
  BaseGameEngine,
  GameType,
  GameState,
  NaughtyOrNiceGameState,
  NaughtyPrompt,
  Player,
  shuffleArray,
  calculateSpeedBonus,
  NaughtyOrNiceSettings,
} from '@christmas/core';
import { translatePrompt } from '../utils/translations.js';

const DEFAULT_PROMPTS: NaughtyPrompt[] = [
  {
    id: '1',
    prompt: 'Someone who talks during movies',
    category: 'Social',
    contentRating: 'pg',
    translations: {
      en: {
        prompt: 'Someone who talks during movies',
      },
      fr: {
        prompt: "Quelqu'un qui parle pendant les films",
      },
    },
  },
  {
    id: '2',
    prompt: "People who don't return shopping carts",
    category: 'Social',
    contentRating: 'pg',
    translations: {
      en: {
        prompt: "People who don't return shopping carts",
      },
      fr: {
        prompt: 'Les gens qui ne remettent pas les chariots de courses',
      },
    },
  },
  {
    id: '3',
    prompt: 'Friends who spoil TV shows',
    category: 'Social',
    contentRating: 'pg',
    translations: {
      en: {
        prompt: 'Friends who spoil TV shows',
      },
      fr: {
        prompt: 'Les amis qui révèlent les intrigues des séries TV',
      },
    },
  },
  {
    id: '4',
    prompt: 'Someone who chews with their mouth open',
    category: 'Manners',
    contentRating: 'pg',
    translations: {
      en: {
        prompt: 'Someone who chews with their mouth open',
      },
      fr: {
        prompt: "Quelqu'un qui mâche la bouche ouverte",
      },
    },
  },
  {
    id: '5',
    prompt: "People who don't use turn signals",
    category: 'Driving',
    contentRating: 'pg',
    translations: {
      en: {
        prompt: "People who don't use turn signals",
      },
      fr: {
        prompt: "Les gens qui n'utilisent pas les clignotants",
      },
    },
  },
  {
    id: '6',
    prompt: 'Someone who steals food from the office fridge',
    category: 'Work',
    contentRating: 'pg',
    translations: {
      en: {
        prompt: 'Someone who steals food from the office fridge',
      },
      fr: {
        prompt: "Quelqu'un qui vole la nourriture du frigo du bureau",
      },
    },
  },
  {
    id: '7',
    prompt: 'People who leave the toilet seat up',
    category: 'Home',
    contentRating: 'pg',
    translations: {
      en: {
        prompt: 'People who leave the toilet seat up',
      },
      fr: {
        prompt: 'Les gens qui laissent le siège des toilettes relevé',
      },
    },
  },
  {
    id: '8',
    prompt: "Someone who's always late",
    category: 'Social',
    contentRating: 'pg',
    translations: {
      en: {
        prompt: "Someone who's always late",
      },
      fr: {
        prompt: "Quelqu'un qui est toujours en retard",
      },
    },
  },
  {
    id: '9',
    prompt: "People who don't silence their phone in movies",
    category: 'Social',
    contentRating: 'pg',
    translations: {
      en: {
        prompt: "People who don't silence their phone in movies",
      },
      fr: {
        prompt: 'Les gens qui ne mettent pas leur téléphone en silencieux au cinéma',
      },
    },
  },
  {
    id: '10',
    prompt: 'Someone who regifts presents',
    category: 'Holidays',
    contentRating: 'pg',
    translations: {
      en: {
        prompt: 'Someone who regifts presents',
      },
      fr: {
        prompt: "Quelqu'un qui offre des cadeaux regiftés",
      },
    },
  },
];

export class NaughtyOrNiceGame extends BaseGameEngine<NaughtyOrNiceGameState> {
  private prompts: NaughtyPrompt[] = [];
  private timePerRound: number = 15000; // 15 seconds
  private settings: NaughtyOrNiceSettings;

  constructor(
    players: Map<string, Player>,
    customPrompts?: NaughtyPrompt[],
    settings?: NaughtyOrNiceSettings
  ) {
    super(GameType.NAUGHTY_OR_NICE, players);

    // Use provided settings or defaults
    this.settings = settings || {
      promptCount: 10,
      contentFilter: 'pg',
      voteMode: 'majority',
      revealSpeed: 'medium',
      timePerRound: 15,
      customPromptSetId: null,
      anonymousVoting: true,
    };

    this.prompts =
      customPrompts && customPrompts.length > 0
        ? shuffleArray(customPrompts)
        : shuffleArray(DEFAULT_PROMPTS);

    // Filter by content rating
    this.prompts = this.prompts.filter((p) => {
      if (this.settings.contentFilter === 'none') return true;
      if (this.settings.contentFilter === 'pg13') {
        return p.contentRating === 'pg' || p.contentRating === 'pg13';
      }
      return p.contentRating === 'pg';
    });

    // Validate that we have prompts
    if (this.prompts.length === 0) {
      console.error('[NaughtyOrNiceGame] No prompts available after filtering!');
      // Fallback to all prompts if filtering resulted in empty array
      this.prompts = shuffleArray(DEFAULT_PROMPTS);
    }

    // Update maxRounds based on promptCount setting
    this.state.maxRounds = Math.min(this.prompts.length, this.settings.promptCount);
    
    if (this.state.maxRounds === 0) {
      console.error('[NaughtyOrNiceGame] maxRounds is 0! Prompts:', this.prompts.length, 'promptCount:', this.settings.promptCount);
      // Ensure at least 1 round
      this.state.maxRounds = Math.min(this.prompts.length, 1);
    }
    
    console.log(`[NaughtyOrNiceGame] Initialized with ${this.prompts.length} prompts, ${this.state.maxRounds} rounds`);

    // Set time per round from settings (convert seconds to milliseconds)
    // Optionally adjust based on revealSpeed if needed
    let baseTime = this.settings.timePerRound;
    if (this.settings.revealSpeed === 'slow') {
      baseTime = Math.min(60, baseTime * 1.2); // Increase by 20% for slow reveal
    } else if (this.settings.revealSpeed === 'fast') {
      baseTime = Math.max(5, baseTime * 0.8); // Decrease by 20% for fast reveal
    }
    this.timePerRound = baseTime * 1000;
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

    // Move to next round (or end game if this was the last round)
    this.setTimer(() => {
      // If this was the last round, end the game instead of starting a new round
      if (this.state.round >= this.state.maxRounds) {
        this.end();
      } else {
      this.nextRound();
      }
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

  protected onMigratePlayer(oldPlayerId: string, newPlayerId: string): void {
    // Migrate vote if it exists
    if (this.state.votes && this.state.votes[oldPlayerId] !== undefined) {
      this.state.votes[newPlayerId] = this.state.votes[oldPlayerId];
      delete this.state.votes[oldPlayerId];
    }
    // Migrate vote time if it exists
    if (this.state.voteTimes && this.state.voteTimes[oldPlayerId] !== undefined) {
      this.state.voteTimes[newPlayerId] = this.state.voteTimes[oldPlayerId];
      delete this.state.voteTimes[oldPlayerId];
    }
    console.log(
      `[NaughtyOrNice] Migrated vote from ${oldPlayerId.substring(0, 8)} to ${newPlayerId.substring(0, 8)}`
    );
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
