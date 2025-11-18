<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  
  export let enabled: boolean = true;
  export let count: number = 8; // Number of icicles
  
  let container: HTMLElement;
  let icicleElements: HTMLElement[] = [];
  let prefersReducedMotion = false;
  let isMobile = false;
  
  onMount(() => {
    if (!browser) return;
    
    prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    isMobile = window.innerWidth < 768;
    
    // Disable icicles on mobile or if reduced motion is preferred
    if (enabled && !isMobile && !prefersReducedMotion) {
      createIcicles();
    }
  });
  
  $: if (enabled && browser && !isMobile && !prefersReducedMotion) {
    if (icicleElements.length === 0) {
      createIcicles();
    }
  } else {
    removeIcicles();
  }
  
  function createIcicles() {
    if (!container || !browser) return;
    
    removeIcicles();
    
    const containerWidth = container.offsetWidth || window.innerWidth;
    const spacing = containerWidth / (count + 1);
    
    for (let i = 0; i < count; i++) {
      const icicle = document.createElement('div');
      icicle.className = 'icicle';
      
      const left = spacing * (i + 1);
      const length = Math.random() * 40 + 30; // 30-70px
      const width = Math.random() * 8 + 4; // 4-12px
      const delay = Math.random() * 2; // Random delay for swaying
      
      icicle.style.cssText = `
        position: absolute;
        top: 0;
        left: ${left}px;
        width: ${width}px;
        height: ${length}px;
        background: linear-gradient(to bottom, rgba(176, 224, 230, 0.9), rgba(176, 224, 230, 0.3));
        clip-path: polygon(0 0, 100% 0, 80% 100%, 20% 100%);
        border-radius: 0 0 ${width / 2}px ${width / 2}px;
        box-shadow: 0 0 10px rgba(176, 224, 230, 0.5),
                    inset 0 0 10px rgba(255, 255, 255, 0.3);
        animation: icicle-sway 3s ease-in-out ${delay}s infinite;
        pointer-events: none;
        z-index: 999;
        transform-origin: top center;
      `;
      
      // Add glint effect
      const glint = document.createElement('div');
      glint.className = 'icicle-glint';
      glint.style.cssText = `
        position: absolute;
        top: 0;
        left: 20%;
        width: 30%;
        height: 100%;
        background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.6), transparent);
        animation: icicle-glint 2s ease-in-out ${delay + 1}s infinite;
        pointer-events: none;
      `;
      icicle.appendChild(glint);
      
      container.appendChild(icicle);
      icicleElements.push(icicle);
    }
  }
  
  function removeIcicles() {
    icicleElements.forEach(element => {
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
    });
    icicleElements = [];
  }
</script>

<div bind:this={container} class="icicles-container" style="position: fixed; top: 0; left: 0; width: 100%; height: 100px; pointer-events: none; z-index: 999; overflow: hidden;"></div>

<style>
  @keyframes icicle-sway {
    0%, 100% {
      transform: rotate(-1deg);
    }
    50% {
      transform: rotate(1deg);
    }
  }
  
  @keyframes icicle-glint {
    0%, 100% {
      opacity: 0;
      transform: translateX(-100%);
    }
    50% {
      opacity: 1;
      transform: translateX(200%);
    }
  }
  
  @media (prefers-reduced-motion: reduce) {
    :global(.icicle) {
      animation: none !important;
    }
    
    :global(.icicle-glint) {
      animation: none !important;
    }
  }
  
  @media (max-width: 768px) {
    :global(.icicle) {
      display: none; /* Hide icicles on mobile for performance */
    }
  }
</style>

