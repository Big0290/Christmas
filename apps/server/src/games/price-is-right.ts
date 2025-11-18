import {
  BaseGameEngine,
  GameType,
  GameState,
  PriceIsRightGameState,
  PriceItem,
  Player,
  shuffleArray,
  calculateSpeedBonus,
} from '@christmas/core';
import { translatePriceItem } from '../utils/translations.js';

const DEFAULT_ITEMS: PriceItem[] = [
  { id: '1', name: 'iPhone 15 Pro', description: 'Latest Apple smartphone', price: 999.0, imageUrl: 'https://picsum.photos/seed/iphone/400/300', category: 'Electronics' },
  { id: '2', name: 'PlayStation 5', description: 'Gaming console', price: 499.99, imageUrl: 'https://picsum.photos/seed/ps5/400/300', category: 'Electronics' },
  { id: '3', name: 'AirPods Pro', description: 'Wireless earbuds', price: 249.0, imageUrl: 'https://picsum.photos/seed/airpods/400/300', category: 'Electronics' },
  { id: '4', name: 'Christmas Sweater', description: 'Ugly holiday sweater', price: 39.99, imageUrl: 'https://picsum.photos/seed/sweater/400/300', category: 'Clothing' },
  { id: '5', name: 'Gingerbread House Kit', description: 'DIY holiday treat', price: 24.99, imageUrl: 'https://picsum.photos/seed/gingerbread/400/300', category: 'Food' },
  { id: '6', name: 'LEGO Star Wars Set', description: '1000+ pieces', price: 149.99, imageUrl: 'https://picsum.photos/seed/lego/400/300', category: 'Toys' },
  { id: '7', name: 'Instant Pot', description: 'Multi-use cooker', price: 89.99, imageUrl: 'https://picsum.photos/seed/instantpot/400/300', category: 'Kitchen' },
  { id: '8', name: 'Weighted Blanket', description: '15lb cozy blanket', price: 79.99, imageUrl: 'https://picsum.photos/seed/blanket/400/300', category: 'Home' },
  { id: '9', name: 'Ring Doorbell', description: 'Smart home security', price: 179.99, imageUrl: 'https://picsum.photos/seed/ring/400/300', category: 'Electronics' },
  { id: '10', name: 'Starbucks Coffee Maker', description: 'Programmable brewer', price: 129.99, imageUrl: 'https://picsum.photos/seed/coffee/400/300', category: 'Kitchen' },
];

export class PriceIsRightGame extends BaseGameEngine<PriceIsRightGameState> {
  private items: PriceItem[] = [];
  private scoringMode: 'closest_without_over' | 'closest_overall' = 'closest_without_over';
  private timePerRound: number = 30000; // 30 seconds

  constructor(players: Map<string, Player>, customItems?: PriceItem[], timeLimitSeconds?: number) {
    super(GameType.PRICE_IS_RIGHT, players);
    this.items = customItems && customItems.length > 0
      ? shuffleArray(customItems)
      : shuffleArray(DEFAULT_ITEMS);
    // Update maxRounds now that items are initialized
    this.state.maxRounds = Math.min(this.items.length, 10);
    // Set time limit if provided (convert seconds to milliseconds)
    if (timeLimitSeconds !== undefined) {
      this.timePerRound = timeLimitSeconds * 1000;
    }
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
          const speedBonus = calculateSpeedBonus(guessTime, this.timePerRound, speedBonusMultiplier);
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
          const speedBonus = calculateSpeedBonus(guessTime, this.timePerRound, speedBonusMultiplier);
          points += speedBonus;
        }
        
        this.updateScore(closest[0], points);
      }
    }

    this.state.state = GameState.ROUND_END;

    // Move to next round
    this.setTimer(() => {
      this.nextRound();
    }, 5000);
  }

  handlePlayerAction(playerId: string, action: string, data: any): void {
    if (action === 'guess' && this.state.state === GameState.PLAYING && !this.state.guessingClosed) {
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
    console.log(`[PriceIsRight] Migrated guess from ${oldPlayerId.substring(0, 8)} to ${newPlayerId.substring(0, 8)}`);
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
