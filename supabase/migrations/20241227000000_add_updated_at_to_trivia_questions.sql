-- ============================================================================
-- ADD updated_at COLUMN TO trivia_questions TABLE
-- ============================================================================
-- This migration adds the updated_at column to the trivia_questions table
-- to track when questions are modified

ALTER TABLE trivia_questions
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Update existing rows to have updated_at = created_at
UPDATE trivia_questions
SET updated_at = created_at
WHERE updated_at IS NULL;

-- Create a trigger to automatically update updated_at on row updates
CREATE OR REPLACE FUNCTION update_trivia_questions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_trivia_questions_updated_at ON trivia_questions;
CREATE TRIGGER trigger_update_trivia_questions_updated_at
  BEFORE UPDATE ON trivia_questions
  FOR EACH ROW
  EXECUTE FUNCTION update_trivia_questions_updated_at();

