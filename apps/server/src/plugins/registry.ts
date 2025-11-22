import { GamePlugin, GameType } from '@christmas/core';
import * as fs from 'fs';
import * as path from 'path';

/**
 * PluginRegistry manages game plugin registration and loading.
 * 
 * Responsibilities:
 * - Register plugins dynamically
 * - Load plugins from directory
 * - Validate plugin interfaces
 * - Provide plugin lookup by game type
 */
export class PluginRegistry {
  // Registered plugins: Map<gameType, GamePlugin>
  private plugins: Map<GameType, GamePlugin> = new Map();
  
  // Plugin metadata: Map<gameType, { name: string; version: string; path: string }>
  private pluginMetadata: Map<GameType, { name: string; version: string; path: string }> = new Map();

  /**
   * Register a plugin for a game type
   */
  register(gameType: GameType, plugin: GamePlugin, metadata?: { name: string; version: string; path: string }): void {
    // Validate plugin interface
    this.validatePlugin(plugin);

    this.plugins.set(gameType, plugin);
    
    if (metadata) {
      this.pluginMetadata.set(gameType, metadata);
    }

    console.log(`[PluginRegistry] Registered plugin for game type ${gameType}`);
  }

  /**
   * Get plugin for a game type
   */
  get(gameType: GameType): GamePlugin | null {
    return this.plugins.get(gameType) || null;
  }

  /**
   * Check if plugin exists for game type
   */
  has(gameType: GameType): boolean {
    return this.plugins.has(gameType);
  }

  /**
   * Unregister a plugin
   */
  unregister(gameType: GameType): void {
    const plugin = this.plugins.get(gameType);
    if (plugin) {
      // Cleanup plugin if needed
      // Note: We can't cleanup without room state, so just remove from registry
      this.plugins.delete(gameType);
      this.pluginMetadata.delete(gameType);
      console.log(`[PluginRegistry] Unregistered plugin for game type ${gameType}`);
    }
  }

  /**
   * Load plugins from a directory
   */
  async loadFromDirectory(directory: string): Promise<number> {
    let loadedCount = 0;

    try {
      const files = fs.readdirSync(directory);
      
      for (const file of files) {
        if (!file.endsWith('.js') && !file.endsWith('.ts')) {
          continue;
        }

        const filePath = path.join(directory, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isFile()) {
          try {
            // Dynamic import
            const module = await import(filePath);
            
            // Look for default export or named exports
            const plugin = module.default || module.plugin || module[Object.keys(module)[0]];
            const gameType = module.gameType || module.GAME_TYPE;
            
            if (plugin && gameType) {
              this.register(gameType, plugin, {
                name: file.replace(/\.(js|ts)$/, ''),
                version: module.version || '1.0.0',
                path: filePath,
              });
              loadedCount++;
            }
          } catch (error: any) {
            console.warn(`[PluginRegistry] Failed to load plugin from ${file}:`, error.message);
          }
        }
      }
    } catch (error: any) {
      console.error(`[PluginRegistry] Failed to load plugins from directory ${directory}:`, error);
    }

    console.log(`[PluginRegistry] Loaded ${loadedCount} plugin(s) from ${directory}`);
    return loadedCount;
  }

  /**
   * Validate plugin interface
   */
  private validatePlugin(plugin: GamePlugin): void {
    const requiredMethods = [
      'init',
      'onIntent',
      'validate',
      'applyEvent',
      'serializeState',
      'cleanup',
      'getRenderDescriptor',
    ];

    for (const method of requiredMethods) {
      if (typeof (plugin as any)[method] !== 'function') {
        throw new Error(`Plugin missing required method: ${method}`);
      }
    }
  }

  /**
   * Get all registered game types
   */
  getRegisteredGameTypes(): GameType[] {
    return Array.from(this.plugins.keys());
  }

  /**
   * Get plugin metadata
   */
  getMetadata(gameType: GameType): { name: string; version: string; path: string } | null {
    return this.pluginMetadata.get(gameType) || null;
  }

  /**
   * List all registered plugins
   */
  listPlugins(): Array<{ gameType: GameType; metadata: { name: string; version: string; path: string } | null }> {
    return Array.from(this.plugins.keys()).map(gameType => ({
      gameType,
      metadata: this.pluginMetadata.get(gameType) || null,
    }));
  }
}

