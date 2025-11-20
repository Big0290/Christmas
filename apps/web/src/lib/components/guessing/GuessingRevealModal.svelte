<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { createEventDispatcher } from 'svelte';
  import { browser } from '$app/environment';
  import type { GuessingChallenge, GuessingSubmission } from '@christmas/core';

  export let open: boolean = false;
  export let challenge: GuessingChallenge | null = null;
  export let submissions: GuessingSubmission[] = [];

  const dispatch = createEventDispatcher<{
    close: void;
  }>();

  let revealPhase: 'intro' | 'third' | 'second' | 'winner' | 'all' = 'intro';
  let animationTimeouts: ReturnType<typeof setTimeout>[] = [];
  let snowflakesContainer: HTMLDivElement | null = null;
  let sequenceStarted = false;
  let modalContainer: HTMLDivElement | null = null;

  // Sort submissions by difference (closest first)
  $: sortedSubmissions = [...submissions].sort((a, b) => {
    if (a.difference !== b.difference) {
      return a.difference - b.difference;
    }
    return new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime();
  });

  $: topThree = sortedSubmissions.slice(0, 3);
  $: thirdPlace = topThree[2] || null;
  $: secondPlace = topThree[1] || null;
  $: winner = topThree[0] || null;

  function handleClose() {
    // Clear all timeouts
    animationTimeouts.forEach(timeout => clearTimeout(timeout));
    animationTimeouts = [];
    revealPhase = 'intro';
    sequenceStarted = false;
    dispatch('close');
  }

  function startRevealSequence() {
    if (!challenge || sortedSubmissions.length === 0 || sequenceStarted) {
      if (!challenge || sortedSubmissions.length === 0) {
        handleClose();
      }
      return;
    }

    sequenceStarted = true;

    // Clear any existing timeouts
    animationTimeouts.forEach(timeout => clearTimeout(timeout));
    animationTimeouts = [];

    revealPhase = 'intro';
    
    // Phase 1: Show 3rd place (after 1 second)
    if (thirdPlace) {
      const timeout1 = setTimeout(() => {
        revealPhase = 'third';
      }, 1000);
      animationTimeouts.push(timeout1);
    } else if (secondPlace) {
      const timeout1 = setTimeout(() => {
        revealPhase = 'second';
      }, 1000);
      animationTimeouts.push(timeout1);
    } else if (winner) {
      const timeout1 = setTimeout(() => {
        revealPhase = 'winner';
      }, 1000);
      animationTimeouts.push(timeout1);
    } else {
      const timeout1 = setTimeout(() => {
        revealPhase = 'all';
      }, 1000);
      animationTimeouts.push(timeout1);
    }

    // Phase 2: Show 2nd place (after 3 seconds)
    if (secondPlace) {
      const timeout2 = setTimeout(() => {
        revealPhase = 'second';
      }, 3000);
      animationTimeouts.push(timeout2);
    }

    // Phase 3: Show winner (after 5 seconds)
    if (winner) {
      const timeout3 = setTimeout(() => {
        revealPhase = 'winner';
      }, 5000);
      animationTimeouts.push(timeout3);
    }

    // Phase 4: Show all (after 7 seconds)
    const timeout4 = setTimeout(() => {
      revealPhase = 'all';
    }, 7000);
    animationTimeouts.push(timeout4);
  }

  $: if (open && challenge && sortedSubmissions.length > 0 && !sequenceStarted) {
    startRevealSequence();
  }

  $: if (open && snowflakesContainer) {
    // Create snowflakes when container is available
    createSnowflakes();
  }

  $: if (!open) {
    // Reset when modal closes
    sequenceStarted = false;
    revealPhase = 'intro';
  }

  function createSnowflakes() {
    if (!snowflakesContainer) return;
    
    snowflakesContainer.innerHTML = '';
    
    // Create 50 snowflakes
    for (let i = 0; i < 50; i++) {
      const snowflake = document.createElement('div');
      snowflake.className = 'snowflake';
      snowflake.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M10 0 L10.5 5 L15 4.5 L12 8 L16 10 L12 12 L15 15.5 L10.5 15 L10 20 L9.5 15 L5 15.5 L8 12 L4 10 L8 8 L5 4.5 L9.5 5 Z" 
                fill="rgba(255,255,255,0.6)" stroke="rgba(255,255,255,0.8)" stroke-width="0.5"/>
        </svg>
      `;
      snowflake.style.left = `${Math.random() * 100}%`;
      snowflake.style.animationDelay = `${Math.random() * 5}s`;
      snowflake.style.animationDuration = `${8 + Math.random() * 4}s`;
      snowflake.style.opacity = `${0.3 + Math.random() * 0.4}`;
      const size = 12 + Math.random() * 8;
      snowflake.style.width = `${size}px`;
      snowflake.style.height = `${size}px`;
      snowflakesContainer.appendChild(snowflake);
    }
  }

  // Watch for open changes to move modal to body
  $: if (open && browser) {
    tick().then(() => {
      portalToBody();
    });
  }

  function portalToBody() {
    if (!browser || !modalContainer) return;
    
    // Remove from current parent if it exists
    if (modalContainer.parentNode && modalContainer.parentNode !== document.body) {
      modalContainer.parentNode.removeChild(modalContainer);
    }
    
    // Always append to body to ensure it's at the root level
    if (!document.body.contains(modalContainer)) {
      document.body.appendChild(modalContainer);
      createSnowflakes();
    }
  }

  onMount(() => {
    if (open && browser) {
      tick().then(() => {
        portalToBody();
      });
    }
  });

  onDestroy(() => {
    animationTimeouts.forEach(timeout => clearTimeout(timeout));
    animationTimeouts = [];
    // Remove modal from body if it was moved there
    if (modalContainer && browser && document.body.contains(modalContainer)) {
      document.body.removeChild(modalContainer);
    }
  });

  function formatGuess(value: number): string {
    return value.toFixed(2);
  }

  function formatDifference(diff: number): string {
    return diff.toFixed(2);
  }
</script>

{#if open && challenge}
  <!-- Portal container - will be moved to body -->
  <div 
    class="reveal-modal-overlay" 
    role="dialog" 
    aria-modal="true" 
    aria-labelledby="reveal-title"
    on:click|self={handleClose}
    bind:this={modalContainer}
  >
    <!-- Background decorations -->
    <div class="snowflakes-container" bind:this={snowflakesContainer}></div>
    
    <!-- SVG decorative elements -->
    <svg class="decorative-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
      <defs>
        <linearGradient id="starGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:var(--christmas-gold);stop-opacity:0.3" />
          <stop offset="50%" style="stop-color:var(--christmas-red);stop-opacity:0.2" />
          <stop offset="100%" style="stop-color:var(--christmas-green);stop-opacity:0.3" />
        </linearGradient>
      </defs>
      <!-- Stars scattered across background -->
      {#each Array(20) as _, i}
        <circle 
          cx={Math.random() * 100} 
          cy={Math.random() * 100} 
          r={0.5 + Math.random() * 0.5}
          fill="url(#starGradient)"
          opacity={0.4 + Math.random() * 0.3}
          class="twinkle-star"
          style="animation-delay: {Math.random() * 2}s"
        />
      {/each}
    </svg>

    <!-- Close button -->
    <button class="close-button" on:click={handleClose} aria-label="Close reveal modal">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    </button>

    <!-- Main content -->
    <div class="reveal-content">
      <!-- Challenge title -->
      <div class="challenge-title-section">
        <h1 id="reveal-title" class="challenge-title">{challenge.title}</h1>
        <div class="correct-answer-display">
          <span class="correct-label">Correct Answer:</span>
          <span class="correct-value">{formatGuess(challenge.correct_answer)}</span>
        </div>
      </div>

      <!-- Reveal phases -->
      <div class="reveal-phases">
        <!-- Phase 1: 3rd Place -->
        {#if revealPhase === 'third' || revealPhase === 'second' || revealPhase === 'winner' || revealPhase === 'all'}
          {#if thirdPlace}
            <div class="reveal-card third-place visible">
              <div class="rank-badge third-badge">
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="20" cy="20" r="18" fill="var(--christmas-red)" opacity="0.2"/>
                  <text x="20" y="28" text-anchor="middle" fill="var(--christmas-red)" font-size="24" font-weight="bold">3</text>
                </svg>
              </div>
              <div class="reveal-info">
                <div class="player-name">{thirdPlace.player_name || 'Anonymous'}</div>
                <div class="guess-value">{formatGuess(thirdPlace.guess_value)}</div>
                <div class="difference-value">Difference: {formatDifference(thirdPlace.difference)}</div>
              </div>
            </div>
          {/if}
        {/if}

        <!-- Phase 2: 2nd Place -->
        {#if revealPhase === 'second' || revealPhase === 'winner' || revealPhase === 'all'}
          {#if secondPlace}
            <div class="reveal-card second-place visible">
              <div class="rank-badge second-badge">
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="20" cy="20" r="18" fill="var(--christmas-gold)" opacity="0.2"/>
                  <text x="20" y="28" text-anchor="middle" fill="var(--christmas-gold)" font-size="24" font-weight="bold">2</text>
                </svg>
              </div>
              <div class="reveal-info">
                <div class="player-name">{secondPlace.player_name || 'Anonymous'}</div>
                <div class="guess-value">{formatGuess(secondPlace.guess_value)}</div>
                <div class="difference-value">Difference: {formatDifference(secondPlace.difference)}</div>
              </div>
            </div>
          {/if}
        {/if}

        <!-- Phase 3: Winner -->
        {#if revealPhase === 'winner' || revealPhase === 'all'}
          {#if winner}
            <div class="reveal-card winner-place visible">
              <div class="rank-badge winner-badge">
                <svg width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="30" cy="30" r="28" fill="var(--christmas-gold)" opacity="0.3"/>
                  <path d="M30 10 L35 25 L50 25 L38 35 L42 50 L30 40 L18 50 L22 35 L10 25 L25 25 Z" 
                        fill="var(--christmas-gold)" opacity="0.8"/>
                </svg>
              </div>
              <div class="reveal-info">
                <div class="player-name winner-name">{winner.player_name || 'Anonymous'}</div>
                <div class="guess-value winner-guess">{formatGuess(winner.guess_value)}</div>
                <div class="difference-value winner-diff">Difference: {formatDifference(winner.difference)}</div>
              </div>
              <div class="celebration-sparkles">
                {#each Array(24) as _, i}
                  <div class="sparkle" style="--delay: {i * 0.08}s; --angle: {i * 15}deg"></div>
                {/each}
              </div>
            </div>
          {/if}
        {/if}

        <!-- Phase 4: All Submissions -->
        {#if revealPhase === 'all'}
          <div class="all-submissions-section">
            <h2 class="all-submissions-title">All Guesses</h2>
            <div class="submissions-list">
              {#each sortedSubmissions as submission, index (submission.id)}
                <div class="submission-item" class:top-three={index < 3}>
                  <div class="submission-rank">#{index + 1}</div>
                  <div class="submission-details">
                    <div class="submission-name">{submission.player_name || 'Anonymous'}</div>
                    <div class="submission-meta">
                      <span class="submission-guess">{formatGuess(submission.guess_value)}</span>
                      <span class="submission-diff">±{formatDifference(submission.difference)}</span>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .reveal-modal-overlay {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    max-width: 100vw !important;
    max-height: 100vh !important;
    min-width: 100vw !important;
    min-height: 100vh !important;
    z-index: 99999 !important;
    margin: 0 !important;
    padding: 0 !important;
    box-sizing: border-box !important;
    background: 
      radial-gradient(circle at 20% 30%, rgba(196, 30, 58, 0.4) 0%, transparent 50%),
      radial-gradient(circle at 80% 50%, rgba(15, 134, 68, 0.4) 0%, transparent 50%),
      radial-gradient(circle at 50% 80%, rgba(255, 215, 0, 0.3) 0%, transparent 50%),
      linear-gradient(135deg, 
        rgba(196, 30, 58, 0.3) 0%, 
        rgba(15, 134, 68, 0.3) 50%, 
        rgba(255, 215, 0, 0.2) 100%
      ),
      linear-gradient(180deg, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.9) 100%);
    overflow-y: auto !important;
    overflow-x: hidden !important;
    animation: fadeIn 0.4s ease-in;
    isolation: isolate;
    transform: translateZ(0);
    will-change: transform;
    contain: none !important;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .snowflakes-container {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
  }

  .snowflake {
    position: absolute;
    top: -20px;
    pointer-events: none;
    animation: snowFall linear infinite;
  }

  @keyframes snowFall {
    0% {
      transform: translateY(0) rotate(0deg);
    }
    100% {
      transform: translateY(100vh) rotate(360deg);
    }
  }

  .decorative-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    opacity: 0.6;
  }

  .twinkle-star {
    animation: twinkle 3s ease-in-out infinite;
  }

  @keyframes twinkle {
    0%, 100% {
      opacity: 0.4;
      transform: scale(1);
    }
    50% {
      opacity: 0.8;
      transform: scale(1.2);
    }
  }

  .close-button {
    position: fixed !important;
    top: 1.5rem !important;
    right: 1.5rem !important;
    z-index: 100000 !important;
    width: 48px;
    height: 48px;
    background: rgba(0, 0, 0, 0.5);
    border: 2px solid var(--christmas-gold);
    border-radius: 50%;
    color: var(--christmas-gold);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s;
    backdrop-filter: blur(10px);
  }

  .close-button:hover {
    background: rgba(255, 215, 0, 0.2);
    transform: scale(1.1);
    box-shadow: 0 0 20px rgba(255, 215, 0, 0.5);
  }

  .reveal-content {
    position: relative;
    z-index: 1;
    width: 100%;
    height: 100vh;
    margin: 0;
    padding: clamp(2rem, 3vh, 3rem) clamp(1.5rem, 2vw, 2rem);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
  }

  .challenge-title-section {
    text-align: center;
    margin-bottom: clamp(1rem, 2vh, 1.5rem);
    animation: slideDown 0.6s ease-out;
    flex-shrink: 0;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .challenge-title {
    font-size: clamp(2rem, 5vw, 3.5rem);
    font-weight: bold;
    color: var(--christmas-gold);
    margin: 0 0 clamp(0.75rem, 1.5vh, 1rem) 0;
    text-shadow: 
      0 0 20px rgba(255, 215, 0, 0.6),
      0 0 40px rgba(255, 215, 0, 0.4),
      2px 2px 8px rgba(0, 0, 0, 0.8);
    line-height: 1.2;
  }

  .correct-answer-display {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: clamp(0.5rem, 1.2vw, 0.75rem);
    padding: clamp(0.5rem, 1.5vh, 0.75rem) clamp(1rem, 2.5vw, 1.5rem);
    background: rgba(15, 134, 68, 0.2);
    border: 2px solid var(--christmas-green);
    border-radius: clamp(0.75rem, 1.5vw, 1rem);
    backdrop-filter: blur(10px);
  }

  .correct-label {
    color: rgba(255, 255, 255, 0.9);
    font-size: clamp(0.875rem, 1.75vw, 1.25rem);
    font-weight: 600;
  }

  .correct-value {
    color: var(--christmas-green);
    font-size: clamp(1.5rem, 3.5vw, 2.5rem);
    font-weight: bold;
    text-shadow: 0 0 15px rgba(15, 134, 68, 0.6);
  }

  .reveal-phases {
    width: 100%;
    max-width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: clamp(1rem, 2vh, 1.5rem);
    padding: 0 clamp(1rem, 2vw, 2rem);
    box-sizing: border-box;
    flex: 1;
    min-height: 0;
  }

  .reveal-card {
    width: 100%;
    max-width: min(65%, 900px);
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(15px);
    border: 3px solid;
    border-radius: clamp(0.75rem, 1.5vw, 1rem);
    padding: clamp(0.875rem, 1.75vh, 1.25rem) clamp(1.5rem, 3vw, 2rem);
    display: flex;
    align-items: center;
    gap: clamp(1rem, 2vw, 1.5rem);
    position: relative;
    opacity: 0;
    transform: scale(0.5) translateY(50px) rotateX(45deg);
    transition: all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
    box-sizing: border-box;
    flex-shrink: 0;
    animation: cardEntrance 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }

  @keyframes cardEntrance {
    0% {
      opacity: 0;
      transform: scale(0.5) translateY(50px) rotateX(45deg);
      filter: blur(10px);
    }
    50% {
      transform: scale(1.1) translateY(-10px) rotateX(0deg);
    }
    100% {
      opacity: 1;
      transform: scale(1) translateY(0) rotateX(0deg);
      filter: blur(0);
    }
  }

  .reveal-card.visible {
    opacity: 1;
    transform: scale(1) translateY(0) rotateX(0deg);
    filter: blur(0);
  }

  .reveal-card.third-place {
    border-color: var(--christmas-red);
    box-shadow: 
      0 8px 32px rgba(196, 30, 58, 0.4),
      0 0 40px rgba(196, 30, 58, 0.2);
    animation: cardEntrance 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards,
               thirdPlacePulse 2s ease-in-out infinite 0.8s;
  }

  @keyframes thirdPlacePulse {
    0%, 100% {
      box-shadow: 
        0 8px 32px rgba(196, 30, 58, 0.4),
        0 0 40px rgba(196, 30, 58, 0.2),
        0 0 0 rgba(196, 30, 58, 0);
    }
    50% {
      box-shadow: 
        0 8px 32px rgba(196, 30, 58, 0.6),
        0 0 60px rgba(196, 30, 58, 0.4),
        0 0 100px rgba(196, 30, 58, 0.2);
    }
  }

  .reveal-card.second-place {
    border-color: var(--christmas-gold);
    box-shadow: 
      0 8px 32px rgba(255, 215, 0, 0.4),
      0 0 40px rgba(255, 215, 0, 0.2);
    animation: cardEntrance 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards,
               secondPlacePulse 2s ease-in-out infinite 0.8s;
  }

  @keyframes secondPlacePulse {
    0%, 100% {
      box-shadow: 
        0 8px 32px rgba(255, 215, 0, 0.4),
        0 0 40px rgba(255, 215, 0, 0.2),
        0 0 0 rgba(255, 215, 0, 0);
    }
    50% {
      box-shadow: 
        0 8px 32px rgba(255, 215, 0, 0.6),
        0 0 70px rgba(255, 215, 0, 0.4),
        0 0 120px rgba(255, 215, 0, 0.2);
    }
  }

  .reveal-card.winner-place {
    border-color: var(--christmas-gold);
    box-shadow: 
      0 12px 48px rgba(255, 215, 0, 0.6),
      0 0 60px rgba(255, 215, 0, 0.4),
      inset 0 0 30px rgba(255, 215, 0, 0.1);
    animation: cardEntrance 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards,
               winnerGlow 2s ease-in-out infinite 0.8s,
               winnerFloat 3s ease-in-out infinite 0.8s;
  }

  @keyframes winnerGlow {
    0%, 100% {
      box-shadow: 
        0 12px 48px rgba(255, 215, 0, 0.6),
        0 0 60px rgba(255, 215, 0, 0.4),
        0 0 100px rgba(255, 215, 0, 0.2),
        inset 0 0 30px rgba(255, 215, 0, 0.1);
    }
    50% {
      box-shadow: 
        0 12px 48px rgba(255, 215, 0, 0.9),
        0 0 100px rgba(255, 215, 0, 0.7),
        0 0 150px rgba(255, 215, 0, 0.4),
        inset 0 0 50px rgba(255, 215, 0, 0.3);
    }
  }

  @keyframes winnerFloat {
    0%, 100% {
      transform: translateY(0) scale(1);
    }
    50% {
      transform: translateY(-10px) scale(1.02);
    }
  }

  .rank-badge {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  .third-badge,
  .second-badge {
    width: clamp(50px, 6vw, 80px);
    height: clamp(50px, 6vw, 80px);
    animation: badgeEntrance 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards,
               badgePulse 2s ease-in-out infinite 0.8s;
  }

  .third-badge {
    animation: badgeEntrance 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards,
               badgePulse 2s ease-in-out infinite 0.8s,
               thirdBadgeRotate 3s ease-in-out infinite 0.8s;
  }

  .second-badge {
    animation: badgeEntrance 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards,
               badgePulse 2s ease-in-out infinite 0.8s,
               secondBadgeRotate 3s ease-in-out infinite 0.8s;
  }

  .winner-badge {
    width: clamp(70px, 9vw, 120px);
    height: clamp(70px, 9vw, 120px);
    animation: badgeEntrance 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards,
               winnerBadgePulse 1.5s ease-in-out infinite 0.8s;
  }

  @keyframes badgeEntrance {
    0% {
      opacity: 0;
      transform: scale(0) rotate(-180deg);
    }
    100% {
      opacity: 1;
      transform: scale(1) rotate(0deg);
    }
  }

  @keyframes badgePulse {
    0%, 100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.15);
    }
  }

  @keyframes thirdBadgeRotate {
    0%, 100% {
      transform: scale(1) rotate(0deg);
    }
    25% {
      transform: scale(1.1) rotate(5deg);
    }
    75% {
      transform: scale(1.1) rotate(-5deg);
    }
  }

  @keyframes secondBadgeRotate {
    0%, 100% {
      transform: scale(1) rotate(0deg);
    }
    25% {
      transform: scale(1.1) rotate(-5deg);
    }
    75% {
      transform: scale(1.1) rotate(5deg);
    }
  }

  @keyframes winnerBadgePulse {
    0%, 100% {
      transform: scale(1) rotate(0deg);
    }
    25% {
      transform: scale(1.25) rotate(15deg);
    }
    50% {
      transform: scale(1.35) rotate(0deg);
    }
    75% {
      transform: scale(1.25) rotate(-15deg);
    }
  }

  .reveal-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: clamp(0.25rem, 0.6vh, 0.5rem);
    justify-content: center;
  }

  .player-name {
    font-size: clamp(1rem, 2.2vw, 1.75rem);
    font-weight: bold;
    color: white;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
    line-height: 1.2;
  }

  .winner-name {
    font-size: clamp(1.25rem, 3vw, 2.25rem);
    color: var(--christmas-gold);
    text-shadow: 
      0 0 20px rgba(255, 215, 0, 0.6),
      0 2px 8px rgba(0, 0, 0, 0.5);
    line-height: 1.2;
    animation: nameGlow 2s ease-in-out infinite 0.8s;
  }

  @keyframes nameGlow {
    0%, 100% {
      text-shadow: 
        0 0 20px rgba(255, 215, 0, 0.6),
        0 2px 8px rgba(0, 0, 0, 0.5);
    }
    50% {
      text-shadow: 
        0 0 40px rgba(255, 215, 0, 0.9),
        0 0 60px rgba(255, 215, 0, 0.6),
        0 2px 8px rgba(0, 0, 0, 0.5);
    }
  }

  .guess-value {
    font-size: clamp(1.5rem, 3.2vw, 2.5rem);
    font-weight: bold;
    color: var(--christmas-gold);
    font-family: 'Courier New', monospace;
    text-shadow: 0 0 15px rgba(255, 215, 0, 0.5);
    line-height: 1.1;
  }

  .winner-guess {
    font-size: clamp(1.75rem, 3.8vw, 3rem);
    text-shadow: 
      0 0 25px rgba(255, 215, 0, 0.8),
      0 0 50px rgba(255, 215, 0, 0.4);
    animation: guessGlow 2s ease-in-out infinite 0.8s;
  }

  @keyframes guessGlow {
    0%, 100% {
      text-shadow: 
        0 0 25px rgba(255, 215, 0, 0.8),
        0 0 50px rgba(255, 215, 0, 0.4);
    }
    50% {
      text-shadow: 
        0 0 40px rgba(255, 215, 0, 1),
        0 0 80px rgba(255, 215, 0, 0.7),
        0 0 120px rgba(255, 215, 0, 0.4);
    }
  }

  .difference-value {
    font-size: clamp(0.75rem, 1.3vw, 1rem);
    color: rgba(255, 255, 255, 0.8);
    font-family: 'Courier New', monospace;
    line-height: 1.2;
  }

  .winner-diff {
    color: var(--christmas-green);
    font-size: clamp(0.875rem, 1.5vw, 1.125rem);
    font-weight: 600;
    text-shadow: 0 0 10px rgba(15, 134, 68, 0.6);
  }

  .celebration-sparkles {
    position: absolute;
    inset: -50px;
    pointer-events: none;
    overflow: visible;
  }

  .sparkle {
    position: absolute;
    top: 50%;
    left: 50%;
    width: clamp(8px, 1.5vw, 12px);
    height: clamp(8px, 1.5vw, 12px);
    background: var(--christmas-gold);
    border-radius: 50%;
    opacity: 0;
    animation: sparkleOut 2s ease-out infinite;
    animation-delay: var(--delay);
    transform: translate(-50%, -50%) rotate(var(--angle)) translateY(0);
    box-shadow: 
      0 0 clamp(10px, 2vw, 20px) var(--christmas-gold),
      0 0 clamp(20px, 4vw, 40px) rgba(255, 215, 0, 0.6),
      0 0 clamp(30px, 6vw, 60px) rgba(255, 215, 0, 0.3);
  }

  @keyframes sparkleOut {
    0% {
      opacity: 0;
      transform: translate(-50%, -50%) rotate(var(--angle)) translateY(0) translateX(0) scale(0);
    }
    15% {
      opacity: 1;
      transform: translate(-50%, -50%) rotate(var(--angle)) translateY(-30px) translateX(20px) scale(1.5);
    }
    50% {
      opacity: 1;
      transform: translate(-50%, -50%) rotate(var(--angle)) translateY(-80px) translateX(40px) scale(1);
    }
    100% {
      opacity: 0;
      transform: translate(-50%, -50%) rotate(var(--angle)) translateY(-150px) translateX(60px) scale(0.3);
    }
  }

  .all-submissions-section {
    width: 100%;
    max-width: min(65%, 900px);
    margin-top: clamp(1rem, 2vh, 1.5rem);
    padding: 0 clamp(1rem, 2vw, 2rem);
    box-sizing: border-box;
    animation: slideUp 0.6s ease-out;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .all-submissions-title {
    font-size: clamp(1.5rem, 3.5vw, 2.5rem);
    font-weight: bold;
    color: var(--christmas-gold);
    text-align: center;
    margin-bottom: clamp(1rem, 2vh, 1.5rem);
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  }

  .submissions-list {
    display: flex;
    flex-direction: column;
    gap: clamp(0.75rem, 1.5vh, 1rem);
    max-height: calc(100vh - 500px);
    overflow-y: auto;
    padding: clamp(0.75rem, 1.5vh, 1rem);
    background: rgba(0, 0, 0, 0.3);
    border-radius: clamp(0.75rem, 1.5vw, 1rem);
    border: 2px solid rgba(255, 215, 0, 0.3);
    box-sizing: border-box;
  }

  .submission-item {
    display: flex;
    align-items: center;
    gap: clamp(1rem, 2vw, 1.5rem);
    padding: clamp(0.75rem, 1.5vh, 1rem) clamp(1rem, 2vw, 1.5rem);
    background: rgba(255, 255, 255, 0.05);
    border: 2px solid rgba(255, 255, 255, 0.1);
    border-radius: clamp(0.5rem, 1vw, 0.75rem);
    transition: all 0.3s;
  }

  .submission-item:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 215, 0, 0.5);
    transform: translateX(5px);
  }

  .submission-item.top-three {
    background: rgba(255, 215, 0, 0.1);
    border-color: rgba(255, 215, 0, 0.4);
  }

  .submission-rank {
    font-size: clamp(1.125rem, 2.5vw, 1.5rem);
    font-weight: bold;
    color: var(--christmas-gold);
    min-width: clamp(50px, 6vw, 60px);
    text-align: center;
  }

  .submission-details {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: clamp(0.375rem, 0.8vh, 0.5rem);
  }

  .submission-name {
    font-size: clamp(0.875rem, 2vw, 1.125rem);
    font-weight: 600;
    color: white;
  }

  .submission-meta {
    display: flex;
    gap: clamp(1rem, 2vw, 1.5rem);
    font-family: 'Courier New', monospace;
  }

  .submission-guess {
    font-size: clamp(1rem, 2.25vw, 1.25rem);
    font-weight: bold;
    color: var(--christmas-gold);
  }

  .submission-diff {
    font-size: clamp(0.875rem, 1.75vw, 1rem);
    color: rgba(255, 255, 255, 0.7);
  }

  @media (max-width: 768px) {
    .reveal-content {
      padding: 3rem 1rem 1rem;
    }

    .challenge-title {
      font-size: 2rem;
    }

    .reveal-card {
      padding: 1.5rem;
      flex-direction: column;
      text-align: center;
    }

    .player-name {
      font-size: 1.5rem;
    }

    .winner-name {
      font-size: 1.75rem;
    }

    .guess-value {
      font-size: 2rem;
    }

    .winner-guess {
      font-size: 2.5rem;
    }

    .submissions-list {
      max-height: 50vh;
    }

    .submission-item {
      padding: 0.75rem 1rem;
    }
  }
</style>

