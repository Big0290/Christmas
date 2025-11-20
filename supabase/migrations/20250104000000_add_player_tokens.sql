-- ============================================================================
-- PLAYER TOKENS TABLE
-- ============================================================================
-- This migration adds a player_tokens table to persist player reconnection
-- tokens across server restarts.
CREATE TABLE IF NOT EXISTS player_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code VARCHAR(8) NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
  player_id VARCHAR(255) NOT NULL,
  player_name VARCHAR(100) NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_player_tokens_room_code ON player_tokens(room_code);
CREATE INDEX IF NOT EXISTS idx_player_tokens_token ON player_tokens(token) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_player_tokens_player_id ON player_tokens(player_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_player_tokens_active ON player_tokens(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_player_tokens_room_player ON player_tokens(room_code, player_id) WHERE is_active = TRUE;

-- Enable RLS (Row Level Security) - allow all operations for now
-- (can be restricted later if needed)
ALTER TABLE player_tokens ENABLE ROW LEVEL SECURITY;

-- Policy to allow all operations (adjust based on security requirements)
CREATE POLICY "Allow all operations on player_tokens" ON player_tokens
  FOR ALL
  USING (true)
  WITH CHECK (true);

