<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { t } from '$lib/i18n';

  export let waitingText: string = 'Waiting for Game';
  export let subtitleText: string = 'The host will start a game soon...';

  let snowflakes: Array<{ id: number; x: number; y: number; size: number; speed: number; opacity: number }> = [];
  let ornaments: Array<{ id: number; x: number; y: number; emoji: string; rotation: number; speed: number }> = [];
  let stars: Array<{ id: number; x: number; y: number; size: number; twinkle: number }> = [];
  let animationFrame: number | null = null;
  let startTime = Date.now();

  const ornamentEmojis = ['🎄', '🎁', '⭐', '🔔', '❄️', '🎅', '🤶', '🦌', '🧦', '🕯️'];

  function createSnowflake() {
    return {
      id: Math.random(),
      x: Math.random() * 100,
      y: -10,
      size: Math.random() * 4 + 2,
      speed: Math.random() * 2 + 1,
      opacity: Math.random() * 0.5 + 0.5
    };
  }

  function createOrnament() {
    return {
      id: Math.random(),
      x: Math.random() * 100,
      y: Math.random() * 100,
      emoji: ornamentEmojis[Math.floor(Math.random() * ornamentEmojis.length)],
      rotation: Math.random() * 360,
      speed: (Math.random() - 0.5) * 0.5
    };
  }

  function createStar() {
    return {
      id: Math.random(),
      x: Math.random() * 100,
      y: Math.random() * 50,
      size: Math.random() * 3 + 1,
      twinkle: Math.random() * Math.PI * 2
    };
  }

  function animate() {
    const now = Date.now();
    const elapsed = (now - startTime) / 1000;

    // Update snowflakes
    snowflakes = snowflakes.map((flake) => {
      let newY = flake.y + flake.speed * 0.5;
      if (newY > 110) {
        return createSnowflake();
      }
      return { ...flake, y: newY };
    });

    // Update ornaments (floating animation)
    ornaments = ornaments.map((ornament) => {
      const newRotation = ornament.rotation + ornament.speed;
      const floatY = Math.sin(elapsed * 0.5 + ornament.id) * 2;
      return {
        ...ornament,
        rotation: newRotation,
        y: 50 + floatY
      };
    });

    // Update stars (twinkling)
    stars = stars.map((star) => {
      const newTwinkle = star.twinkle + 0.1;
      return {
        ...star,
        twinkle: newTwinkle > Math.PI * 2 ? 0 : newTwinkle
      };
    });

    animationFrame = requestAnimationFrame(animate);
  }

  onMount(() => {
    // Create initial snowflakes
    for (let i = 0; i < 30; i++) {
      snowflakes.push(createSnowflake());
    }

    // Create floating ornaments
    for (let i = 0; i < 8; i++) {
      ornaments.push(createOrnament());
    }

    // Create twinkling stars
    for (let i = 0; i < 15; i++) {
      stars.push(createStar());
    }

    startTime = Date.now();
    animate();
  });

  onDestroy(() => {
    if (animationFrame !== null) {
      cancelAnimationFrame(animationFrame);
    }
  });
</script>

