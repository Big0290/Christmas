<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { playSound } from '$lib/audio';

  export let achievement: {
    title: string;
    description: string;
    icon: string;
  };

  const dispatch = createEventDispatcher();
  let visible = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  function dismiss() {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    visible = false;
    setTimeout(() => {
      dispatch('close');
    }, 500); // Wait for transition
  }

  onMount(() => {
    visible = true;
    playSound('correct'); // Use correct sound for achievements
    timeoutId = setTimeout(() => {
      dismiss();
    }, 4000);
  });
</script>

{#if visible}
  <div
    class="achievement-badge"
    transition:fly={{ y: 50, duration: 400 }}
    on:click={dismiss}
    role="button"
    tabindex="0"
    on:keydown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        dismiss();
      }
    }}
  >
    <button 
      class="close-btn" 
      on:click|stopPropagation={(e) => {
        e.stopPropagation();
        e.preventDefault();
        dismiss();
      }}
      on:mousedown|stopPropagation={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      aria-label="Close"
      type="button"
    >
      ✕
    </button>
    <div class="achievement-icon">{achievement.icon}</div>
    <div class="achievement-content">
      <div class="achievement-title">🏆 {achievement.title}</div>
      <div class="achievement-description">{achievement.description}</div>
    </div>
  </div>
{/if}

<style>
  .achievement-badge {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 10002;
    background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%);
    border: 4px solid #ffd700;
    border-radius: 1.5rem;
    padding: 2rem;
    box-shadow: 0 8px 32px rgba(255, 215, 0, 0.6);
    min-width: 300px;
    max-width: 400px;
    animation: achievementPulse 0.5s ease-out;
    cursor: pointer;
    pointer-events: auto;
  }

  @keyframes achievementPulse {
    0% {
      transform: translate(-50%, -50%) scale(0.8);
      opacity: 0;
    }
    50% {
      transform: translate(-50%, -50%) scale(1.1);
    }
    100% {
      transform: translate(-50%, -50%) scale(1);
      opacity: 1;
    }
  }

  .achievement-icon {
    font-size: 4rem;
    text-align: center;
    margin-bottom: 1rem;
  }

  .achievement-content {
    text-align: center;
  }

  .achievement-title {
    font-size: 1.5rem;
    font-weight: bold;
    color: #1a1a2e;
    margin-bottom: 0.5rem;
  }

  .achievement-description {
    font-size: 1rem;
    color: #1a1a2e;
    opacity: 0.8;
  }

  .close-btn {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    background: rgba(0, 0, 0, 0.5);
    border: 2px solid #1a1a2e;
    color: white;
    font-size: 1.5rem;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    font-weight: bold;
    line-height: 1;
    z-index: 10003;
    pointer-events: auto;
  }

  .close-btn:hover {
    background: rgba(0, 0, 0, 0.8);
    transform: scale(1.1);
    border-color: #ffd700;
  }

  .close-btn:active {
    transform: scale(0.95);
  }
</style>

