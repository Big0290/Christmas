import {
  BaseGameEngine,
  GameType,
  GameState,
  WorkshopGameState,
  Player,
} from '@christmas/core';

const UPGRADES = [
  { id: 'elf', name: 'Elf Helper', baseCost: 50, productionBoost: 1.2 },
  { id: 'machine', name: 'Toy Machine', baseCost: 100, productionBoost: 1.5 },
  { id: 'magic', name: 'Magic Dust', baseCost: 150, productionBoost: 1.3 },
  { id: 'reindeer', name: 'Reindeer Power', baseCost: 200, productionBoost: 1.4 },
  { id: 'santa', name: "Santa's Blessing", baseCost: 500, productionBoost: 2.0 },
];

export class WorkshopTycoonGame extends BaseGameEngine<WorkshopGameState> {
  private productionInterval: NodeJS.Timeout | null = null;

  constructor(players: Map<string, Player>) {
    super(GameType.WORKSHOP_TYCOON, players);
  }

  protected createInitialState(): WorkshopGameState {
    const scores: Record<string, number> = {};
    const playerResources: Record<string, number> = {};
    const playerProduction: Record<string, number> = {};
    const playerUpgrades: Record<string, string[]> = {};

    this.players.forEach((player) => {
      scores[player.id] = 0;
      playerResources[player.id] = 100;
      playerProduction[player.id] = 1;
      playerUpgrades[player.id] = [];
    });

    return {
      gameType: GameType.WORKSHOP_TYCOON,
      state: GameState.LOBBY,
      round: 1,
      maxRounds: 1,
      startedAt: 0,
      scores,
      playerResources,
      playerProduction,
      playerUpgrades,
    };
  }

  protected onPlaying(): void {
    // Production tick every second
    this.productionInterval = setInterval(() => {
      this.produceResources();
    }, 1000);

    // End game after 5 minutes
    this.setTimer(() => {
      this.end();
    }, 300000);
  }

  private produceResources(): void {
    Object.keys(this.state.playerResources).forEach((playerId) => {
      const production = this.state.playerProduction[playerId];
      this.state.playerResources[playerId] += production;
      this.state.scores[playerId] = this.state.playerResources[playerId];
    });
  }

  handlePlayerAction(playerId: string, action: string, data: any): void {
    if (action === 'upgrade' && this.state.state === GameState.PLAYING) {
      const upgradeId = data.upgradeId;
      const upgrade = UPGRADES.find((u) => u.id === upgradeId);

      if (!upgrade) return;

      const currentUpgrades = this.state.playerUpgrades[playerId] || [];
      const upgradeCount = currentUpgrades.filter((id) => id === upgradeId).length;
      const cost = Math.floor(upgrade.baseCost * Math.pow(1.5, upgradeCount));

      if (this.state.playerResources[playerId] >= cost) {
        this.state.playerResources[playerId] -= cost;
        this.state.playerUpgrades[playerId].push(upgradeId);
        this.state.playerProduction[playerId] *= upgrade.productionBoost;
      }
    }
  }

  getClientState(playerId: string): any {
    return {
      ...this.state,
      availableUpgrades: UPGRADES.map((upgrade) => {
        const currentUpgrades = this.state.playerUpgrades[playerId] || [];
        const upgradeCount = currentUpgrades.filter((id) => id === upgrade.id).length;
        return {
          ...upgrade,
          cost: Math.floor(upgrade.baseCost * Math.pow(1.5, upgradeCount)),
          owned: upgradeCount,
        };
      }),
      scoreboard: this.getScoreboard(),
    };
  }

  protected onDestroy(): void {
    if (this.productionInterval) {
      clearInterval(this.productionInterval);
    }
  }
}
