<script lang="ts">
  import type { RenderDescriptor } from '@christmas/core';

  export let descriptor: RenderDescriptor;
  export let gameState: any;

  // Layout types
  $: layoutType = descriptor.layout || 'grid';
  $: components = descriptor.components || [];
  $: config = descriptor.config || {};
</script>

{#if layoutType === 'grid'}
  <div class="display-layout grid-layout" style="grid-template-columns: repeat({config.gridColumns || 1}, 1fr); grid-template-rows: repeat({config.gridRows || 1}, 1fr);">
    {#each components as component}
      <div 
        class="layout-component"
        style="grid-column: {component.position?.x || 1} / span {component.position?.width || 1}; grid-row: {component.position?.y || 1} / span {component.position?.height || 1};"
      >
        <!-- Component rendering would go here based on component.type -->
        <div class="component-placeholder">
          {component.type}
        </div>
      </div>
    {/each}
  </div>
{:else if layoutType === 'canvas'}
  <div class="display-layout canvas-layout">
    <canvas 
      width={config.canvasWidth || 1920} 
      height={config.canvasHeight || 1080}
      class="game-canvas"
    >
      <!-- Canvas-based game rendering -->
    </canvas>
  </div>
{:else if layoutType === 'list'}
  <div class="display-layout list-layout">
    {#each components as component}
      <div class="list-item">
        <!-- List item rendering -->
        <div class="component-placeholder">
          {component.type}
        </div>
      </div>
    {/each}
  </div>
{:else if layoutType === 'scoreboard'}
  <div class="display-layout scoreboard-layout">
    <!-- Scoreboard rendering -->
    {#if gameState?.scoreboard}
      <div class="scoreboard-list">
        {#each gameState.scoreboard as entry, index}
          <div class="scoreboard-entry" style="--rank: {index + 1}">
            <span class="rank">{index + 1}</span>
            <span class="name">{entry.name}</span>
            <span class="score">{entry.score}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{:else if layoutType === 'custom'}
  <div class="display-layout custom-layout">
    <!-- Custom layout rendering based on descriptor -->
    {#each components as component}
      <div 
        class="custom-component"
        style="position: absolute; left: {component.position?.x || 0}%; top: {component.position?.y || 0}%; width: {component.position?.width || 100}%; height: {component.position?.height || 100}%;"
      >
        <div class="component-placeholder">
          {component.type}
        </div>
      </div>
    {/each}
  </div>
{/if}

<style>
  .display-layout {
    width: 100%;
    height: 100%;
    position: relative;
  }

  .grid-layout {
    display: grid;
    gap: 1rem;
  }

  .canvas-layout {
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .game-canvas {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  .list-layout {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .list-item {
    padding: 1rem;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 0.5rem;
  }

  .scoreboard-layout {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  .scoreboard-list {
    width: 100%;
    max-width: 600px;
  }

  .scoreboard-entry {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    margin-bottom: 0.5rem;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 0.5rem;
  }

  .scoreboard-entry .rank {
    font-weight: bold;
    font-size: 1.5rem;
    min-width: 3rem;
  }

  .scoreboard-entry .name {
    flex: 1;
    font-size: 1.2rem;
  }

  .scoreboard-entry .score {
    font-weight: bold;
    font-size: 1.5rem;
  }

  .custom-layout {
    position: relative;
  }

  .component-placeholder {
    padding: 1rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px dashed rgba(255, 255, 255, 0.2);
    border-radius: 0.5rem;
    text-align: center;
    color: rgba(255, 255, 255, 0.5);
  }
</style>

