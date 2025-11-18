-- ============================================================================
-- ADD HOST MANAGEMENT TO ROOMS TABLE
-- ============================================================================
-- This migration adds host_user_id, host_token, and last_accessed_at columns
-- to enable proper room persistence and host management features.

-- Add host_user_id column to link rooms to authenticated users
ALTER TABLE rooms 
  ADD COLUMN IF NOT EXISTS host_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add host_token column for secure token storage
ALTER TABLE rooms 
  ADD COLUMN IF NOT EXISTS host_token TEXT;

-- Add last_accessed_at timestamp for tracking room activity
ALTER TABLE rooms 
  ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_rooms_host_user_id ON rooms(host_user_id) WHERE host_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rooms_last_accessed ON rooms(last_accessed_at DESC);

-- Update existing rooms to set last_accessed_at to created_at if null
UPDATE rooms 
SET last_accessed_at = created_at 
WHERE last_accessed_at IS NULL;

-- ============================================================================
-- HOST TOKENS TABLE (Optional - for better security and token management)
-- ============================================================================
CREATE TABLE IF NOT EXISTS host_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code VARCHAR(8) NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
  host_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE,
  UNIQUE(room_code, host_user_id)
);

-- Indexes for host_tokens table
CREATE INDEX IF NOT EXISTS idx_host_tokens_room_code ON host_tokens(room_code);
CREATE INDEX IF NOT EXISTS idx_host_tokens_host_user_id ON host_tokens(host_user_id);
CREATE INDEX IF NOT EXISTS idx_host_tokens_active ON host_tokens(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- FUNCTION TO UPDATE LAST ACCESSED TIMESTAMP
-- ============================================================================
CREATE OR REPLACE FUNCTION update_room_last_accessed()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE rooms
  SET last_accessed_at = NOW()
  WHERE code = NEW.room_code;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update last_accessed_at when leaderboard entries are created
-- (indicates room activity)
DROP TRIGGER IF EXISTS trigger_update_room_last_accessed ON leaderboards;
CREATE TRIGGER trigger_update_room_last_accessed
  AFTER INSERT ON leaderboards
  FOR EACH ROW
  EXECUTE FUNCTION update_room_last_accessed();

