import { SupabaseClient } from '@supabase/supabase-js';
import { GameType } from '@christmas/core';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  checkFunction: (context: AchievementContext) => Promise<boolean>;
}

export interface AchievementContext {
  playerName: string;
  gameType: GameType;
  score: number;
  rank: number;
  totalScore: number;
  gamesPlayed: number;
  bestGameScore: number;
  gameStats?: Array<{
    gameType: string;
    gamesPlayed: number;
    wins: number;
  }>;
}

export class AchievementManager {
  private supabase: SupabaseClient | null = null;
  private achievements: Map<string, Achievement> = new Map();

  constructor() {
    this.registerAchievements();
  }

  setSupabaseClient(supabase: SupabaseClient | null) {
    this.supabase = supabase;
  }

  private registerAchievements() {
    // First Win
    this.achievements.set('first_win', {
      id: 'first_win',
      name: 'First Win',
      description: 'Win your first game',
      checkFunction: async (context) => context.rank === 1 && context.gamesPlayed === 1,
    });

    // Score Milestones
    this.achievements.set('score_1000', {
      id: 'score_1000',
      name: 'Rising Star',
      description: 'Reach 1000 total points',
      checkFunction: async (context) => context.totalScore >= 1000,
    });

    this.achievements.set('score_5000', {
      id: 'score_5000',
      name: 'Elite Player',
      description: 'Reach 5000 total points',
      checkFunction: async (context) => context.totalScore >= 5000,
    });

    this.achievements.set('score_10000', {
      id: 'score_10000',
      name: 'Master Player',
      description: 'Reach 10000 total points',
      checkFunction: async (context) => context.totalScore >= 10000,
    });

    // Game Master - Play all game types
    this.achievements.set('game_master', {
      id: 'game_master',
      name: 'Game Master',
      description: 'Play all game types',
      checkFunction: async (context) => {
        if (!context.gameStats) return false;
        const playedTypes = new Set(context.gameStats.map(s => s.gameType));
        const allTypes = [GameType.TRIVIA_ROYALE, GameType.EMOJI_CAROL, GameType.NAUGHTY_OR_NICE, GameType.PRICE_IS_RIGHT];
        return allTypes.every(type => playedTypes.has(type));
      },
    });

    // Streak achievements
    this.achievements.set('streak_3', {
      id: 'streak_3',
      name: 'On a Roll',
      description: 'Win 3 games in a row',
      checkFunction: async (context) => {
        // This would need to track win streaks - simplified for now
        return false; // TODO: Implement streak tracking
      },
    });

    // Social achievements
    this.achievements.set('social_butterfly_10', {
      id: 'social_butterfly_10',
      name: 'Social Butterfly',
      description: 'Join 10 different rooms',
      checkFunction: async (context) => {
        // This would need to track unique rooms joined
        return false; // TODO: Implement room tracking
      },
    });

    // Host achievements
    this.achievements.set('host_hero_5', {
      id: 'host_hero_5',
      name: 'Host Hero',
      description: 'Host 5 games',
      checkFunction: async (context) => {
        // This would need to track hosted games
        return false; // TODO: Implement host tracking
      },
    });

    // Game-specific achievements
    this.achievements.set('trivia_champion', {
      id: 'trivia_champion',
      name: 'Trivia Champion',
      description: 'Win 10 trivia games',
      checkFunction: async (context) => {
        if (!context.gameStats) return false;
        const triviaStats = context.gameStats.find(s => s.gameType === GameType.TRIVIA_ROYALE);
        return triviaStats ? triviaStats.wins >= 10 : false;
      },
    });

    this.achievements.set('price_master', {
      id: 'price_master',
      name: 'Price Master',
      description: 'Win 10 Price Is Right games',
      checkFunction: async (context) => {
        if (!context.gameStats) return false;
        const priceStats = context.gameStats.find(s => s.gameType === GameType.PRICE_IS_RIGHT);
        return priceStats ? priceStats.wins >= 10 : false;
      },
    });

    this.achievements.set('emoji_expert', {
      id: 'emoji_expert',
      name: 'Emoji Expert',
      description: 'Win 10 Emoji Carol games',
      checkFunction: async (context) => {
        if (!context.gameStats) return false;
        const emojiStats = context.gameStats.find(s => s.gameType === GameType.EMOJI_CAROL);
        return emojiStats ? emojiStats.wins >= 10 : false;
      },
    });

    this.achievements.set('naughty_nice_pro', {
      id: 'naughty_nice_pro',
      name: 'Naughty or Nice Pro',
      description: 'Win 10 Naughty or Nice games',
      checkFunction: async (context) => {
        if (!context.gameStats) return false;
        const nonStats = context.gameStats.find(s => s.gameType === GameType.NAUGHTY_OR_NICE);
        return nonStats ? nonStats.wins >= 10 : false;
      },
    });
  }

  async checkAndUnlockAchievements(
    playerName: string,
    gameType: GameType,
    score: number,
    rank: number,
    totalScore: number,
    gamesPlayed: number,
    bestGameScore: number
  ): Promise<string[]> {
    if (!this.supabase) return [];

    const unlockedAchievementIds: string[] = [];

    try {
      // Get player's game stats
      const { data: gameStatsData } = await this.supabase
        .from('player_game_stats')
        .select('game_type, games_played, wins')
        .eq('player_name', playerName);

      const gameStats = (gameStatsData || []).map((stat) => ({
        gameType: stat.game_type,
        gamesPlayed: stat.games_played,
        wins: stat.wins,
      }));

      // Get already unlocked achievements
      const { data: unlockedData } = await this.supabase
        .from('player_achievements')
        .select('achievement_id')
        .eq('player_name', playerName);

      const unlockedIds = new Set((unlockedData || []).map(a => a.achievement_id));

      // Check each achievement
      const context: AchievementContext = {
        playerName,
        gameType,
        score,
        rank,
        totalScore,
        gamesPlayed,
        bestGameScore,
        gameStats,
      };

      for (const [achievementId, achievement] of this.achievements.entries()) {
        // Skip if already unlocked
        if (unlockedIds.has(achievementId)) continue;

        // Check if achievement should be unlocked
        const shouldUnlock = await achievement.checkFunction(context);
        if (shouldUnlock) {
          // Unlock achievement
          await this.supabase.from('player_achievements').insert({
            player_name: playerName,
            achievement_id: achievementId,
            achievement_name: achievement.name,
            unlocked_at: new Date().toISOString(),
            progress: {},
          });

          unlockedAchievementIds.push(achievementId);
          console.log(`[Achievement] ${playerName} unlocked: ${achievement.name}`);
        }
      }
    } catch (error) {
      console.error('[Achievement] Error checking achievements:', error);
    }

    return unlockedAchievementIds;
  }

  getAchievement(achievementId: string): Achievement | undefined {
    return this.achievements.get(achievementId);
  }

  getAllAchievements(): Achievement[] {
    return Array.from(this.achievements.values());
  }
}

