import { GameFSMWrapper } from '../../engine/game-fsm-wrapper.js';
import { BaseGameEngine, PluginGameEngine, GameType, Room, Player, Intent, IntentResult, BaseGamePlugin, RenderDescriptor } from '@christmas/core';
import type { PluginContext } from '@christmas/core';
import { TriviaRoyaleGame } from '../trivia-royale.js';

/**
 * Adapter for TriviaRoyale game (legacy support - games now extend PluginGameEngine directly)
 */
export class TriviaRoyaleAdapter extends GameFSMWrapper {
  constructor(game: TriviaRoyaleGame | BaseGameEngine | PluginGameEngine, roomCode: string) {
    super(game as BaseGameEngine, roomCode, GameType.TRIVIA_ROYALE);
    
    // Create and set plugin
    const plugin = new TriviaRoyalePlugin();
    this.setPlugin(plugin);
  }
}

/**
 * Plugin implementation for TriviaRoyale
 */
class TriviaRoyalePlugin extends BaseGamePlugin {
  init(roomState: Room): void {
    // Initialize plugin with room state
    console.log(`[TriviaRoyalePlugin] Initialized for room ${roomState.code}`);
  }

  async onIntent(intent: Intent, ctx: PluginContext): Promise<IntentResult> {
    // Handle intent - delegate to game's handlePlayerAction
    // The game will process the action
    return {
      success: true,
      intentId: intent.id,
      eventId: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      version: ctx.room.version + 1,
    };
  }

  serializeState(roomState: Room): import('@christmas/core').BaseGameState {
    // Get game state from room
    const game = (roomState as any).currentGameInstance;
    if (!game) {
      return {
        gameType: GameType.TRIVIA_ROYALE,
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
          type: 'question-display',
          position: { x: 0, y: 0, width: 100, height: 60 },
          props: {},
        },
        {
          type: 'answer-options',
          position: { x: 0, y: 60, width: 100, height: 40 },
          props: {},
        },
      ],
      config: {
        gridColumns: 1,
        gridRows: 2,
      },
    };
  }
}

