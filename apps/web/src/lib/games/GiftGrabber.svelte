<script lang="ts">
  import { socket, gameState } from '$lib/socket';
  import { GameState } from '@christmas/core';
  import { onMount, onDestroy } from 'svelte';
  import Phaser from 'phaser';
  import { browser } from '$app/environment';

  $: state = $gameState?.state;
  $: score = $gameState?.scores?.[$socket?.id] || 0;
  $: playerPositions = $gameState?.playerPositions || {};
  $: gifts = $gameState?.gifts || [];
  $: coals = $gameState?.coals || [];

  let gameContainer: HTMLDivElement;
  let phaserGame: Phaser.Game | null = null;
  let touchStartX = 0;
  let touchStartY = 0;
  let isHost = false;

  // Phaser scene for Gift Grabber
  class GiftGrabberScene extends Phaser.Scene {
    private playerSprites: Map<string, Phaser.GameObjects.Text> = new Map();
    private giftSprites: Map<string, Phaser.GameObjects.Text> = new Map();
    private coalSprites: Map<string, Phaser.GameObjects.Text> = new Map();
    private myPlayerId: string | null = null;
    private mapWidth = 1200;
    private mapHeight = 800;
    private camera: Phaser.Cameras.Scene2D.CameraManager | null = null;

    constructor() {
      super({ key: 'GiftGrabberScene' });
    }

    create() {
      // Set world bounds
      this.physics.world.setBounds(0, 0, this.mapWidth, this.mapHeight);

      // Create background
      this.add.rectangle(this.mapWidth / 2, this.mapHeight / 2, this.mapWidth, this.mapHeight, 0x1a1a2e);

      // Get player ID from socket
      if (typeof window !== 'undefined' && (window as any).__socketId) {
        this.myPlayerId = (window as any).__socketId;
      }
    }

    update() {
      // Update will be called by reactive statements
    }

    updateGameState(
      positions: Record<string, { x: number; y: number }>,
      gifts: Array<{ id: string; x: number; y: number; value: number }>,
      coals: Array<{ id: string; x: number; y: number }>,
      myPlayerId: string | null
    ) {
      this.myPlayerId = myPlayerId;

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
          // Create new player sprite
          const isMe = playerId === myPlayerId;
          sprite = this.add.text(pos.x, pos.y, isMe ? '🎅' : '🧑', {
            fontSize: '32px',
            fontFamily: 'Arial',
          });
          sprite.setOrigin(0.5, 0.5);
          if (isMe) {
            sprite.setTint(0xffff00); // Highlight own player
          }
          this.playerSprites.set(playerId, sprite);
        } else {
          // Update position with smooth interpolation
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
      
      // Remove gifts that no longer exist
      this.giftSprites.forEach((sprite, giftId) => {
        if (!currentGiftIds.has(giftId)) {
          sprite.destroy();
          this.giftSprites.delete(giftId);
        }
      });

      // Add/update gift sprites
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
      
      // Remove coals that no longer exist
      this.coalSprites.forEach((sprite, coalId) => {
        if (!currentCoalIds.has(coalId)) {
          sprite.destroy();
          this.coalSprites.delete(coalId);
        }
      });

      // Add/update coal sprites
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

      // Center camera on own player if available
      if (myPlayerId && positions[myPlayerId]) {
        const myPos = positions[myPlayerId];
        this.cameras.main.centerOn(myPos.x, myPos.y);
        this.cameras.main.setZoom(1);
      } else {
        // Host view: show entire map
        this.cameras.main.centerOn(this.mapWidth / 2, this.mapHeight / 2);
        this.cameras.main.setZoom(0.5);
      }
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

  function handleTouchStart(e: TouchEvent) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }

  function handleTouchMove(e: TouchEvent) {
    if (!touchStartX || !touchStartY) return;

    const deltaX = e.touches[0].clientX - touchStartX;
    const deltaY = e.touches[0].clientY - touchStartY;

    // Normalize movement
    const magnitude = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    if (magnitude > 5) {
      $socket.emit('gift_move', {
        x: deltaX / magnitude,
        y: deltaY / magnitude,
      });
    }

    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }

  function handleTouchEnd() {
    touchStartX = 0;
    touchStartY = 0;
    $socket.emit('gift_move', { x: 0, y: 0 });
  }

  // Update socket ID when it changes
  $: {
    if (browser && $socket?.id) {
      (window as any).__socketId = $socket.id;
    }
  }

  onMount(() => {
    if (!browser) return;

    // Wait for container to be ready
    setTimeout(() => {
      if (!gameContainer) return;

      // Store socket ID for Phaser scene
      if ($socket?.id) {
        (window as any).__socketId = $socket.id;
      }

      // Initialize Phaser game
      const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        width: 1200,
        height: 800,
        parent: gameContainer,
        scene: GiftGrabberScene,
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
    if (phaserGame && state === GameState.PLAYING && playerPositions) {
      const scene = phaserGame.scene.getScene('GiftGrabberScene') as GiftGrabberScene;
      if (scene) {
        const myPlayerId = $socket?.id || null;
        scene.updateGameState(playerPositions, gifts, coals, myPlayerId);
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

<div class="grabber-container">
  {#if state === GameState.PLAYING}
    <div class="game-area">
      <div class="score-display">
        Score: 🎁 {score}
      </div>

      <div
        class="phaser-container"
        bind:this={gameContainer}
        on:touchstart={handleTouchStart}
        on:touchmove|preventDefault={handleTouchMove}
        on:touchend={handleTouchEnd}
      >
        <!-- Phaser canvas will be rendered here -->
      </div>
      
      <div class="control-hint-overlay">
        <p class="control-hint">Drag anywhere to move!</p>
      </div>
    </div>
  {:else if state === GameState.STARTING}
    <div class="countdown-overlay">
      <div class="text-8xl mb-4">🎁</div>
      <h1 class="text-4xl font-bold">Get Ready!</h1>
      <p class="text-xl text-white/70 mt-2">Starting in 3...</p>
    </div>
  {:else if state === GameState.GAME_END}
    <div class="game-end">
      <div class="text-8xl mb-6">🎁</div>
      <h1 class="text-4xl font-bold mb-4">Time's Up!</h1>
      <div class="final-score">
        <span class="score-label">Final Score:</span>
        <span class="score-value">{score} presents</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .grabber-container {
    height: 100%;
    display: flex;
    flex-direction: column;
    position: relative;
  }

  .game-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
  }

  .score-display {
    padding: 1rem;
    text-align: center;
    font-size: 1.5rem;
    font-weight: bold;
    background: rgba(255, 215, 0, 0.2);
    border: 2px solid #ffd700;
    border-radius: 1rem;
    margin-bottom: 1rem;
    z-index: 10;
  }

  .phaser-container {
    flex: 1;
    width: 100%;
    position: relative;
    touch-action: none;
    overflow: hidden;
    background: #1a1a2e;
  }

  .phaser-container :global(canvas) {
    width: 100% !important;
    height: 100% !important;
    object-fit: contain;
  }

  .control-hint-overlay {
    position: absolute;
    bottom: 1rem;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.7);
    padding: 0.75rem 1.5rem;
    border-radius: 9999px;
    z-index: 20;
    pointer-events: none;
  }

  .control-hint {
    font-size: 1rem;
    font-weight: bold;
    color: rgba(255, 255, 255, 0.9);
    margin: 0;
  }

  .countdown-overlay {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
  }

  .game-end {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 2rem;
    height: 100%;
    justify-content: center;
  }

  .final-score {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 2rem;
  }

  .score-label {
    font-size: 1.25rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .score-value {
    font-size: 2.5rem;
    font-weight: bold;
    color: #ffd700;
  }
</style>
