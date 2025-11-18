-- ============================================================================
-- ADD TRANSLATIONS COLUMN TO GAME CONTENT TABLES
-- ============================================================================
-- This migration adds a translations JSONB column to store multilingual content
-- Structure: {"en": {"question": "...", "answers": [...]}, "fr": {...}}
-- The existing question/answers fields remain as fallback for English

-- Add translations to trivia_questions
ALTER TABLE trivia_questions 
ADD COLUMN IF NOT EXISTS translations JSONB;

-- Add translations to price_items
ALTER TABLE price_items 
ADD COLUMN IF NOT EXISTS translations JSONB;

-- Add translations to naughty_prompts
ALTER TABLE naughty_prompts 
ADD COLUMN IF NOT EXISTS translations JSONB;

-- Create indexes for better query performance on translations
CREATE INDEX IF NOT EXISTS idx_trivia_translations ON trivia_questions USING GIN (translations);
CREATE INDEX IF NOT EXISTS idx_price_translations ON price_items USING GIN (translations);
CREATE INDEX IF NOT EXISTS idx_prompts_translations ON naughty_prompts USING GIN (translations);

-- ============================================================================
-- POPULATE EXISTING QUESTIONS WITH ENGLISH TRANSLATIONS
-- ============================================================================
-- Migrate existing question/answers fields into translations JSONB format
-- This ensures backward compatibility while enabling multilingual support

-- Populate trivia_questions translations from existing question/answers
UPDATE trivia_questions
SET translations = jsonb_build_object(
  'en', jsonb_build_object(
    'question', question,
    'answers', answers
  )
)
WHERE translations IS NULL;

-- Populate price_items translations from existing name/description
UPDATE price_items
SET translations = jsonb_build_object(
  'en', jsonb_build_object(
    'name', name,
    'description', COALESCE(description, '')
  )
)
WHERE translations IS NULL;

-- Populate naughty_prompts translations from existing prompt
UPDATE naughty_prompts
SET translations = jsonb_build_object(
  'en', jsonb_build_object(
    'prompt', prompt
  )
)
WHERE translations IS NULL;

