import {
  BaseGameEngine,
  GameType,
  GameState,
  GiftGrabberGameState,
  Player,
} from '@christmas/core';

export class GiftGrabberGame extends BaseGameEngine<GiftGrabberGameState> {
  private mapWidth = 1200;
  private mapHeight = 800;
  private giftSpawnInterval: NodeJS.Timeout | null = null;

  constructor(players: Map<string, Player>) {
    super(GameType.GIFT_GRABBER, players);
  }

  protected createInitialState(): GiftGrabberGameState {
    const scores: Record<string, number> = {};
    const playerPositions: Record<string, { x: number; y: number }> = {};

    this.players.forEach((player) => {
      scores[player.id] = 0;
      playerPositions[player.id] = {
        x: Math.random() * this.mapWidth,
        y: Math.random() * this.mapHeight,
      };
    });

    return {
      gameType: GameType.GIFT_GRABBER,
      state: GameState.LOBBY,
      round: 1,
      maxRounds: 1,
      startedAt: 0,
      scores,
      playerPositions,
      gifts: [],
      coals: [],
    };
  }

  protected onPlaying(): void {
    // Spawn gifts periodically
    this.giftSpawnInterval = setInterval(() => {
      this.spawnGift();
    }, 3000);

    // End game after 2 minutes
    this.setTimer(() => {
      this.end();
    }, 120000);
  }

  private spawnGift(): void {
    const id = `gift-${Date.now()}-${Math.random()}`;
    const gift = {
      id,
      x: Math.random() * this.mapWidth,
      y: Math.random() * this.mapHeight,
      value: Math.floor(Math.random() * 50) + 10,
    };
    this.state.gifts.push(gift);

    // Also spawn coal occasionally
    if (Math.random() < 0.2) {
      this.spawnCoal();
    }
  }

  private spawnCoal(): void {
    const id = `coal-${Date.now()}-${Math.random()}`;
    const coal = {
      id,
      x: Math.random() * this.mapWidth,
      y: Math.random() * this.mapHeight,
    };
    this.state.coals.push(coal);
  }

  handlePlayerAction(playerId: string, action: string, data: any): void {
    if (action === 'move' && this.state.state === GameState.PLAYING) {
      const pos = this.state.playerPositions[playerId];
      if (pos) {
        pos.x = Math.max(0, Math.min(this.mapWidth, pos.x + data.x * 5));
        pos.y = Math.max(0, Math.min(this.mapHeight, pos.y + data.y * 5));

        // Check gift collisions
        this.checkCollisions(playerId);
      }
    }
  }

  private checkCollisions(playerId: string): void {
    const pos = this.state.playerPositions[playerId];
    const collisionRadius = 30;

    // Check gifts
    this.state.gifts = this.state.gifts.filter((gift) => {
      const dx = gift.x - pos.x;
      const dy = gift.y - pos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < collisionRadius) {
        this.updateScore(playerId, gift.value);
        return false; // Remove gift
      }
      return true;
    });

    // Check coals
    this.state.coals = this.state.coals.filter((coal) => {
      const dx = coal.x - pos.x;
      const dy = coal.y - pos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < collisionRadius) {
        this.updateScore(playerId, -20);
        return false; // Remove coal
      }
      return true;
    });
  }

  getClientState(playerId: string): any {
    return {
      ...this.state,
      scoreboard: this.getScoreboard(),
    };
  }

  protected onDestroy(): void {
    if (this.giftSpawnInterval) {
      clearInterval(this.giftSpawnInterval);
    }
  }
}
