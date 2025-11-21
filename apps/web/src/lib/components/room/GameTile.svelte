<script lang="ts">
  import { GameType } from '@christmas/core';
  import { t, language } from '$lib/i18n';

  export let gameType: GameType;
  export let name: string;
  export let description: string;
  export let playerCount: number;
  export let isHost: boolean = false;
  export let selected: boolean = false;
  export let onSelect: (() => void) | null = null;
  export let onStart: (() => void) | null = null;

  // Make translations reactive by subscribing to language changes
  // Include $language in each reactive statement so Svelte knows to re-run when language changes
  $: playerText = $language && (playerCount === 1 ? t('gameTile.player') : t('gameTile.players'));
  $: selectedText = $language && t('gameTile.selected');
  $: startGameText = $language && t('gameTile.startGame');

  const gameIcons: Record<GameType, string> = {
    [GameType.TRIVIA_ROYALE]: '🎄',
    [GameType.EMOJI_CAROL]: '🎶',
    [GameType.NAUGHTY_OR_NICE]: '😇',
    [GameType.PRICE_IS_RIGHT]: '💰',
    [GameType.BINGO]: '🎰',
  };

  const gameColors: Record<GameType, { bg: string; border: string; hover: string }> = {
    [GameType.TRIVIA_ROYALE]: {
      bg: 'bg-gradient-to-br from-red-600/30 to-red-800/30',
      border: 'border-red-400/50',
      hover: 'hover:border-red-400',
    },
    [GameType.EMOJI_CAROL]: {
      bg: 'bg-gradient-to-br from-blue-600/30 to-blue-800/30',
      border: 'border-blue-400/50',
      hover: 'hover:border-blue-400',
    },
    [GameType.NAUGHTY_OR_NICE]: {
      bg: 'bg-gradient-to-br from-purple-600/30 to-purple-800/30',
      border: 'border-purple-400/50',
      hover: 'hover:border-purple-400',
    },
    [GameType.PRICE_IS_RIGHT]: {
      bg: 'bg-gradient-to-br from-green-600/30 to-green-800/30',
      border: 'border-green-400/50',
      hover: 'hover:border-green-400',
    },
    [GameType.BINGO]: {
      bg: 'bg-gradient-to-br from-orange-600/30 to-amber-800/30',
      border: 'border-orange-400/50',
      hover: 'hover:border-orange-400',
    },
  };

  const icon = gameIcons[gameType] || '🎮';
  const colors = gameColors[gameType] || {
    bg: 'bg-gradient-to-br from-gray-600/30 to-gray-800/30',
    border: 'border-gray-400/50',
    hover: 'hover:border-gray-400',
  };

  function handleClick() {
    console.log('[GameTile] Clicked, gameType:', gameType, 'onSelect:', onSelect);
    if (onSelect) {
      onSelect();
    }
  }

  function handleStart(e: MouseEvent) {
    e.stopPropagation();
    console.log('[GameTile] Start button clicked, gameType:', gameType, 'onStart:', onStart);
    if (onStart) {
      onStart();
    }
  }
</script>

<div
  class="game-tile frosted-glass {colors.bg} border-2 {selected ? 'border-christmas-gold ring-2 ring-christmas-gold/50' : colors.border} {colors.hover} transition-all duration-300 cursor-pointer {selected ? 'shadow-xl scale-[1.02]' : 'hover:scale-[1.01] hover:shadow-lg'} relative overflow-hidden"
  on:click={handleClick}
  role="button"
  tabindex="0"
  on:keydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect?.();
    }
  }}
>
  <!-- Christmas decorative elements -->
  <div class="absolute top-1 right-1 text-lg opacity-60">✨</div>
  <div class="absolute bottom-1 left-1 text-xs opacity-40">🎄</div>
  
  <!-- Compact horizontal layout -->
  <div class="p-3 md:p-4 flex items-center gap-3 md:gap-4 h-full">
    <!-- Game Icon - Compact -->
    <div class="flex-shrink-0 text-4xl md:text-5xl transform transition-transform duration-300 {selected ? 'scale-110' : ''}">
      {icon}
    </div>
    
    <!-- Content Section -->
    <div class="flex-1 min-w-0">
      <!-- Game Name -->
      <h3 class="text-base md:text-lg font-bold text-white mb-1 truncate">{name}</h3>
      
      <!-- Description -->
      <p class="text-xs md:text-sm text-white/70 mb-2 line-clamp-2">{description}</p>
      
      <!-- Player Count & Status -->
      <div class="flex items-center gap-2 text-white/60 text-xs md:text-sm">
        <span>👥</span>
        <span>{playerCount} {playerText}</span>
        {#if selected}
          <span class="ml-auto bg-christmas-gold/20 text-christmas-gold px-2 py-0.5 rounded-full text-xs font-bold">
            ✓ {selectedText}
          </span>
        {/if}
      </div>
    </div>
    
    <!-- Start Button (Host Only) - Compact -->
    {#if isHost && selected}
      <button
        on:click={handleStart}
        class="flex-shrink-0 btn-primary text-sm px-4 py-2 transform transition-transform hover:scale-105 whitespace-nowrap"
      >
        🚀 {startGameText}
      </button>
    {/if}
  </div>
  
  <!-- Christmas border accent on selected -->
  {#if selected}
    <div class="absolute inset-0 border-2 border-christmas-gold/30 pointer-events-none"></div>
  {/if}
</div>

<style>
  .game-tile {
    height: clamp(100px, 12vh, 140px);
    min-height: clamp(100px, 12vh, 140px);
    max-height: clamp(100px, 12vh, 140px);
    border-radius: 1rem;
    backdrop-filter: blur(20px) saturate(180%);
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.3),
      0 0 15px rgba(255, 215, 0, 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.15);
    background: linear-gradient(135deg, rgba(0, 0, 0, 0.2) 0%, rgba(0, 0, 0, 0.1) 100%);
    position: relative;
  }

  .game-tile::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 1rem;
    padding: 1px;
    background: linear-gradient(135deg, 
      rgba(255, 215, 0, 0.1) 0%, 
      rgba(196, 30, 58, 0.1) 50%,
      rgba(255, 215, 0, 0.1) 100%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    opacity: 0.6;
    pointer-events: none;
  }

  .game-tile:hover {
    box-shadow:
      0 6px 20px rgba(0, 0, 0, 0.4),
      0 0 25px rgba(255, 215, 0, 0.15),
      inset 0 1px 0 rgba(255, 255, 255, 0.2);
  }

  .game-tile.selected {
    box-shadow:
      0 6px 24px rgba(0, 0, 0, 0.4),
      0 0 30px rgba(255, 215, 0, 0.25),
      inset 0 1px 0 rgba(255, 255, 255, 0.25);
  }

  .game-tile:focus {
    outline: 2px solid #ffd700;
    outline-offset: 2px;
  }

  /* Line clamp utility */
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>

