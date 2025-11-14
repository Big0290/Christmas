-- ============================================================================
-- GLOBAL LEADERBOARD TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS global_leaderboard (
  player_name VARCHAR(100) PRIMARY KEY,
  total_score INTEGER NOT NULL DEFAULT 0,
  games_played INTEGER NOT NULL DEFAULT 0,
  last_played_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  best_game_score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for sorting by score
CREATE INDEX IF NOT EXISTS idx_global_leaderboard_score ON global_leaderboard(total_score DESC);
CREATE INDEX IF NOT EXISTS idx_global_leaderboard_games ON global_leaderboard(games_played DESC);
CREATE INDEX IF NOT EXISTS idx_global_leaderboard_last_played ON global_leaderboard(last_played_at DESC);

-- Function to update global leaderboard
CREATE OR REPLACE FUNCTION update_global_leaderboard()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO global_leaderboard (player_name, total_score, games_played, last_played_at, best_game_score)
  VALUES (
    NEW.player_name,
    NEW.score,
    1,
    NOW(),
    NEW.score
  )
  ON CONFLICT (player_name) DO UPDATE SET
    total_score = global_leaderboard.total_score + NEW.score,
    games_played = global_leaderboard.games_played + 1,
    last_played_at = NOW(),
    best_game_score = GREATEST(global_leaderboard.best_game_score, NEW.score),
    updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update global leaderboard when leaderboard entry is created
CREATE TRIGGER trigger_update_global_leaderboard
  AFTER INSERT ON leaderboards
  FOR EACH ROW
  EXECUTE FUNCTION update_global_leaderboard();

