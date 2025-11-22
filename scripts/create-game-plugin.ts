#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';

/**
 * CLI tool for generating new game plugin templates.
 * 
 * Usage: tsx scripts/create-game-plugin.ts <game-name> [game-type]
 * 
 * Example: tsx scripts/create-game-plugin.ts my-game TRIVIA_ROYALE
 */

const GAME_TYPES = [
  'TRIVIA_ROYALE',
  'EMOJI_CAROL',
  'NAUGHTY_OR_NICE',
  'PRICE_IS_RIGHT',
  'BINGO',
];

const PLUGIN_TEMPLATE = `import { BaseGamePlugin, PluginContext, Intent, IntentResult, RenderDescriptor } from '@christmas/core';
import { GameType } from '@christmas/core';

export class {{GAME_NAME}}Plugin extends BaseGamePlugin {
  private gameType = GameType.{{GAME_TYPE}};

  init(roomState: import('@christmas/core').Room): void {
    // Initialize plugin with room state
    console.log(\`[{{GAME_NAME}}Plugin] Initialized for room \${roomState.code}\`);
  }

  async onIntent(intent: Intent, ctx: PluginContext): Promise<IntentResult> {
    // Handle intent
    // This is where you process player intents
    
    // Example: validate and process intent
    if (!this.validate(intent, ctx)) {
      return {
        success: false,
        intentId: intent.id,
        error: 'Invalid intent',
      };
    }

    // Process intent logic here
    // ...

    return {
      success: true,
      intentId: intent.id,
      eventId: \`evt_\${Date.now()}\`,
      version: ctx.room.version,
    };
  }

  validate(intent: Intent, ctx: PluginContext): boolean {
    // Custom validation logic
    return super.validate(intent, ctx);
  }

  serializeState(roomState: import('@christmas/core').Room): import('@christmas/core').BaseGameState {
    // Serialize game state for synchronization
    const game = (roomState as any).currentGame;
    if (!game) {
      return {
        gameType: this.gameType,
        state: 'lobby' as any,
        round: 0,
        maxRounds: 0,
        startedAt: 0,
        scores: {},
      };
    }

    // Get state from game
    return game.getState();
  }

  getRenderDescriptor(): RenderDescriptor {
    // Define how the game should be rendered on host display
    return {
      layout: 'grid', // or 'canvas', 'list', 'scoreboard', 'custom'
      components: [
        {
          type: 'game-board',
          position: { x: 0, y: 0, width: 100, height: 100 },
          props: {},
        },
      ],
      config: {},
    };
  }
}

export const plugin = new {{GAME_NAME}}Plugin();
export const gameType = GameType.{{GAME_TYPE}};
`;

const ADAPTER_TEMPLATE = `import { GameFSMWrapper } from '../engine/game-fsm-wrapper.js';
import { BaseGameEngine } from '@christmas/core';
import { {{GAME_NAME}}Plugin } from './{{GAME_NAME}}Plugin.js';

/**
 * Adapter for {{GAME_NAME}} game
 * Wraps the existing game with FSM and plugin interface
 */
export class {{GAME_NAME}}Adapter extends GameFSMWrapper {
  private plugin: {{GAME_NAME}}Plugin;

  constructor(game: BaseGameEngine, roomCode: string) {
    super(game, roomCode, game.getState().gameType);
    
    // Create and set plugin
    this.plugin = new {{GAME_NAME}}Plugin();
    this.setPlugin(this.plugin);
  }

  // Override methods as needed for game-specific behavior
}
`;

const TEST_TEMPLATE = `import { describe, it, expect } from 'vitest';
import { {{GAME_NAME}}Plugin } from './{{GAME_NAME}}Plugin.js';
import { GameType } from '@christmas/core';

describe('{{GAME_NAME}}Plugin', () => {
  it('should initialize correctly', () => {
    const plugin = new {{GAME_NAME}}Plugin();
    const roomState = {
      code: 'TEST',
      hostId: 'host1',
      createdAt: Date.now(),
      expiresAt: Date.now() + 3600000,
      currentGame: GameType.{{GAME_TYPE}},
      gameState: 'lobby' as any,
      players: new Map(),
      settings: {} as any,
      version: 0,
      lastStateMutation: Date.now(),
    };

    expect(() => plugin.init(roomState)).not.toThrow();
  });

  // Add more tests as needed
});
`;

function generatePluginFiles(gameName: string, gameType: string): void {
  const pluginDir = path.join(__dirname, '..', 'apps', 'server', 'src', 'plugins', gameName.toLowerCase());
  
  // Create directory
  if (!fs.existsSync(pluginDir)) {
    fs.mkdirSync(pluginDir, { recursive: true });
  }

  // Generate plugin file
  const pluginContent = PLUGIN_TEMPLATE
    .replace(/\{\{GAME_NAME\}\}/g, gameName)
    .replace(/\{\{GAME_TYPE\}\}/g, gameType);
  
  fs.writeFileSync(
    path.join(pluginDir, `${gameName}Plugin.ts`),
    pluginContent
  );

  // Generate adapter file
  const adapterContent = ADAPTER_TEMPLATE
    .replace(/\{\{GAME_NAME\}\}/g, gameName);
  
  fs.writeFileSync(
    path.join(pluginDir, `${gameName}Adapter.ts`),
    adapterContent
  );

  // Generate test file
  const testContent = TEST_TEMPLATE
    .replace(/\{\{GAME_NAME\}\}/g, gameName)
    .replace(/\{\{GAME_TYPE\}\}/g, gameType);
  
  fs.writeFileSync(
    path.join(pluginDir, `${gameName}Plugin.test.ts`),
    testContent
  );

  console.log(`✅ Generated plugin files for ${gameName}:`);
  console.log(`   - ${pluginDir}/${gameName}Plugin.ts`);
  console.log(`   - ${pluginDir}/${gameName}Adapter.ts`);
  console.log(`   - ${pluginDir}/${gameName}Plugin.test.ts`);
}

// Main execution
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage: tsx scripts/create-game-plugin.ts <game-name> [game-type]');
  console.error('');
  console.error('Game types:', GAME_TYPES.join(', '));
  process.exit(1);
}

const gameName = args[0];
const gameType = args[1] || 'TRIVIA_ROYALE';

if (!GAME_TYPES.includes(gameType)) {
  console.error(`Invalid game type: ${gameType}`);
  console.error('Valid types:', GAME_TYPES.join(', '));
  process.exit(1);
}

generatePluginFiles(gameName, gameType);
console.log(`\n🎉 Plugin template created! Next steps:`);
console.log(`   1. Implement the plugin methods in ${gameName}Plugin.ts`);
console.log(`   2. Customize the adapter in ${gameName}Adapter.ts`);
console.log(`   3. Write tests in ${gameName}Plugin.test.ts`);
console.log(`   4. Register the plugin in your game factory`);

