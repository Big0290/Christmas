<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { socket } from '$lib/socket';

  export let roomCode: string;

  let latency: number | null = null;
  let averageLatency: number = 0;
  let latencyHistory: number[] = [];
  let lastAckTimestamp: number = 0;
  let lastStateTimestamp: number = 0;
  const MAX_HISTORY = 20;

  function handleStateUpdate(state: any) {
    if (state.timestamp) {
      lastStateTimestamp = state.timestamp;
    }
  }

  function handleAckResponse(data: { version: number; timestamp?: number }) {
    if (data.timestamp && lastStateTimestamp) {
      const now = Date.now();
      const serverLatency = now - data.timestamp;
      const roundTripLatency = now - lastStateTimestamp;
      
      // Use round trip latency (more accurate)
      latency = roundTripLatency;
      
      // Update history
      latencyHistory.push(roundTripLatency);
      if (latencyHistory.length > MAX_HISTORY) {
        latencyHistory.shift();
      }
      
      // Calculate average
      averageLatency = latencyHistory.reduce((a, b) => a + b, 0) / latencyHistory.length;
    }
  }

  function getLatencyColor(): string {
    if (latency === null) return '#a0aec0'; // Gray
    if (latency < 100) return '#48bb78'; // Green
    if (latency < 300) return '#ed8936'; // Yellow
    return '#f56565'; // Red
  }

  function getLatencyStatus(): string {
    if (latency === null) return 'Unknown';
    if (latency < 100) return 'Excellent';
    if (latency < 300) return 'Good';
    if (latency < 500) return 'Fair';
    return 'Poor';
  }

  onMount(() => {
    if (socket) {
      socket.on('game_state_update', handleStateUpdate);
      socket.on('state_ack', handleAckResponse);
    }
  });

  onDestroy(() => {
    if (socket) {
      socket.off('game_state_update', handleStateUpdate);
      socket.off('state_ack', handleAckResponse);
    }
  });
</script>

<div class="latency-indicator">
  <div class="latency-icon" style="background-color: {getLatencyColor()}">
    <span class="latency-dot"></span>
  </div>
  
  <div class="latency-info">
    <div class="latency-value">
      {#if latency !== null}
        {latency.toFixed(0)}ms
      {:else}
        --
      {/if}
    </div>
    <div class="latency-status">{getLatencyStatus()}</div>
    {#if averageLatency > 0}
      <div class="latency-average">Avg: {averageLatency.toFixed(0)}ms</div>
    {/if}
  </div>
</div>

<style>
  .latency-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: rgba(0, 0, 0, 0.6);
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .latency-icon {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 0.3s ease;
  }

  .latency-dot {
    width: 6px;
    height: 6px;
    background: white;
    border-radius: 50%;
  }

  .latency-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .latency-value {
    font-size: 14px;
    font-weight: 600;
    color: #fff;
  }

  .latency-status {
    font-size: 11px;
    color: #a0aec0;
    text-transform: uppercase;
  }

  .latency-average {
    font-size: 10px;
    color: #718096;
  }
</style>

