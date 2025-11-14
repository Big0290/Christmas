<script lang="ts">
  export let points: number;
  export let x: number = 0;
  export let y: number = 0;

  let visible = true;
  const isPositive = points > 0;
  const displayText = isPositive ? `+${points}` : `${points}`;
</script>

{#if visible}
  <div
    class="score-animation"
    class:positive={isPositive}
    class:negative={!isPositive}
    style="left: {x}px; top: {y}px;"
    on:intro={(node) => {
      setTimeout(() => {
        visible = false;
      }, 2000);
    }}
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
    animation: scoreFly 2s ease-out forwards;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
  }

  .score-animation.positive {
    color: #0f8644;
  }

  .score-animation.negative {
    color: #c41e3a;
  }

  @keyframes scoreFly {
    0% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
    50% {
      opacity: 1;
      transform: translateY(-50px) scale(1.2);
    }
    100% {
      opacity: 0;
      transform: translateY(-100px) scale(0.8);
    }
  }
</style>

