import {
  BaseGameEngine,
  GameType,
  GameState,
  EmojiCarolGameState,
  Player,
  calculateSpeedBonus,
  EmojiCarolSettings,
} from '@christmas/core';

const DEFAULT_EMOJIS = ['🎅', '🎄', '⛄', '🎁', '🔔', '⭐', '🕯️', '🦌', '🤶', '🧝', '🎿', '⛷️'];

export class EmojiCarolGame extends BaseGameEngine<EmojiCarolGameState> {
  private timePerRound: number = 15000; // 15 seconds
  private settings: EmojiCarolSettings;
  private uniquePickBonus: number = 5;

  constructor(players: Map<string, Player>, settings?: EmojiCarolSettings) {
    super(GameType.EMOJI_CAROL, players);

    // Use provided settings or defaults
    this.settings = settings || {
      roundCount: 8,
      allowDuplicates: false,
      uniquePickBonus: 5,
      customEmojiSetId: null,
      timePerRound: 15,
    };

    // Set time per round (convert seconds to milliseconds)
    this.timePerRound = this.settings.timePerRound * 1000;

    // Set unique pick bonus
    this.uniquePickBonus = this.settings.uniquePickBonus;

    // Update maxRounds based on settings (createInitialState is called before settings are set)
    this.state.maxRounds = this.settings.roundCount;
  }

  protected createInitialState(): EmojiCarolGameState {
    const scores: Record<string, number> = {};
    this.players.forEach((player) => {
      scores[player.id] = 0;
    });

    return {
      gameType: GameType.EMOJI_CAROL,
      state: GameState.LOBBY,
      round: 0,
      maxRounds: 8, // Default value, will be updated in constructor
      startedAt: 0,
      scores,
      availableEmojis: [...DEFAULT_EMOJIS],
      playerPicks: {},
      roundResults: [],
      roundStartTime: 0,
      pickTimes: {},
    };
  }

  protected onPlaying(): void {
    // Start first round (round starts at 0, so we need to increment)
    if (this.state.round === 0) {
      this.state.round = 1;
    }
    this.startRound();
  }

  protected onRoundStart(): void {
    this.startRound();
  }

  private startRound(): void {
    this.state.playerPicks = {};
    this.state.pickTimes = {};
    this.state.roundStartTime = Date.now();

    // Timer to end round
    this.setTimer(() => {
      this.endRound();
    }, this.timePerRound);
  }

  private endRound(): void {
    const picks = this.state.playerPicks;
    const emojiCounts = new Map<string, number>();

    // Count emoji picks
    Object.values(picks).forEach((emoji) => {
      emojiCounts.set(emoji, (emojiCounts.get(emoji) || 0) + 1);
    });

    // Find majority emoji
    let majorityEmoji: string | null = null;
    let maxCount = 0;
    emojiCounts.forEach((count, emoji) => {
      if (count > maxCount) {
        maxCount = count;
        majorityEmoji = emoji;
      }
    });

    // Award points with speed bonus
    const speedBonusMultiplier = 0.5; // Lower multiplier for emoji game

    Object.entries(picks).forEach(([playerId, emoji]) => {
      let points = 0;

      // Majority bonus
      if (emoji === majorityEmoji) {
        points += 10;
      }

      // Uniqueness bonus
      const pickCount = emojiCounts.get(emoji) || 0;
      if (pickCount === 1) {
        points += this.uniquePickBonus;
      }

      // Speed bonus (only if they got majority or uniqueness bonus)
      if (points > 0 && this.state.pickTimes[playerId]) {
        const pickTime = this.state.pickTimes[playerId] - this.state.roundStartTime;
        const speedBonus = calculateSpeedBonus(pickTime, this.timePerRound, speedBonusMultiplier);
        points += speedBonus;
      }

      this.updateScore(playerId, points);
    });

    this.state.roundResults.push({
      round: this.state.round,
      picks,
      majorityEmoji,
      emojiCounts: Object.fromEntries(emojiCounts),
    });

    this.state.state = GameState.ROUND_END;

    // Move to next round
    this.setTimer(() => {
      this.nextRound();
    }, 5000);
  }

  handlePlayerAction(playerId: string, action: string, data: any): void {
    if (action === 'pick' && this.state.state === GameState.PLAYING) {
      if (!this.state.playerPicks[playerId]) {
        this.state.playerPicks[playerId] = data.emoji;
        this.state.pickTimes[playerId] = Date.now();

        // If all players picked, end round early
        if (Object.keys(this.state.playerPicks).length === this.players.size) {
          this.clearTimer();
          this.endRound();
        }
      }
    }
  }

  protected onMigratePlayer(oldPlayerId: string, newPlayerId: string): void {
    // Migrate pick if it exists
    if (this.state.playerPicks && this.state.playerPicks[oldPlayerId] !== undefined) {
      this.state.playerPicks[newPlayerId] = this.state.playerPicks[oldPlayerId];
      delete this.state.playerPicks[oldPlayerId];
    }
    // Migrate pick time if it exists
    if (this.state.pickTimes && this.state.pickTimes[oldPlayerId] !== undefined) {
      this.state.pickTimes[newPlayerId] = this.state.pickTimes[oldPlayerId];
      delete this.state.pickTimes[oldPlayerId];
    }
    console.log(
      `[EmojiCarol] Migrated pick from ${oldPlayerId.substring(0, 8)} to ${newPlayerId.substring(0, 8)}`
    );
  }

  getClientState(playerId: string): any {
    return {
      ...this.state,
      hasPicked: this.state.playerPicks[playerId] !== undefined,
      scoreboard: this.getScoreboard(),
    };
  }
}
