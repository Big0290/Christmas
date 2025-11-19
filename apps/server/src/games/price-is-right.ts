import {
  BaseGameEngine,
  GameType,
  GameState,
  PriceIsRightGameState,
  PriceItem,
  Player,
  shuffleArray,
  calculateSpeedBonus,
  PriceIsRightSettings,
} from '@christmas/core';
import { translatePriceItem } from '../utils/translations.js';

const DEFAULT_ITEMS: PriceItem[] = [
  {
    id: '1',
    name: 'iPhone 15 Pro',
    description: 'Latest Apple smartphone',
    price: 999.0,
    imageUrl: 'https://picsum.photos/seed/iphone/400/300',
    category: 'Electronics',
    translations: {
      en: {
        name: 'iPhone 15 Pro',
        description: 'Latest Apple smartphone',
      },
      fr: {
        name: 'iPhone 15 Pro',
        description: 'Dernier smartphone Apple',
      },
    },
  },
  {
    id: '2',
    name: 'PlayStation 5',
    description: 'Gaming console',
    price: 499.99,
    imageUrl: 'https://picsum.photos/seed/ps5/400/300',
    category: 'Electronics',
    translations: {
      en: {
        name: 'PlayStation 5',
        description: 'Gaming console',
      },
      fr: {
        name: 'PlayStation 5',
        description: 'Console de jeu',
      },
    },
  },
  {
    id: '3',
    name: 'AirPods Pro',
    description: 'Wireless earbuds',
    price: 249.0,
    imageUrl: 'https://picsum.photos/seed/airpods/400/300',
    category: 'Electronics',
    translations: {
      en: {
        name: 'AirPods Pro',
        description: 'Wireless earbuds',
      },
      fr: {
        name: 'AirPods Pro',
        description: 'Écouteurs sans fil',
      },
    },
  },
  {
    id: '4',
    name: 'Christmas Sweater',
    description: 'Ugly holiday sweater',
    price: 39.99,
    imageUrl: 'https://picsum.photos/seed/sweater/400/300',
    category: 'Clothing',
    translations: {
      en: {
        name: 'Christmas Sweater',
        description: 'Ugly holiday sweater',
      },
      fr: {
        name: 'Pull de Noël',
        description: 'Pull de fête moche',
      },
    },
  },
  {
    id: '5',
    name: 'Gingerbread House Kit',
    description: 'DIY holiday treat',
    price: 24.99,
    imageUrl: 'https://picsum.photos/seed/gingerbread/400/300',
    category: 'Food',
    translations: {
      en: {
        name: 'Gingerbread House Kit',
        description: 'DIY holiday treat',
      },
      fr: {
        name: "Kit Maison en Pain d'Épices",
        description: 'Trait de vacances à faire soi-même',
      },
    },
  },
  {
    id: '6',
    name: 'LEGO Star Wars Set',
    description: '1000+ pieces',
    price: 149.99,
    imageUrl: 'https://picsum.photos/seed/lego/400/300',
    category: 'Toys',
    translations: {
      en: {
        name: 'LEGO Star Wars Set',
        description: '1000+ pieces',
      },
      fr: {
        name: 'Set LEGO Star Wars',
        description: 'Plus de 1000 pièces',
      },
    },
  },
  {
    id: '7',
    name: 'Instant Pot',
    description: 'Multi-use cooker',
    price: 89.99,
    imageUrl: 'https://picsum.photos/seed/instantpot/400/300',
    category: 'Kitchen',
    translations: {
      en: {
        name: 'Instant Pot',
        description: 'Multi-use cooker',
      },
      fr: {
        name: 'Instant Pot',
        description: 'Cuiseur multi-usages',
      },
    },
  },
  {
    id: '8',
    name: 'Weighted Blanket',
    description: '15lb cozy blanket',
    price: 79.99,
    imageUrl: 'https://picsum.photos/seed/blanket/400/300',
    category: 'Home',
    translations: {
      en: {
        name: 'Weighted Blanket',
        description: '15lb cozy blanket',
      },
      fr: {
        name: 'Couverture Ponderée',
        description: 'Couverture douillette de 7 kg',
      },
    },
  },
  {
    id: '9',
    name: 'Ring Doorbell',
    description: 'Smart home security',
    price: 179.99,
    imageUrl: 'https://picsum.photos/seed/ring/400/300',
    category: 'Electronics',
    translations: {
      en: {
        name: 'Ring Doorbell',
        description: 'Smart home security',
      },
      fr: {
        name: 'Sonnette Ring',
        description: 'Sécurité domotique',
      },
    },
  },
  {
    id: '10',
    name: 'Starbucks Coffee Maker',
    description: 'Programmable brewer',
    price: 129.99,
    imageUrl: 'https://picsum.photos/seed/coffee/400/300',
    category: 'Kitchen',
    translations: {
      en: {
        name: 'Starbucks Coffee Maker',
        description: 'Programmable brewer',
      },
      fr: {
        name: 'Machine à Café Starbucks',
        description: 'Cafetière programmable',
      },
    },
  },
];

