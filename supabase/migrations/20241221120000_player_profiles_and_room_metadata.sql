-- ============================================================================
-- PLAYER PROFILES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS player_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_name VARCHAR(100) NOT NULL UNIQUE,
  total_score INTEGER NOT NULL DEFAULT 0,
  games_played INTEGER NOT NULL DEFAULT 0,
  best_game_score INTEGER NOT NULL DEFAULT 0,
  first_played_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_played_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for sorting by score
CREATE INDEX IF NOT EXISTS idx_player_profiles_score ON player_profiles(total_score DESC);
CREATE INDEX IF NOT EXISTS idx_player_profiles_name ON player_profiles(player_name);
CREATE INDEX IF NOT EXISTS idx_player_profiles_last_played ON player_profiles(last_played_at DESC);

-- ============================================================================
-- UPDATE ROOMS TABLE
-- ============================================================================
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS room_name VARCHAR(255);
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS player_count INTEGER DEFAULT 0;

-- Index for public rooms
CREATE INDEX IF NOT EXISTS idx_rooms_is_public ON rooms(is_public) WHERE is_public = TRUE;
CREATE INDEX IF NOT EXISTS idx_rooms_player_count ON rooms(player_count DESC);

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Function to update player profile
CREATE OR REPLACE FUNCTION update_player_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO player_profiles (
    player_name,
    total_score,
    games_played,
    best_game_score,
    first_played_at,
    last_played_at
  )
  VALUES (
    NEW.player_name,
    NEW.score,
    1,
    NEW.score,
    NOW(),
    NOW()
  )
  ON CONFLICT (player_name) DO UPDATE SET
    total_score = player_profiles.total_score + NEW.score,
    games_played = player_profiles.games_played + 1,
    best_game_score = GREATEST(player_profiles.best_game_score, NEW.score),
    last_played_at = NOW(),
    updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update player profile when leaderboard entry is created
CREATE TRIGGER trigger_update_player_profile
  AFTER INSERT ON leaderboards
  FOR EACH ROW
  EXECUTE FUNCTION update_player_profile();

-- Function to update room player count
CREATE OR REPLACE FUNCTION update_room_player_count()
RETURNS TRIGGER AS $$
BEGIN
  -- This will be updated by application logic, but we can have a trigger as backup
  UPDATE rooms
  SET player_count = (
    SELECT COUNT(DISTINCT player_id)
    FROM leaderboards
    WHERE room_code = NEW.room_code
  )
  WHERE code = NEW.room_code;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SESSION SCORES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS session_scores (
  room_code VARCHAR(8) NOT NULL,
  player_name VARCHAR(100) NOT NULL,
  total_score INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (room_code, player_name),
  FOREIGN KEY (room_code) REFERENCES rooms(code) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_session_scores_room ON session_scores(room_code);
CREATE INDEX IF NOT EXISTS idx_session_scores_player ON session_scores(player_name);

