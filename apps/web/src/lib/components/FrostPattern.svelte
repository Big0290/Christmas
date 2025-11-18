<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  
  export let enabled: boolean = true;
  export let intensity: number = 0.3; // 0-1
  
  let patternElement: HTMLElement;
  let prefersReducedMotion = false;
  
  onMount(() => {
    if (!browser || !patternElement) return;
    prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (enabled && !prefersReducedMotion) {
      createFrostPattern();
    }
  });
  
  $: if (enabled && browser && patternElement && !prefersReducedMotion) {
    createFrostPattern();
  } else if (patternElement) {
    patternElement.style.display = 'none';
  }
  
  function createFrostPattern() {
    if (!patternElement || !browser) return;
    
    // Create SVG pattern for frost
    const svg = `
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="frost-pattern" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
            <circle cx="20" cy="20" r="1" fill="rgba(255, 255, 255, 0.1)"/>
            <circle cx="50" cy="30" r="0.8" fill="rgba(255, 255, 255, 0.08)"/>
            <circle cx="80" cy="25" r="1.2" fill="rgba(255, 255, 255, 0.12)"/>
            <circle cx="30" cy="60" r="0.9" fill="rgba(255, 255, 255, 0.1)"/>
            <circle cx="70" cy="70" r="1.1" fill="rgba(255, 255, 255, 0.09)"/>
            <circle cx="10" cy="80" r="0.7" fill="rgba(255, 255, 255, 0.07)"/>
            <circle cx="90" cy="90" r="1" fill="rgba(255, 255, 255, 0.11)"/>
            <path d="M 15 15 L 25 25 M 45 20 L 55 30 M 75 15 L 85 25" 
                  stroke="rgba(255, 255, 255, 0.05)" 
                  stroke-width="0.5" 
                  stroke-linecap="round"/>
            <path d="M 20 50 L 30 60 M 60 55 L 70 65 M 85 50 L 95 60" 
                  stroke="rgba(255, 255, 255, 0.04)" 
                  stroke-width="0.4" 
                  stroke-linecap="round"/>
          </pattern>
          <filter id="frost-blur">
            <feGaussianBlur stdDeviation="1"/>
          </filter>
        </defs>
        <rect width="100%" height="100%" fill="url(#frost-pattern)" opacity="${intensity}" filter="url(#frost-blur)"/>
      </svg>
    `;
    
    patternElement.innerHTML = svg;
    patternElement.style.display = enabled ? 'block' : 'none';
  }
</script>

<div bind:this={patternElement} class="frost-pattern" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 10; mix-blend-mode: overlay;"></div>

<style>
  .frost-pattern {
    animation: frost-crystallize 3s ease-out;
  }
  
  @media (prefers-reduced-motion: reduce) {
    .frost-pattern {
      animation: none !important;
    }
  }
</style>

