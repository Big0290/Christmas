-- ============================================================================
-- LINK PLAYER PROFILES TO AUTH USERS
-- ============================================================================
-- This migration adds user_id column to player_profiles to link them with
-- Supabase Auth users. This allows hosts to have authenticated accounts while
-- players can remain anonymous.

-- Add user_id column to player_profiles
ALTER TABLE player_profiles 
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create index for user_id lookups
CREATE INDEX IF NOT EXISTS idx_player_profiles_user_id ON player_profiles(user_id) WHERE user_id IS NOT NULL;

-- Function to link existing profile to user by player_name
CREATE OR REPLACE FUNCTION link_profile_to_user(
  p_player_name VARCHAR(100),
  p_user_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_profile_exists BOOLEAN;
BEGIN
  -- Check if profile exists
  SELECT EXISTS(SELECT 1 FROM player_profiles WHERE player_name = p_player_name) INTO v_profile_exists;
  
  IF NOT v_profile_exists THEN
    RETURN FALSE;
  END IF;
  
  -- Check if user_id is already linked to another profile
  IF EXISTS(SELECT 1 FROM player_profiles WHERE user_id = p_user_id AND player_name != p_player_name) THEN
    RETURN FALSE;
  END IF;
  
  -- Link profile to user
  UPDATE player_profiles
  SET user_id = p_user_id,
      updated_at = NOW()
  WHERE player_name = p_player_name
    AND (user_id IS NULL OR user_id = p_user_id);
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION link_profile_to_user(VARCHAR, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION link_profile_to_user(VARCHAR, UUID) TO service_role;

