<script lang="ts">
  export let label: string;
  export let value: number | string;
  export let icon: string;
  export let color: string = 'christmas-gold';
</script>

<div class="stats-card">
  <div class="stats-icon" class:christmas-gold={color === 'christmas-gold'} class:green-400={color === 'green-400'} class:yellow-400={color === 'yellow-400'} class:gray-400={color === 'gray-400'} class:blue-400={color === 'blue-400'}>
    {icon}
  </div>
  <div class="stats-content">
    <div class="stats-value">{value}</div>
    <div class="stats-label">{label}</div>
  </div>
</div>

<style>
  .stats-card {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 1rem;
    padding: 1.5rem;
    display: flex;
    align-items: center;
    gap: 1rem;
    transition: all 0.3s ease;
    backdrop-filter: blur(10px);
  }

  .stats-card:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.2);
    transform: translateY(-2px);
  }

  .stats-icon {
    font-size: 2.5rem;
    line-height: 1;
    flex-shrink: 0;
  }

  .stats-icon.christmas-gold {
    color: var(--christmas-gold);
  }

  .stats-icon.green-400 {
    color: #4ade80;
  }

  .stats-icon.yellow-400 {
    color: #facc15;
  }

  .stats-icon.gray-400 {
    color: #9ca3af;
  }

  .stats-icon.blue-400 {
    color: #60a5fa;
  }

  .stats-content {
    flex: 1;
    min-width: 0;
  }

  .stats-value {
    font-size: 2rem;
    font-weight: 700;
    color: white;
    line-height: 1.2;
    margin-bottom: 0.25rem;
  }

  .stats-label {
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.7);
    line-height: 1.4;
  }
</style>