export class PriceIsRightGame extends BaseGameEngine<PriceIsRightGameState> {
  private items: PriceItem[] = [];
  private scoringMode: 'closest_without_over' | 'closest_overall' = 'closest_without_over';
  private timePerRound: number = 30000; // 30 seconds
  private settings: PriceIsRightSettings;

  constructor(
    players: Map<string, Player>,
    customItems?: PriceItem[],
    settings?: PriceIsRightSettings
  ) {
    super(GameType.PRICE_IS_RIGHT, players);

    // Use provided settings or defaults
    this.settings = settings || {
      roundCount: 10,
      scoringMode: 'closest_without_over',
      itemSelection: 'random',
      selectedCategories: [],
      timeLimit: 30,
      customItemSetId: null,
      showHints: false,
    };

    this.items =
      customItems && customItems.length > 0
        ? shuffleArray(customItems)
        : shuffleArray(DEFAULT_ITEMS);

    // Filter by category if categories are selected
    if (this.settings.selectedCategories && this.settings.selectedCategories.length > 0) {
      this.items = this.items.filter(
        (item) => item.category && this.settings.selectedCategories!.includes(item.category)
      );
    }

    // Validate that we have items
    if (this.items.length === 0) {
      console.error('[PriceIsRightGame] No items available after filtering!');
      // Fallback to all items if filtering resulted in empty array
      this.items = shuffleArray(DEFAULT_ITEMS);
    }

    // Update maxRounds based on roundCount setting
    this.state.maxRounds = Math.min(this.items.length, this.settings.roundCount);
    
    if (this.state.maxRounds === 0) {
      console.error('[PriceIsRightGame] maxRounds is 0! Items:', this.items.length, 'roundCount:', this.settings.roundCount);
      // Ensure at least 1 round
      this.state.maxRounds = Math.min(this.items.length, 1);
    }
    
    console.log(`[PriceIsRightGame] Initialized with ${this.items.length} items, ${this.state.maxRounds} rounds`);

    // Set scoring mode
    this.scoringMode = this.settings.scoringMode;

    // Set time limit (convert seconds to milliseconds)
    this.timePerRound = this.settings.timeLimit * 1000;
  }

  protected createInitialState(): PriceIsRightGameState {
    const scores: Record<string, number> = {};
    this.players.forEach((player) => {
      scores[player.id] = 0;
    });

    return {
      gameType: GameType.PRICE_IS_RIGHT,
      state: GameState.LOBBY,
      round: 0,
      maxRounds: 10, // Default value, will be updated in constructor
      startedAt: 0,
      scores,
      currentItem: null,
      guesses: {},
      guessingClosed: false,
      roundStartTime: 0,
      guessTimes: {},
    };
  }

  protected onPlaying(): void {
    // Start first round (round starts at 0, so we need to increment)
    if (this.state.round === 0) {
      this.state.round = 1;
    }
    this.startGuessing();
  }

  protected onRoundStart(): void {
    this.startGuessing();
  }

