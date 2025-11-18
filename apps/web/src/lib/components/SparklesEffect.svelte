<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { createSparkles, createSparkleElement, type Sparkle } from '$lib/effects/sparkles';
  
  export let enabled: boolean = true;
  export let count: number = 20; // Default count, will be reduced on mobile
  
  let container: HTMLElement;
  let sparkleElements: HTMLElement[] = [];
  let sparkles: Sparkle[] = [];
  let animationFrame: number | null = null;
  let isMobile = false;
  let prefersReducedMotion = false;
  
  onMount(() => {
    if (!browser) return;
    
    // Detect mobile and reduced motion preference
    isMobile = window.innerWidth < 768;
    prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    if (isMobile) {
      count = Math.floor(count / 2); // Reduce sparkles on mobile
    }
    
    if (prefersReducedMotion) {
      count = 0; // Disable sparkles if reduced motion is preferred
    }
    
    if (enabled) {
      createSparkleSystem();
    }
    
    // Handle resize
    const handleResize = () => {
      const wasMobile = isMobile;
      isMobile = window.innerWidth < 768;
      if (wasMobile !== isMobile) {
        removeSparkles();
        count = isMobile ? Math.floor(count / 2) : count * 2;
        if (enabled) {
          createSparkleSystem();
        }
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      removeSparkles();
    };
  });
  
  $: if (enabled && browser) {
    if (sparkleElements.length === 0) {
      createSparkleSystem();
    }
  } else {
    removeSparkles();
  }
  
  function createSparkleSystem() {
    if (!container || !browser) return;
    
    removeSparkles();
    
    sparkles = createSparkles(count, container);
    sparkleElements = sparkles.map(sparkle => {
      const element = createSparkleElement(sparkle);
      container.appendChild(element);
      return element;
    });
    
    // Update sparkles periodically for movement
    updateSparkles();
  }
  
  let frameCount = 0;
  
  function updateSparkles() {
    if (!enabled || !container || sparkleElements.length === 0 || prefersReducedMotion) return;
    
    frameCount++;
    if (frameCount % 3 === 0) { // Update every 3rd frame
      // Randomly move some sparkles (reduced frequency)
      sparkleElements.forEach((element, index) => {
        if (Math.random() > 0.98) { // 2% chance to move each update
          const sparkle = sparkles[index];
          const containerRect = container.getBoundingClientRect();
          sparkle.x = Math.random() * containerRect.width;
          sparkle.y = Math.random() * containerRect.height;
          element.style.left = `${sparkle.x}px`;
          element.style.top = `${sparkle.y}px`;
        }
      });
    }
    animationFrame = requestAnimationFrame(updateSparkles);
  }
  
  function removeSparkles() {
    if (animationFrame !== null) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
    
    sparkleElements.forEach(element => {
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
    });
    sparkleElements = [];
    sparkles = [];
  }
</script>

<div bind:this={container} class="sparkles-container" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1000;"></div>

<style>
  :global(.sparkle) {
    will-change: transform, opacity;
  }
  
  @media (prefers-reduced-motion: reduce) {
    :global(.sparkle) {
      animation: none !important;
    }
  }
</style>

