<script lang="ts">
  import { GameType } from '@christmas/core';
  import { t } from '$lib/i18n';

  export let gameType: GameType;
  export let name: string;
  export let description: string;
  export let playerCount: number;
  export let isHost: boolean = false;
  export let selected: boolean = false;
  export let onSelect: (() => void) | null = null;
  export let onStart: (() => void) | null = null;

  const gameIcons: Record<GameType, string> = {
    [GameType.TRIVIA_ROYALE]: '🎄',
    [GameType.EMOJI_CAROL]: '🎶',
    [GameType.NAUGHTY_OR_NICE]: '😇',
    [GameType.PRICE_IS_RIGHT]: '💰',
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
  };

  const icon = gameIcons[gameType];
  const colors = gameColors[gameType];
</script>

<div
  class="game-tile frosted-glass {colors.bg} border-2 {selected ? colors.border + ' ring-4 ring-christmas-gold/50' : colors.border} {colors.hover} transition-all duration-300 cursor-pointer {selected ? 'scale-105 shadow-2xl' : 'hover:scale-102'} relative overflow-hidden"
  on:click={() => onSelect?.()}
  role="button"
  tabindex="0"
  on:keydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect?.();
    }
  }}
>
  <!-- Decorative sparkle effect -->
  <div class="absolute top-2 right-2 text-2xl opacity-50">✨</div>
  
  <div class="p-6 md:p-8 flex flex-col items-center text-center space-y-4">
    <!-- Game Icon -->
    <div class="text-7xl md:text-8xl mb-2 transform transition-transform duration-300 {selected ? 'scale-110 rotate-6' : ''}">
      {icon}
    </div>
    
    <!-- Game Name -->
    <h3 class="text-3xl md:text-4xl font-bold text-white mb-2">{name}</h3>
    
    <!-- Description -->
    <p class="text-lg md:text-xl text-white/80 mb-4">{description}</p>
    
    <!-- Player Count -->
    <div class="flex items-center gap-2 text-white/70 text-lg">
      <span>👥</span>
      <span>{playerCount} {playerCount === 1 ? t('gameTile.player') : t('gameTile.players')}</span>
    </div>
    
    <!-- Start Button (Host Only) -->
    {#if isHost && selected}
      <button
        on:click|stopPropagation={() => onStart?.()}
        class="btn-primary mt-4 text-xl px-8 py-4 w-full max-w-xs transform transition-transform hover:scale-105"
      >
        🚀 {t('gameTile.startGame')}
      </button>
    {/if}
  </div>
  
  <!-- Selected indicator -->
  {#if selected}
    <div class="absolute top-4 left-4 bg-christmas-gold text-black px-3 py-1 rounded-full text-sm font-bold">
      ✓ {t('gameTile.selected')}
    </div>
  {/if}
</div>

<style>
  .game-tile {
    min-height: 280px;
    border-radius: 1.5rem;
    backdrop-filter: blur(20px) saturate(180%);
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.3),
      0 0 20px rgba(255, 215, 0, 0.1),
      inset 0 1px 0 rgba(255, 255, 255, 0.2);
  }

  .game-tile:hover {
    box-shadow:
      0 12px 40px rgba(0, 0, 0, 0.4),
      0 0 30px rgba(255, 215, 0, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.3);
  }

  .game-tile:focus {
    outline: 2px solid #ffd700;
    outline-offset: 2px;
  }

  @media (max-width: 768px) {
    .game-tile {
      min-height: 240px;
    }
  }
</style>

