import {
  BaseGameEngine,
  GameType,
  GameState,
  EmojiCarolGameState,
  Player,
} from '@christmas/core';

const DEFAULT_EMOJIS = ['🎅', '🎄', '⛄', '🎁', '🔔', '⭐', '🕯️', '🦌', '🤶', '🧝', '🎿', '⛷️'];

export class EmojiCarolGame extends BaseGameEngine<EmojiCarolGameState> {
  constructor(players: Map<string, Player>) {
    super(GameType.EMOJI_CAROL, players);
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
      maxRounds: 8,
      startedAt: 0,
      scores,
      availableEmojis: [...DEFAULT_EMOJIS],
      playerPicks: {},
      roundResults: [],
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
    
    // Timer to end round
    this.setTimer(() => {
      this.endRound();
    }, 15000);
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

    // Award points
    Object.entries(picks).forEach(([playerId, emoji]) => {
      let points = 0;

      // Majority bonus
      if (emoji === majorityEmoji) {
        points += 10;
      }

      // Uniqueness bonus
      const pickCount = emojiCounts.get(emoji) || 0;
      if (pickCount === 1) {
        points += 5;
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

        // If all players picked, end round early
        if (Object.keys(this.state.playerPicks).length === this.players.size) {
          this.clearTimer();
          this.endRound();
        }
      }
    }
  }

  getClientState(playerId: string): any {
    return {
      ...this.state,
      hasPicked: this.state.playerPicks[playerId] !== undefined,
      scoreboard: this.getScoreboard(),
    };
  }
}
