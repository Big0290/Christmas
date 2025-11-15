<script lang="ts">
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';

  export let points: number;
  export let x: number = 0;
  export let y: number = 0;

  let visible = true;
  const isPositive = points > 0;
  const displayText = isPositive ? `+${points}` : `${points}`;

  onMount(() => {
    setTimeout(() => {
      visible = false;
    }, 2000);
  });
</script>

{#if visible}
  <div
    class="score-animation"
    class:positive={isPositive}
    class:negative={!isPositive}
    style="left: {x}px; top: {y}px;"
    transition:fly={{ y: -100, duration: 2000 }}
  >
    {displayText}
  </div>
{/if}

<style>
  .score-animation {
    position: fixed;
    font-size: 2rem;
    font-weight: bold;
    pointer-events: none;
    z-index: 10000;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
  }

  .score-animation.positive {
    color: #0f8644;
  }

  .score-animation.negative {
    color: #c41e3a;
  }
</style>

