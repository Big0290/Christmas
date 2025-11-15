-- ============================================================================
-- QUESTION SETS TABLE
-- ============================================================================
-- This table stores metadata for question sets, allowing hosts to name and organize their trivia questions
CREATE TABLE IF NOT EXISTS question_sets (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  host_id VARCHAR(255),
  description TEXT,
  question_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_question_sets_host ON question_sets(host_id);
CREATE INDEX IF NOT EXISTS idx_question_sets_name ON question_sets(name);

-- ============================================================================
-- FUNCTION TO UPDATE QUESTION COUNT
-- ============================================================================
CREATE OR REPLACE FUNCTION update_question_set_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE question_sets
    SET question_count = question_count + 1,
        updated_at = NOW()
    WHERE id = NEW.set_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE question_sets
    SET question_count = GREATEST(0, question_count - 1),
        updated_at = NOW()
    WHERE id = OLD.set_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update question count
DROP TRIGGER IF EXISTS trigger_update_question_set_count ON trivia_questions;
CREATE TRIGGER trigger_update_question_set_count
  AFTER INSERT OR DELETE ON trivia_questions
  FOR EACH ROW
  EXECUTE FUNCTION update_question_set_count();

