<script lang="ts">
  export let countdownValue: number = 0;
  export let show: boolean = true;
</script>

{#if show}
  <div class="countdown-overlay" class:hidden={countdownValue === 0}>
    <div class="countdown-content">
      <h1 class="countdown-text-small">Get Ready!</h1>
      <div class="countdown-number-small" class:pulse={countdownValue <= 1}>
        {countdownValue > 0 ? countdownValue : 'GO!'}
      </div>
    </div>
  </div>
{/if}

