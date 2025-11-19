-- ============================================================================
-- ADD PLAYER NAME TO GUESSING SUBMISSIONS
-- ============================================================================
-- Add player_name column to guessing_submissions table
ALTER TABLE guessing_submissions
ADD COLUMN IF NOT EXISTS player_name VARCHAR(100);

-- Create index on player_name for faster lookups
CREATE INDEX IF NOT EXISTS idx_guessing_submissions_player_name ON guessing_submissions(player_name);