  private startGuessing(): void {
    // Use round - 1 for array indexing (round is 1-indexed)
    const itemIndex = this.state.round - 1;
    if (itemIndex >= this.items.length) {
      this.end();
      return;
    }
    this.state.currentItem = this.items[itemIndex];
    this.state.guesses = {};
    this.state.guessTimes = {};
    this.state.guessingClosed = false;
    this.state.roundStartTime = Date.now();

    // Timer to end guessing
    this.setTimer(() => {
      this.endGuessing();
    }, this.timePerRound);
  }

  private endGuessing(): void {
    this.state.guessingClosed = true;

    if (!this.state.currentItem) return;

    const actualPrice = this.state.currentItem.price;
    const guesses = Object.entries(this.state.guesses);

    const speedBonusMultiplier = 1.0; // Moderate multiplier for price game

    if (this.scoringMode === 'closest_without_over') {
      // Classic Price Is Right rules
      const validGuesses = guesses.filter(([, guess]) => guess <= actualPrice);

      if (validGuesses.length > 0) {
        const closest = validGuesses.reduce((best, current) => {
          const bestDiff = actualPrice - best[1];
          const currentDiff = actualPrice - current[1];
          return currentDiff < bestDiff ? current : best;
        });

        let points = 100;
        // Speed bonus for closest guess
        if (this.state.guessTimes[closest[0]]) {
          const guessTime = this.state.guessTimes[closest[0]] - this.state.roundStartTime;
          const speedBonus = calculateSpeedBonus(
            guessTime,
            this.timePerRound,
            speedBonusMultiplier
          );
          points += speedBonus;
        }

        this.updateScore(closest[0], points);
      }
    } else {
      // Closest overall
      if (guesses.length > 0) {
        const closest = guesses.reduce((best, current) => {
          const bestDiff = Math.abs(actualPrice - best[1]);
          const currentDiff = Math.abs(actualPrice - current[1]);
          return currentDiff < bestDiff ? current : best;
        });

        let points = 100;
        // Speed bonus for closest guess
        if (this.state.guessTimes[closest[0]]) {
          const guessTime = this.state.guessTimes[closest[0]] - this.state.roundStartTime;
          const speedBonus = calculateSpeedBonus(
            guessTime,
            this.timePerRound,
            speedBonusMultiplier
          );
          points += speedBonus;
        }

        this.updateScore(closest[0], points);
      }
    }

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
    if (
      action === 'guess' &&
      this.state.state === GameState.PLAYING &&
      !this.state.guessingClosed
    ) {
      if (!this.state.guesses[playerId]) {
        this.state.guesses[playerId] = data.guess;
        this.state.guessTimes[playerId] = Date.now();

        // If all players guessed, end guessing early
        if (Object.keys(this.state.guesses).length === this.players.size) {
          this.clearTimer();
          this.endGuessing();
        }
      }
    }
  }

  protected onMigratePlayer(oldPlayerId: string, newPlayerId: string): void {
    // Migrate guess if it exists
    if (this.state.guesses && this.state.guesses[oldPlayerId] !== undefined) {
      this.state.guesses[newPlayerId] = this.state.guesses[oldPlayerId];
      delete this.state.guesses[oldPlayerId];
    }
    // Migrate guess time if it exists
    if (this.state.guessTimes && this.state.guessTimes[oldPlayerId] !== undefined) {
      this.state.guessTimes[newPlayerId] = this.state.guessTimes[oldPlayerId];
      delete this.state.guessTimes[oldPlayerId];
    }
    console.log(
      `[PriceIsRight] Migrated guess from ${oldPlayerId.substring(0, 8)} to ${newPlayerId.substring(0, 8)}`
    );
  }

  getClientState(playerId: string): any {
    // Get player's language preference, default to English
    const player = this.players.get(playerId);
    const language = player?.language || 'en';

    // Translate current item if it exists
    let translatedItem = null;
    if (this.state.currentItem) {
      translatedItem = translatePriceItem(this.state.currentItem, language);
      // Don't send actual price until guessing is closed
      translatedItem = {
        ...translatedItem,
        price: this.state.guessingClosed ? translatedItem.price : undefined,
      };
    }

    return {
      ...this.state,
      currentItem: translatedItem,
      hasGuessed: this.state.guesses[playerId] !== undefined,
      scoreboard: this.getScoreboard(),
    };
  }
}
