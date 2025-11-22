import { GameFSMWrapper } from '../../engine/game-fsm-wrapper.js';
import {
  BaseGameEngine,
  PluginGameEngine,
  GameType,
  Room,
  Intent,
  IntentResult,
  BaseGamePlugin,
  RenderDescriptor,
} from '@christmas/core';
import type { PluginContext } from '@christmas/core';
import { NaughtyOrNiceGame } from '../naughty-or-nice.js';

/**
 * Adapter for NaughtyOrNice game (legacy support - games now extend PluginGameEngine directly)
 */
export class NaughtyOrNiceAdapter extends GameFSMWrapper {
  constructor(game: NaughtyOrNiceGame | BaseGameEngine | PluginGameEngine, roomCode: string) {
    super(game as BaseGameEngine, roomCode, GameType.NAUGHTY_OR_NICE);
    const plugin = new NaughtyOrNicePlugin();
    this.setPlugin(plugin);
  }
}

class NaughtyOrNicePlugin extends BaseGamePlugin {
  init(roomState: Room): void {
    console.log(`[NaughtyOrNicePlugin] Initialized for room ${roomState.code}`);
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
        gameType: GameType.NAUGHTY_OR_NICE,
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
          type: 'prompt-display',
          position: { x: 0, y: 0, width: 100, height: 60 },
          props: {},
        },
        {
          type: 'vote-buttons',
          position: { x: 0, y: 60, width: 100, height: 40 },
          props: {},
        },
      ],
      config: { gridColumns: 1, gridRows: 2 },
    };
  }
}
