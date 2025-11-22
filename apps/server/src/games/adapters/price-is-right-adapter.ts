import { GameFSMWrapper } from '../../engine/game-fsm-wrapper.js';
import { BaseGameEngine, PluginGameEngine, GameType, Room, Intent, IntentResult, BaseGamePlugin, RenderDescriptor } from '@christmas/core';
import type { PluginContext } from '@christmas/core';
import { PriceIsRightGame } from '../price-is-right.js';

/**
 * Adapter for PriceIsRight game (legacy support - games now extend PluginGameEngine directly)
 */
export class PriceIsRightAdapter extends GameFSMWrapper {
  constructor(game: PriceIsRightGame | BaseGameEngine | PluginGameEngine, roomCode: string) {
    super(game as BaseGameEngine, roomCode, GameType.PRICE_IS_RIGHT);
    const plugin = new PriceIsRightPlugin();
    this.setPlugin(plugin);
  }
}

class PriceIsRightPlugin extends BaseGamePlugin {
  init(roomState: Room): void {
    console.log(`[PriceIsRightPlugin] Initialized for room ${roomState.code}`);
  }

  async onIntent(intent: Intent, ctx: PluginContext): Promise<IntentResult> {
    return {
      success: true,
      intentId: intent.id,
      eventId: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      version: ctx.room.version + 1,
    };
  }

  serializeState(roomState: Room): import('@christmas/core').BaseGameState {
    const game = (roomState as any).currentGameInstance;
    if (!game) {
      return {
        gameType: GameType.PRICE_IS_RIGHT,
        state: 'lobby' as any,
        round: 0,
        maxRounds: 0,
        startedAt: 0,
        scores: {},
      };
    }
    return game.getState();
  }

  getRenderDescriptor(): RenderDescriptor {
    return {
      layout: 'grid',
      components: [
        {
          type: 'item-display',
          position: { x: 0, y: 0, width: 100, height: 70 },
          props: {},
        },
        {
          type: 'guess-input',
          position: { x: 0, y: 70, width: 100, height: 30 },
          props: {},
        },
      ],
      config: { gridColumns: 1, gridRows: 2 },
    };
  }
}