<div class="lobby-animation-container">
  <!-- Animated Background Layer -->
  <div class="animation-layer">
    <!-- Snowflakes -->
    {#each snowflakes as flake}
      <div
        class="snowflake"
        style="left: {flake.x}%; top: {flake.y}%; width: {flake.size}px; height: {flake.size}px; opacity: {flake.opacity};"
      >
        ❄️
      </div>
    {/each}

    <!-- Twinkling Stars -->
    {#each stars as star}
      <div
        class="star"
        style="left: {star.x}%; top: {star.y}%; width: {star.size * 4}px; height: {star.size * 4}px; opacity: {0.3 + Math.sin(star.twinkle) * 0.4};"
      >
        ⭐
      </div>
    {/each}
  </div>

  <!-- Main Content -->
  <div class="lobby-content">
    <!-- Animated Christmas Tree -->
    <div class="christmas-tree-container">
      <div class="tree-wrapper">
        <div class="tree">🎄</div>
        <!-- Tree decorations -->
        <div class="tree-decoration decoration-1">✨</div>
        <div class="tree-decoration decoration-2">✨</div>
        <div class="tree-decoration decoration-3">✨</div>
        <div class="tree-decoration decoration-4">✨</div>
        <div class="tree-decoration decoration-5">✨</div>
      </div>
    </div>

    <!-- Floating Ornaments -->
    <div class="ornaments-layer">
      {#each ornaments as ornament}
        <div
          class="ornament"
          style="left: {ornament.x}%; top: {ornament.y}%; transform: rotate({ornament.rotation}deg);"
        >
          {ornament.emoji}
        </div>
      {/each}
    </div>

    <!-- Text Content -->
    <div class="lobby-text">
      <h2 class="lobby-title">
        {#each waitingText.split(' ') as word, i}
          <span class="title-word" style="animation-delay: {i * 0.2}s;">{word}</span>
        {/each}
      </h2>
      <p class="lobby-subtitle">{subtitleText}</p>
      <div class="loading-dots">
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
      </div>
    </div>
  </div>
</div>

<style>
  .lobby-animation-container {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 400px;
    overflow: hidden;
    background: linear-gradient(180deg, #0a0e27 0%, #1a1f3a 50%, #0f1629 100%);
    border-radius: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .animation-layer {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .snowflake {
    position: absolute;
    font-size: 0.8rem;
    animation: fall linear infinite;
    pointer-events: none;
  }

  @keyframes fall {
    to {
      transform: translateY(100vh) rotate(360deg);
    }
  }

  .star {
    position: absolute;
    font-size: 0.6rem;
    animation: twinkle 2s ease-in-out infinite;
    pointer-events: none;
  }

  @keyframes twinkle {
    0%, 100% {
      opacity: 0.3;
      transform: scale(1);
    }
    50% {
      opacity: 1;
      transform: scale(1.2);
    }
  }

  .lobby-content {
    position: relative;
    z-index: 10;
    text-align: center;
    padding: 2rem;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  .christmas-tree-container {
    margin-bottom: 2rem;
    position: relative;
  }

  .tree-wrapper {
    position: relative;
    display: inline-block;
  }

  .tree {
    font-size: 6rem;
    animation: tree-glow 2s ease-in-out infinite;
    filter: drop-shadow(0 0 20px rgba(255, 215, 0, 0.5));
  }

  @keyframes tree-glow {
    0%, 100% {
      filter: drop-shadow(0 0 20px rgba(255, 215, 0, 0.5));
      transform: scale(1);
    }
    50% {
      filter: drop-shadow(0 0 30px rgba(255, 215, 0, 0.8));
      transform: scale(1.05);
    }
  }

  .tree-decoration {
    position: absolute;
    font-size: 1.2rem;
    animation: sparkle 1.5s ease-in-out infinite;
    pointer-events: none;
  }

  .decoration-1 {
    top: 10%;
    left: 45%;
    animation-delay: 0s;
  }

  .decoration-2 {
    top: 25%;
    left: 35%;
    animation-delay: 0.3s;
  }

  .decoration-3 {
    top: 25%;
    left: 60%;
    animation-delay: 0.6s;
  }

  .decoration-4 {
    top: 40%;
    left: 40%;
    animation-delay: 0.9s;
  }

  .decoration-5 {
    top: 40%;
    left: 55%;
    animation-delay: 1.2s;
  }

  @keyframes sparkle {
    0%, 100% {
      opacity: 0.5;
      transform: scale(1) rotate(0deg);
    }
    50% {
      opacity: 1;
      transform: scale(1.3) rotate(180deg);
    }
  }

  .ornaments-layer {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .ornament {
    position: absolute;
    font-size: 1.5rem;
    animation: float 3s ease-in-out infinite;
    pointer-events: none;
  }

  @keyframes float {
    0%, 100% {
      transform: translateY(0) rotate(0deg);
    }
    50% {
      transform: translateY(-20px) rotate(180deg);
    }
  }

  .lobby-text {
    margin-top: 1rem;
  }

  .lobby-title {
    font-size: 2.5rem;
    font-weight: bold;
    margin-bottom: 1rem;
    display: flex;
    gap: 0.5rem;
    justify-content: center;
    flex-wrap: wrap;
  }

  .title-word {
    background: linear-gradient(135deg, #ffd700 0%, #ffed4e 50%, #ffd700 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    text-shadow: 0 0 20px rgba(255, 215, 0, 0.5);
    animation: word-pulse 2s ease-in-out infinite;
  }


  @keyframes word-pulse {
    0%, 100% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(1.1);
      opacity: 0.9;
    }
  }

  .lobby-subtitle {
    font-size: 1.2rem;
    color: rgba(255, 255, 255, 0.8);
    margin-bottom: 1.5rem;
  }

  .loading-dots {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
    margin-top: 1rem;
  }

  .dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: linear-gradient(135deg, #ffd700, #ffed4e);
    animation: dot-bounce 1.4s ease-in-out infinite;
    box-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
  }

  .dot:nth-child(1) {
    animation-delay: 0s;
  }

  .dot:nth-child(2) {
    animation-delay: 0.2s;
  }

  .dot:nth-child(3) {
    animation-delay: 0.4s;
  }

  @keyframes dot-bounce {
    0%, 80%, 100% {
      transform: scale(0.8);
      opacity: 0.5;
    }
    40% {
      transform: scale(1.2);
      opacity: 1;
    }
  }

  /* Responsive */
  @media (max-width: 768px) {
    .tree {
      font-size: 4rem;
    }

    .lobby-title {
      font-size: 2rem;
    }

    .lobby-subtitle {
      font-size: 1rem;
    }
  }
</style>

