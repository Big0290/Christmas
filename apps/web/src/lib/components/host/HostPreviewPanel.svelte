<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { socket } from '$lib/socket';
  import { GameState } from '@christmas/core';

  export let roomCode: string;
  export let visible: boolean = false;

  let displayState: any = null;
  let displayStateVersion: number = 0;

  function handleDisplaySyncState(state: any) {
    displayState = state;
    displayStateVersion = state.version || 0;
  }

  onMount(() => {
    if (socket) {
      socket.on('display_sync_state', handleDisplaySyncState);
    }
  });

  onDestroy(() => {
    if (socket) {
      socket.off('display_sync_state', handleDisplaySyncState);
    }
  });
</script>

{#if visible}
  <div class="preview-panel">
    <div class="preview-header">
      <h3>Display Preview</h3>
      <span class="preview-version">v{displayStateVersion}</span>
    </div>
    
    <div class="preview-content">
      {#if displayState}
        <div class="preview-state">
          <div class="state-info">
            <span class="state-label">State:</span>
            <span class="state-value">{displayState.state || 'Unknown'}</span>
          </div>
          
          {#if displayState.round !== undefined}
            <div class="state-info">
              <span class="state-label">Round:</span>
              <span class="state-value">{displayState.round} / {displayState.maxRounds || '?'}</span>
            </div>
          {/if}
          
          {#if displayState.gameType}
            <div class="state-info">
              <span class="state-label">Game:</span>
              <span class="state-value">{displayState.gameType}</span>
            </div>
          {/if}
        </div>
        
        <!-- Render game-specific preview content here -->
        <div class="preview-game-content">
          <!-- This would be populated based on renderDescriptor from plugin -->
          <div class="preview-placeholder">
            Display preview content
          </div>
        </div>
      {:else}
        <div class="preview-empty">
          Waiting for display state...
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .preview-panel {
    position: fixed;
    top: 80px;
    right: 20px;
    width: 400px;
    max-height: calc(100vh - 100px);
    background: rgba(0, 0, 0, 0.9);
    border: 2px solid #4a5568;
    border-radius: 8px;
    padding: 16px;
    z-index: 1000;
    overflow-y: auto;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
  }

  .preview-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid #4a5568;
  }

  .preview-header h3 {
    margin: 0;
    color: #fff;
    font-size: 18px;
  }

  .preview-version {
    color: #a0aec0;
    font-size: 12px;
  }

  .preview-content {
    color: #fff;
  }

  .preview-state {
    margin-bottom: 16px;
  }

  .state-info {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .state-label {
    color: #a0aec0;
    font-weight: 500;
  }

  .state-value {
    color: #fff;
    font-weight: 600;
  }

  .preview-game-content {
    margin-top: 16px;
    padding: 16px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
    min-height: 200px;
  }

  .preview-placeholder {
    color: #a0aec0;
    text-align: center;
    padding: 40px;
  }

  .preview-empty {
    color: #a0aec0;
    text-align: center;
    padding: 40px;
  }
</style>

