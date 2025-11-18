<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { getAudioManager } from '$lib/audio';
  import { browser } from '$app/environment';

  export let mode: 'bars' | 'waveform' | 'circles' = 'bars';
  export let width: number = 300;
  export let height: number = 80;
  export let barCount: number = 32;
  export let color: string = '#c41e3a';

  let canvas: HTMLCanvasElement;
  let animationFrameId: number | null = null;
  let ctx: CanvasRenderingContext2D | null = null;

  onMount(() => {
    if (!browser || !canvas) return;

    ctx = canvas.getContext('2d');
    if (!ctx) return;

    startVisualization();
  });

  onDestroy(() => {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
    }
  });

  function startVisualization() {
    if (!browser || !ctx) return;

    const audioManager = getAudioManager();
    const analyser = audioManager.getAnalyser();

    // If analyser doesn't exist, try to get it again after a short delay
    // This handles the case where audio context is being set up
    if (!analyser) {
      setTimeout(() => {
        startVisualization();
      }, 100);
      return;
    }

    function draw() {
      if (!ctx || !canvas) return;

      const frequencyData = audioManager.getFrequencyData();
      if (!frequencyData) {
        animationFrameId = requestAnimationFrame(draw);
        return;
      }

      // Clear canvas
      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (mode === 'bars') {
        drawBars(frequencyData);
      } else if (mode === 'waveform') {
        drawWaveform(frequencyData);
      } else if (mode === 'circles') {
        drawCircles(frequencyData);
      }

      animationFrameId = requestAnimationFrame(draw);
    }

    function drawBars(data: Uint8Array) {
      if (!ctx || !canvas) return;

      const barWidth = canvas.width / barCount;
      const step = Math.floor(data.length / barCount);

      for (let i = 0; i < barCount; i++) {
        const value = data[i * step] / 255;
        const barHeight = value * canvas.height * 0.8;
        const x = i * barWidth;
        const y = canvas.height - barHeight;

        // Create gradient
        const gradient = ctx.createLinearGradient(x, 0, x, canvas.height);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, '#0f8644');

        ctx.fillStyle = gradient;
        ctx.fillRect(x + barWidth * 0.1, y, barWidth * 0.8, barHeight);
      }
    }

    function drawWaveform(data: Uint8Array) {
      if (!ctx || !canvas) return;

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();

      const sliceWidth = canvas.width / data.length;
      let x = 0;

      for (let i = 0; i < data.length; i++) {
        const v = data[i] / 255.0;
        const y = (v * canvas.height) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    }

    function drawCircles(data: Uint8Array) {
      if (!ctx || !canvas) return;

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const maxRadius = Math.min(canvas.width, canvas.height) / 2 - 10;

      // Draw multiple concentric circles based on frequency bands
      const bands = 8;
      const step = Math.floor(data.length / bands);

      for (let i = 0; i < bands; i++) {
        const value = data[i * step] / 255;
        const radius = 10 + value * maxRadius;

        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, 'rgba(15, 134, 68, 0.3)');

        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    draw();
  }

  // Restart visualization when mode changes or audio starts
  $: if (mode && canvas) {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
    }
    startVisualization();
  }
</script>

<canvas
  bind:this={canvas}
  width={width}
  height={height}
  class="audio-visualizer"
  style="background: rgba(0, 0, 0, 0.2); border-radius: 8px;"
></canvas>

<style>
  .audio-visualizer {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>

