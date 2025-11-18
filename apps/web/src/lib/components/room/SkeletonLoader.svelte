<script lang="ts">
  export let count: number = 3;
  export let type: 'card' | 'stats' = 'card';
</script>

{#if type === 'stats'}
  <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
    {#each Array(count) as _}
      <div class="skeleton-stats-card">
        <div class="skeleton-icon"></div>
        <div class="skeleton-content">
          <div class="skeleton-value"></div>
          <div class="skeleton-label"></div>
        </div>
      </div>
    {/each}
  </div>
{:else}
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {#each Array(count) as _}
      <div class="skeleton-card">
        <div class="skeleton-header">
          <div class="skeleton-title"></div>
          <div class="skeleton-badge"></div>
        </div>
        <div class="skeleton-info">
          <div class="skeleton-row"></div>
          <div class="skeleton-row"></div>
          <div class="skeleton-row"></div>
        </div>
        <div class="skeleton-actions">
          <div class="skeleton-button"></div>
          <div class="skeleton-button"></div>
        </div>
      </div>
    {/each}
  </div>
{/if}

<style>
  .skeleton-stats-card,
  .skeleton-card {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 1rem;
    padding: 1.5rem;
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }

  .skeleton-stats-card {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .skeleton-icon {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 0.5rem;
    background: rgba(255, 255, 255, 0.1);
  }

  .skeleton-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .skeleton-value {
    height: 2rem;
    width: 60%;
    border-radius: 0.25rem;
    background: rgba(255, 255, 255, 0.1);
  }

  .skeleton-label {
    height: 0.875rem;
    width: 80%;
    border-radius: 0.25rem;
    background: rgba(255, 255, 255, 0.1);
  }

  .skeleton-card {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .skeleton-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .skeleton-title {
    height: 1.5rem;
    width: 40%;
    border-radius: 0.25rem;
    background: rgba(255, 255, 255, 0.1);
  }

  .skeleton-badge {
    height: 1.25rem;
    width: 20%;
    border-radius: 0.375rem;
    background: rgba(255, 255, 255, 0.1);
  }

  .skeleton-info {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 0.5rem;
  }

  .skeleton-row {
    height: 0.875rem;
    width: 100%;
    border-radius: 0.25rem;
    background: rgba(255, 255, 255, 0.1);
  }

  .skeleton-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: auto;
  }

  .skeleton-button {
    height: 2.5rem;
    flex: 1;
    border-radius: 0.5rem;
    background: rgba(255, 255, 255, 0.1);
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }
</style>

