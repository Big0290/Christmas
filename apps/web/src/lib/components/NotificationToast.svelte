<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { fly } from 'svelte/transition';

  export let message: string;
  export let type: 'info' | 'success' | 'warning' | 'error' = 'info';
  export let duration: number = 3000;

  const dispatch = createEventDispatcher();
  let visible = true;

  onMount(() => {
    if (duration > 0) {
      setTimeout(() => {
        visible = false;
        setTimeout(() => {
          dispatch('close');
        }, 300); // Wait for transition
      }, duration);
    }
  });
</script>

{#if visible}
  <div
    class="notification-toast"
    class:info={type === 'info'}
    class:success={type === 'success'}
    class:warning={type === 'warning'}
    class:error={type === 'error'}
    transition:fly={{ y: -50, duration: 300 }}
  >
    <div class="toast-content">
      {message}
    </div>
  </div>
{/if}

<style>
  .notification-toast {
    position: fixed;
    top: 2rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10001;
    padding: 1rem 2rem;
    border-radius: 1rem;
    font-weight: bold;
    font-size: 1.125rem;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(10px);
    min-width: 300px;
    text-align: center;
  }

  .notification-toast.info {
    background: rgba(59, 130, 246, 0.9);
    color: white;
    border: 2px solid rgba(59, 130, 246, 1);
  }

  .notification-toast.success {
    background: rgba(16, 185, 129, 0.9);
    color: white;
    border: 2px solid rgba(16, 185, 129, 1);
  }

  .notification-toast.warning {
    background: rgba(245, 158, 11, 0.9);
    color: white;
    border: 2px solid rgba(245, 158, 11, 1);
  }

  .notification-toast.error {
    background: rgba(239, 68, 68, 0.9);
    color: white;
    border: 2px solid rgba(239, 68, 68, 1);
  }

  .toast-content {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }
</style>

