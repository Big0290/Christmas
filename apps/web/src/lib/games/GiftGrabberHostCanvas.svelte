<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Phaser from 'phaser';
  import { browser } from '$app/environment';

  export let playerPositions: Record<string, { x: number; y: number }> = {};
  export let gifts: Array<{ id: string; x: number; y: number; value: number }> = [];
  export let coals: Array<{ id: string; x: number; y: number }> = [];

  let gameContainer: HTMLDivElement;
  let phaserGame: Phaser.Game | null = null;

  // Phaser scene for Host view of Gift Grabber
  class GiftGrabberHostScene extends Phaser.Scene {
    private playerSprites: Map<string, Phaser.GameObjects.Text> = new Map();
    private giftSprites: Map<string, Phaser.GameObjects.Text> = new Map();
    private coalSprites: Map<string, Phaser.GameObjects.Text> = new Map();
    private mapWidth = 1200;
    private mapHeight = 800;

    constructor() {
      super({ key: 'GiftGrabberHostScene' });
    }

    create() {
      // Set world bounds
      this.physics.world.setBounds(0, 0, this.mapWidth, this.mapHeight);

      // Create background
      this.add.rectangle(this.mapWidth / 2, this.mapHeight / 2, this.mapWidth, this.mapHeight, 0x1a1a2e);

      // Host view: show entire map zoomed out
      this.cameras.main.centerOn(this.mapWidth / 2, this.mapHeight / 2);
      this.cameras.main.setZoom(0.5);
    }

    updateGameState(
      positions: Record<string, { x: number; y: number }>,
      gifts: Array<{ id: string; x: number; y: number; value: number }>,
      coals: Array<{ id: string; x: number; y: number }>
    ) {
      // Update player sprites
      const currentPlayerIds = new Set(Object.keys(positions));
      
      // Remove players that no longer exist
      this.playerSprites.forEach((sprite, playerId) => {
        if (!currentPlayerIds.has(playerId)) {
          sprite.destroy();
          this.playerSprites.delete(playerId);
        }
      });

      // Add/update player sprites
      Object.entries(positions).forEach(([playerId, pos]) => {
        let sprite = this.playerSprites.get(playerId);
        if (!sprite) {
          sprite = this.add.text(pos.x, pos.y, '🧑', {
            fontSize: '32px',
            fontFamily: 'Arial',
          });
          sprite.setOrigin(0.5, 0.5);
          this.playerSprites.set(playerId, sprite);
        } else {
          this.tweens.add({
            targets: sprite,
            x: pos.x,
            y: pos.y,
            duration: 100,
            ease: 'Power2',
          });
        }
      });

      // Update gift sprites
      const currentGiftIds = new Set(gifts.map(g => g.id));
      
      this.giftSprites.forEach((sprite, giftId) => {
        if (!currentGiftIds.has(giftId)) {
          sprite.destroy();
          this.giftSprites.delete(giftId);
        }
      });

      gifts.forEach((gift) => {
        let sprite = this.giftSprites.get(gift.id);
        if (!sprite) {
          sprite = this.add.text(gift.x, gift.y, '🎁', {
            fontSize: '24px',
            fontFamily: 'Arial',
          });
          sprite.setOrigin(0.5, 0.5);
          this.giftSprites.set(gift.id, sprite);
        } else {
          this.tweens.add({
            targets: sprite,
            x: gift.x,
            y: gift.y,
            duration: 100,
            ease: 'Power2',
          });
        }
      });

      // Update coal sprites
      const currentCoalIds = new Set(coals.map(c => c.id));
      
      this.coalSprites.forEach((sprite, coalId) => {
        if (!currentCoalIds.has(coalId)) {
          sprite.destroy();
          this.coalSprites.delete(coalId);
        }
      });

      coals.forEach((coal) => {
        let sprite = this.coalSprites.get(coal.id);
        if (!sprite) {
          sprite = this.add.text(coal.x, coal.y, '🪨', {
            fontSize: '24px',
            fontFamily: 'Arial',
          });
          sprite.setOrigin(0.5, 0.5);
          this.coalSprites.set(coal.id, sprite);
        } else {
          this.tweens.add({
            targets: sprite,
            x: coal.x,
            y: coal.y,
            duration: 100,
            ease: 'Power2',
          });
        }
      });
    }

    destroy() {
      this.playerSprites.forEach(sprite => sprite.destroy());
      this.giftSprites.forEach(sprite => sprite.destroy());
      this.coalSprites.forEach(sprite => sprite.destroy());
      this.playerSprites.clear();
      this.giftSprites.clear();
      this.coalSprites.clear();
      super.destroy();
    }
  }

  onMount(() => {
    if (!browser) return;

    setTimeout(() => {
      if (!gameContainer) return;

      const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        width: 1200,
        height: 800,
        parent: gameContainer,
        scene: GiftGrabberHostScene,
        physics: {
          default: 'arcade',
          arcade: {
            gravity: { y: 0 },
            debug: false,
          },
        },
        backgroundColor: '#1a1a2e',
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
      };

      phaserGame = new Phaser.Game(config);
    }, 100);
  });

  // Update Phaser scene when game state changes
  $: {
    if (phaserGame && playerPositions) {
      const scene = phaserGame.scene.getScene('GiftGrabberHostScene') as GiftGrabberHostScene;
      if (scene) {
        scene.updateGameState(playerPositions, gifts, coals);
      }
    }
  }

  onDestroy(() => {
    if (phaserGame) {
      phaserGame.destroy(true);
      phaserGame = null;
    }
  });
</script>

<div class="host-canvas-container" bind:this={gameContainer}>
  <!-- Phaser canvas will be rendered here -->
</div>

<style>
  .host-canvas-container {
    width: 100%;
    height: 100%;
    min-height: 600px;
    position: relative;
    background: #1a1a2e;
  }

  .host-canvas-container :global(canvas) {
    width: 100% !important;
    height: 100% !important;
    object-fit: contain;
  }
</style>

