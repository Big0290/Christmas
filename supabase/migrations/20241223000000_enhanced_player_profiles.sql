-- ============================================================================
-- ENHANCED PLAYER PROFILES
-- ============================================================================
-- This migration adds profile customization, per-game statistics, 
-- achievements, and preferences to the player_profiles system.

-- ============================================================================
-- UPDATE PLAYER_PROFILES TABLE
-- ============================================================================

-- Add new columns to player_profiles
ALTER TABLE player_profiles 
  ADD COLUMN IF NOT EXISTS preferred_avatar VARCHAR(10),
  ADD COLUMN IF NOT EXISTS avatar_style VARCHAR(20) DEFAULT 'festive',
  ADD COLUMN IF NOT EXISTS display_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS theme_preference VARCHAR(50),
  ADD COLUMN IF NOT EXISTS favorite_game_type VARCHAR(50);

-- Create index for favorite_game_type
CREATE INDEX IF NOT EXISTS idx_player_profiles_favorite_game ON player_profiles(favorite_game_type);

-- ============================================================================
-- PLAYER GAME STATISTICS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS player_game_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_name VARCHAR(100) NOT NULL,
  game_type VARCHAR(50) NOT NULL,
  games_played INTEGER NOT NULL DEFAULT 0,
  total_score INTEGER NOT NULL DEFAULT 0,
  best_score INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  average_score DECIMAL(10, 2) NOT NULL DEFAULT 0,
  last_played_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (player_name) REFERENCES player_profiles(player_name) ON DELETE CASCADE,
  UNIQUE(player_name, game_type)
);

-- Indexes for player_game_stats
CREATE INDEX IF NOT EXISTS idx_player_game_stats_player ON player_game_stats(player_name);
CREATE INDEX IF NOT EXISTS idx_player_game_stats_game_type ON player_game_stats(game_type);
CREATE INDEX IF NOT EXISTS idx_player_game_stats_best_score ON player_game_stats(game_type, best_score DESC);

-- ============================================================================
-- PLAYER ACHIEVEMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS player_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_name VARCHAR(100) NOT NULL,
  achievement_id VARCHAR(50) NOT NULL,
  achievement_name VARCHAR(100) NOT NULL,
  unlocked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  progress JSONB DEFAULT '{}',
  FOREIGN KEY (player_name) REFERENCES player_profiles(player_name) ON DELETE CASCADE,
  UNIQUE(player_name, achievement_id)
);

-- Indexes for player_achievements
CREATE INDEX IF NOT EXISTS idx_player_achievements_player ON player_achievements(player_name);
CREATE INDEX IF NOT EXISTS idx_player_achievements_id ON player_achievements(achievement_id);
CREATE INDEX IF NOT EXISTS idx_player_achievements_unlocked ON player_achievements(unlocked_at DESC);

-- ============================================================================
-- PLAYER PREFERENCES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS player_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_name VARCHAR(100) NOT NULL UNIQUE,
  preferences JSONB DEFAULT '{}',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (player_name) REFERENCES player_profiles(player_name) ON DELETE CASCADE
);

-- Index for player_preferences
CREATE INDEX IF NOT EXISTS idx_player_preferences_player ON player_preferences(player_name);

-- ============================================================================
-- FUNCTIONS FOR GAME STATISTICS
-- ============================================================================

-- Function to update player game statistics
CREATE OR REPLACE FUNCTION update_player_game_stats()
RETURNS TRIGGER AS $$
DECLARE
  v_game_type VARCHAR(50);
  v_score INTEGER;
  v_is_winner BOOLEAN;
BEGIN
  -- Get game type and score from leaderboard entry
  v_game_type := NEW.game_type;
  v_score := NEW.score;
  
  -- Determine if player won (rank 1)
  v_is_winner := (NEW.rank = 1);
  
  -- Insert or update game statistics
  INSERT INTO player_game_stats (
    player_name,
    game_type,
    games_played,
    total_score,
    best_score,
    wins,
    average_score,
    last_played_at
  )
  VALUES (
    NEW.player_name,
    v_game_type,
    1,
    v_score,
    v_score,
    CASE WHEN v_is_winner THEN 1 ELSE 0 END,
    v_score::DECIMAL,
    NOW()
  )
  ON CONFLICT (player_name, game_type) DO UPDATE SET
    games_played = player_game_stats.games_played + 1,
    total_score = player_game_stats.total_score + v_score,
    best_score = GREATEST(player_game_stats.best_score, v_score),
    wins = player_game_stats.wins + CASE WHEN v_is_winner THEN 1 ELSE 0 END,
    average_score = (player_game_stats.total_score + v_score)::DECIMAL / (player_game_stats.games_played + 1),
    last_played_at = NOW(),
    updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update game statistics when leaderboard entry is created
DROP TRIGGER IF EXISTS trigger_update_player_game_stats ON leaderboards;
CREATE TRIGGER trigger_update_player_game_stats
  AFTER INSERT ON leaderboards
  FOR EACH ROW
  EXECUTE FUNCTION update_player_game_stats();

-- ============================================================================
-- FUNCTION TO UPDATE FAVORITE GAME TYPE
-- ============================================================================

-- Function to update favorite_game_type based on most played game
CREATE OR REPLACE FUNCTION update_favorite_game_type()
RETURNS TRIGGER AS $$
DECLARE
  v_favorite_game VARCHAR(50);
BEGIN
  -- Find the game type with most games played
  SELECT game_type INTO v_favorite_game
  FROM player_game_stats
  WHERE player_name = NEW.player_name
  ORDER BY games_played DESC, last_played_at DESC
  LIMIT 1;
  
  -- Update favorite_game_type if found
  IF v_favorite_game IS NOT NULL THEN
    UPDATE player_profiles
    SET favorite_game_type = v_favorite_game
    WHERE player_name = NEW.player_name;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update favorite game type when game stats are updated
DROP TRIGGER IF EXISTS trigger_update_favorite_game_type ON player_game_stats;
CREATE TRIGGER trigger_update_favorite_game_type
  AFTER INSERT OR UPDATE ON player_game_stats
  FOR EACH ROW
  EXECUTE FUNCTION update_favorite_game_type();

-- ============================================================================
-- ACHIEVEMENT DEFINITIONS (stored as comments/documentation)
-- ============================================================================
-- Achievement IDs:
-- - first_win: Win your first game
-- - score_1000: Reach 1000 total points
-- - score_5000: Reach 5000 total points
-- - score_10000: Reach 10000 total points
-- - game_master: Play all game types
-- - streak_3: Win 3 games in a row
-- - streak_5: Win 5 games in a row
-- - speed_demon: Answer questions quickly (handled in application)
-- - social_butterfly_10: Join 10 different rooms
-- - social_butterfly_50: Join 50 different rooms
-- - host_hero_5: Host 5 games
-- - host_hero_25: Host 25 games
-- - trivia_champion: Win 10 trivia games
-- - price_master: Win 10 price is right games
-- - emoji_expert: Win 10 emoji carol games
-- - naughty_nice_pro: Win 10 naughty or nice games

