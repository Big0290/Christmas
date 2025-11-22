import { GameFSMWrapper } from '../../engine/game-fsm-wrapper.js';
import { BaseGameEngine, PluginGameEngine, GameType, Room, Intent, IntentResult, BaseGamePlugin, RenderDescriptor } from '@christmas/core';
import type { PluginContext } from '@christmas/core';
import { EmojiCarolGame } from '../emoji-carol.js';

/**
 * Adapter for EmojiCarol game (legacy support - games now extend PluginGameEngine directly)
 */
export class EmojiCarolAdapter extends GameFSMWrapper {
  constructor(game: EmojiCarolGame | BaseGameEngine | PluginGameEngine, roomCode: string) {
    super(game as BaseGameEngine, roomCode, GameType.EMOJI_CAROL);
    const plugin = new EmojiCarolPlugin();
    this.setPlugin(plugin);
  }
}

class EmojiCarolPlugin extends BaseGamePlugin {
  init(roomState: Room): void {
    console.log(`[EmojiCarolPlugin] Initialized for room ${roomState.code}`);
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
        gameType: GameType.EMOJI_CAROL,
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
          type: 'emoji-display',
          position: { x: 0, y: 0, width: 100, height: 80 },
          props: {},
        },
        {
          type: 'emoji-picker',
          position: { x: 0, y: 80, width: 100, height: 20 },
          props: {},
        },
      ],
      config: { gridColumns: 1, gridRows: 2 },
    };
  }
}

