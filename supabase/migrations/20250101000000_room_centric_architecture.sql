-- ============================================================================
-- ROOM-CENTRIC ARCHITECTURE MIGRATION
-- ============================================================================
-- This migration refactors the system to support one room per host
-- and ensures all data (question sets, settings, stats) is room-scoped

-- ============================================================================
-- 1. HANDLE MULTIPLE ROOMS PER USER (MIGRATION CLEANUP)
-- ============================================================================
-- IMPORTANT: Do this BEFORE adding unique constraint to avoid conflicts
-- If a user has multiple rooms, keep the most recent active one
-- Mark others as inactive
WITH ranked_rooms AS (
  SELECT 
    code,
    host_user_id,
    ROW_NUMBER() OVER (
      PARTITION BY host_user_id 
      ORDER BY last_accessed_at DESC
    ) as rn
  FROM rooms
  WHERE host_user_id IS NOT NULL
    AND is_active = true
)
UPDATE rooms r
SET is_active = false
FROM ranked_rooms rr
WHERE r.code = rr.code
  AND rr.rn > 1
  AND r.host_user_id IS NOT NULL;

-- ============================================================================
-- 2. ADD UNIQUE CONSTRAINT: ONE ROOM PER HOST (ACTIVE ROOMS ONLY)
-- ============================================================================
-- Ensure each host_user_id can only have one active room
-- Use a partial unique index so inactive rooms can have duplicate host_user_ids
-- This allows us to keep history while enforcing uniqueness for active rooms

-- Drop constraint/index if it exists (in case of previous failed migration)
DO $$
BEGIN
  -- Drop constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'unique_host_user_id'
  ) THEN
    ALTER TABLE rooms DROP CONSTRAINT unique_host_user_id;
  END IF;
  
  -- Drop index if it exists
  IF EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'unique_host_user_id'
  ) THEN
    DROP INDEX IF EXISTS unique_host_user_id;
  END IF;
END $$;

-- Create a partial unique index that only applies to active rooms
-- This allows multiple inactive rooms with the same host_user_id
-- but only one active room per host_user_id
CREATE UNIQUE INDEX unique_host_user_id 
ON rooms (host_user_id) 
WHERE host_user_id IS NOT NULL 
  AND is_active = true;

-- Add regular index for faster lookups (includes all rooms)
CREATE INDEX IF NOT EXISTS idx_rooms_host_user_id ON rooms(host_user_id) 
WHERE host_user_id IS NOT NULL;

-- ============================================================================
-- 3. QUESTION SETS: ADD ROOM_CODE COLUMN
-- ============================================================================
-- Question sets should be room-scoped, not host-scoped
ALTER TABLE question_sets 
ADD COLUMN IF NOT EXISTS room_code VARCHAR(8);

-- Add foreign key constraint
ALTER TABLE question_sets
ADD CONSTRAINT fk_question_sets_room_code 
FOREIGN KEY (room_code) REFERENCES rooms(code) ON DELETE CASCADE;

-- Add index for faster room-based queries
CREATE INDEX IF NOT EXISTS idx_question_sets_room_code ON question_sets(room_code);

-- ============================================================================
-- 3B. PRICE ITEM SETS: ADD ROOM_CODE COLUMN
-- ============================================================================
ALTER TABLE price_item_sets 
ADD COLUMN IF NOT EXISTS room_code VARCHAR(8);

ALTER TABLE price_item_sets
ADD CONSTRAINT fk_price_item_sets_room_code 
FOREIGN KEY (room_code) REFERENCES rooms(code) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_price_item_sets_room_code ON price_item_sets(room_code);

-- ============================================================================
-- 3C. NAUGHTY PROMPT SETS: ADD ROOM_CODE COLUMN
-- ============================================================================
ALTER TABLE naughty_prompt_sets 
ADD COLUMN IF NOT EXISTS room_code VARCHAR(8);

ALTER TABLE naughty_prompt_sets
ADD CONSTRAINT fk_naughty_prompt_sets_room_code 
FOREIGN KEY (room_code) REFERENCES rooms(code) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_naughty_prompt_sets_room_code ON naughty_prompt_sets(room_code);

-- ============================================================================
-- 4. MIGRATE EXISTING SETS TO ROOM_CODE
-- ============================================================================
-- For each question_set with host_id, find their room and set room_code
-- Note: host_id is VARCHAR(255) but host_user_id is UUID, so we need to cast
UPDATE question_sets qs
SET room_code = (
  SELECT r.code 
  FROM rooms r 
  WHERE r.host_user_id::text = qs.host_id 
    AND r.is_active = true
  ORDER BY r.last_accessed_at DESC
  LIMIT 1
)
WHERE qs.host_id IS NOT NULL 
  AND qs.room_code IS NULL;

-- Migrate price_item_sets
UPDATE price_item_sets pis
SET room_code = (
  SELECT r.code 
  FROM rooms r 
  WHERE r.host_user_id::text = pis.host_id 
    AND r.is_active = true
  ORDER BY r.last_accessed_at DESC
  LIMIT 1
)
WHERE pis.host_id IS NOT NULL 
  AND pis.room_code IS NULL;

-- Migrate naughty_prompt_sets
UPDATE naughty_prompt_sets nps
SET room_code = (
  SELECT r.code 
  FROM rooms r 
  WHERE r.host_user_id::text = nps.host_id 
    AND r.is_active = true
  ORDER BY r.last_accessed_at DESC
  LIMIT 1
)
WHERE nps.host_id IS NOT NULL 
  AND nps.room_code IS NULL;

-- For sets that couldn't be matched (orphaned), set room_code to NULL
-- These will be treated as default/global sets
-- Or can be manually associated later

-- ============================================================================
-- 5. UPDATE TRIVIA_QUESTIONS TO USE ROOM_CODE FROM SET
-- ============================================================================
-- Ensure trivia_questions can be filtered by room_code through question_sets
-- This is already handled via set_id -> question_sets.id -> question_sets.room_code
-- No direct migration needed, but add index for performance
CREATE INDEX IF NOT EXISTS idx_trivia_questions_set_id ON trivia_questions(set_id);

-- ============================================================================
-- 6. REMOVE UNUSED COLUMNS AND INDEXES
-- ============================================================================
-- Remove is_public column (public rooms feature removed)
ALTER TABLE rooms 
DROP COLUMN IF EXISTS is_public;

-- Drop the index on is_public (no longer needed)
DROP INDEX IF EXISTS idx_rooms_is_public;

-- Keep host_id in question_sets temporarily for backward compatibility
-- Can be removed in a future migration after verifying all queries use room_code

-- ============================================================================
-- 7. UPDATE ROOM METADATA COLUMNS
-- ============================================================================
-- Ensure room_name and description are available for customization
-- These should already exist from previous migrations
-- Just verify they're present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'rooms' AND column_name = 'room_name'
  ) THEN
    ALTER TABLE rooms ADD COLUMN room_name VARCHAR(255);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'rooms' AND column_name = 'description'
  ) THEN
    ALTER TABLE rooms ADD COLUMN description TEXT;
  END IF;
END $$;

-- ============================================================================
-- 8. VERIFY CONSTRAINTS
-- ============================================================================
-- Ensure all foreign keys are in place
-- game_settings already has room_code foreign key ✓
-- question_sets now has room_code foreign key ✓
-- rooms has unique host_user_id partial index (active rooms only) ✓

COMMENT ON INDEX unique_host_user_id IS 
'Ensures each authenticated host can only have one active room at a time (partial unique index on active rooms only)';

COMMENT ON COLUMN question_sets.room_code IS 
'Associates question sets with a specific room. NULL indicates default/global sets';

