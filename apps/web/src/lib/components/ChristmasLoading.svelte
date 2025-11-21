<script lang="ts">
  export let message: string = 'Loading...';
  export let size: 'small' | 'medium' | 'large' = 'medium';
  export let variant: 'default' | 'connecting' | 'uploading' = 'default';
</script>

<div class="christmas-loading" class:small={size === 'small'} class:medium={size === 'medium'} class:large={size === 'large'} class:connecting={variant === 'connecting'} class:uploading={variant === 'uploading'}>
  <div class="loading-content">
    <div class="christmas-spinner">
      <div class="ornament">
        <div class="ornament-top"></div>
        <div class="ornament-body">
          <div class="ornament-shine"></div>
        </div>
        <div class="ornament-hook"></div>
      </div>
      <div class="sparkles">
        <span class="sparkle sparkle-1">✨</span>
        <span class="sparkle sparkle-2">✨</span>
        <span class="sparkle sparkle-3">✨</span>
        <span class="sparkle sparkle-4">✨</span>
      </div>
    </div>
    {#if message}
      <p class="loading-message">{message}</p>
    {/if}
  </div>
</div>

<style>
  .christmas-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    text-align: center;
  }

  .loading-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
  }

  .christmas-spinner {
    position: relative;
    display: inline-block;
  }

  .ornament {
    position: relative;
    width: 3rem;
    height: 3.5rem;
    animation: ornament-swing 2s ease-in-out infinite;
  }

  .ornament-top {
    width: 0.5rem;
    height: 0.5rem;
    background: linear-gradient(135deg, #ffd700, #ffed4e);
    border-radius: 50% 50% 0 0;
    margin: 0 auto;
    box-shadow: 0 0 8px rgba(255, 215, 0, 0.6);
  }

  .ornament-body {
    width: 2.5rem;
    height: 2.5rem;
    margin: 0 auto;
    background: linear-gradient(135deg, #c41e3a 0%, #ff1a3a 50%, #c41e3a 100%);
    border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
    position: relative;
    box-shadow: 
      0 4px 12px rgba(196, 30, 58, 0.5),
      inset 0 2px 4px rgba(255, 255, 255, 0.3),
      inset 0 -2px 4px rgba(0, 0, 0, 0.2);
    border: 2px solid rgba(255, 215, 0, 0.4);
  }

  .ornament-shine {
    position: absolute;
    top: 20%;
    left: 30%;
    width: 30%;
    height: 30%;
    background: radial-gradient(circle, rgba(255, 255, 255, 0.8) 0%, transparent 70%);
    border-radius: 50%;
    animation: shine-pulse 2s ease-in-out infinite;
  }

  .ornament-hook {
    position: absolute;
    top: -0.25rem;
    left: 50%;
    transform: translateX(-50%);
    width: 0.25rem;
    height: 0.5rem;
    background: linear-gradient(180deg, #ffd700, #ffed4e);
    border-radius: 0.125rem;
    box-shadow: 0 0 4px rgba(255, 215, 0, 0.6);
  }

  .sparkles {
    position: absolute;
    inset: -1rem;
    pointer-events: none;
  }

  .sparkle {
    position: absolute;
    font-size: 0.75rem;
    animation: sparkle-rotate 3s linear infinite;
    opacity: 0.8;
    filter: drop-shadow(0 0 4px rgba(255, 215, 0, 0.8));
  }

  .sparkle-1 {
    top: 0;
    left: 50%;
    transform-origin: 50% 200%;
    animation-delay: 0s;
  }

  .sparkle-2 {
    top: 50%;
    right: 0;
    transform-origin: -100% 50%;
    animation-delay: 0.75s;
  }

  .sparkle-3 {
    bottom: 0;
    left: 50%;
    transform-origin: 50% -100%;
    animation-delay: 1.5s;
  }

  .sparkle-4 {
    top: 50%;
    left: 0;
    transform-origin: 200% 50%;
    animation-delay: 2.25s;
  }

  @keyframes ornament-swing {
    0%, 100% {
      transform: rotate(-8deg);
    }
    50% {
      transform: rotate(8deg);
    }
  }

  @keyframes shine-pulse {
    0%, 100% {
      opacity: 0.6;
      transform: scale(1);
    }
    50% {
      opacity: 1;
      transform: scale(1.2);
    }
  }

  @keyframes sparkle-rotate {
    0% {
      transform: rotate(0deg) translateY(0);
      opacity: 0.8;
    }
    25% {
      opacity: 1;
    }
    50% {
      transform: rotate(180deg) translateY(-0.5rem);
      opacity: 0.9;
    }
    75% {
      opacity: 1;
    }
    100% {
      transform: rotate(360deg) translateY(0);
      opacity: 0.8;
    }
  }

  .loading-message {
    font-size: 1.125rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.95);
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
    margin: 0;
    animation: text-glow 2s ease-in-out infinite;
  }

  @keyframes text-glow {
    0%, 100% {
      text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5), 0 0 10px rgba(255, 215, 0, 0.3);
    }
    50% {
      text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5), 0 0 20px rgba(255, 215, 0, 0.6);
    }
  }

  /* Size variants */
  .small .ornament {
    width: 2rem;
    height: 2.25rem;
  }

  .small .ornament-body {
    width: 1.5rem;
    height: 1.5rem;
  }

  .small .sparkle {
    font-size: 0.5rem;
  }

  .small .loading-message {
    font-size: 0.875rem;
  }

  .medium .ornament {
    width: 3rem;
    height: 3.5rem;
  }

  .large .ornament {
    width: 4.5rem;
    height: 5.25rem;
  }

  .large .ornament-body {
    width: 3.75rem;
    height: 3.75rem;
  }

  .large .sparkle {
    font-size: 1rem;
  }

  .large .loading-message {
    font-size: 1.5rem;
  }

  /* Variant styles */
  .connecting .ornament-body {
    background: linear-gradient(135deg, #0f8644 0%, #1db954 50%, #0f8644 100%);
    box-shadow: 
      0 4px 12px rgba(15, 134, 68, 0.5),
      inset 0 2px 4px rgba(255, 255, 255, 0.3),
      inset 0 -2px 4px rgba(0, 0, 0, 0.2);
  }

  .uploading .ornament-body {
    background: linear-gradient(135deg, #ffd700 0%, #ffed4e 50%, #ffd700 100%);
    box-shadow: 
      0 4px 12px rgba(255, 215, 0, 0.5),
      inset 0 2px 4px rgba(255, 255, 255, 0.4),
      inset 0 -2px 4px rgba(0, 0, 0, 0.2);
  }

  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .ornament,
    .ornament-shine,
    .sparkle,
    .loading-message {
      animation: none !important;
    }
    
    .ornament {
      transform: rotate(0deg);
    }
  }
</style>

