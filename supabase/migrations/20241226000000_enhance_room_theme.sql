-- ============================================================================
-- ENHANCE ROOM THEME SETTINGS
-- ============================================================================
-- This migration ensures rooms.settings.theme has all the new theme properties
-- and sets default values for existing rooms

-- First, ensure settings is a valid JSONB object
UPDATE rooms
SET settings = CASE
  WHEN settings IS NULL THEN '{}'::jsonb
  WHEN jsonb_typeof(settings) != 'object' THEN '{}'::jsonb
  ELSE settings
END
WHERE settings IS NULL OR jsonb_typeof(settings) != 'object';

-- Update existing rooms to have default theme structure if missing
UPDATE rooms
SET settings = jsonb_set(
  settings,
  '{theme}',
  COALESCE(
    settings->'theme',
    jsonb_build_object(
      'snowEffect', true,
      'backgroundMusic', true,
      'soundEnabled', true,
      'sparkles', true,
      'icicles', false,
      'frostPattern', true,
      'colorScheme', 'mixed'
    )
  )
)
WHERE settings->'theme' IS NULL 
   OR jsonb_typeof(settings->'theme') != 'object';

-- Ensure theme is an object before setting nested properties
UPDATE rooms
SET settings = jsonb_set(
  settings,
  '{theme}',
  COALESCE(settings->'theme', '{}'::jsonb)
)
WHERE settings->'theme' IS NULL OR jsonb_typeof(settings->'theme') != 'object';

-- Ensure all theme properties exist with defaults
UPDATE rooms
SET settings = jsonb_set(
  settings,
  '{theme,sparkles}',
  COALESCE(settings->'theme'->'sparkles', to_jsonb(true))
)
WHERE settings->'theme'->'sparkles' IS NULL
  AND jsonb_typeof(settings->'theme') = 'object';

UPDATE rooms
SET settings = jsonb_set(
  settings,
  '{theme,icicles}',
  COALESCE(settings->'theme'->'icicles', to_jsonb(false))
)
WHERE settings->'theme'->'icicles' IS NULL
  AND jsonb_typeof(settings->'theme') = 'object';

UPDATE rooms
SET settings = jsonb_set(
  settings,
  '{theme,frostPattern}',
  COALESCE(settings->'theme'->'frostPattern', to_jsonb(true))
)
WHERE settings->'theme'->'frostPattern' IS NULL
  AND jsonb_typeof(settings->'theme') = 'object';

UPDATE rooms
SET settings = jsonb_set(
  settings,
  '{theme,colorScheme}',
  COALESCE(settings->'theme'->'colorScheme', '"mixed"'::jsonb)
)
WHERE settings->'theme'->'colorScheme' IS NULL
  AND jsonb_typeof(settings->'theme') = 'object';

-- Ensure backgroundMusic and soundEnabled are synced
-- If backgroundMusic exists but soundEnabled doesn't, copy it
UPDATE rooms
SET settings = jsonb_set(
  settings,
  '{theme,soundEnabled}',
  COALESCE(settings->'theme'->'soundEnabled', settings->'theme'->'backgroundMusic')
)
WHERE settings->'theme'->'backgroundMusic' IS NOT NULL 
  AND (settings->'theme'->'soundEnabled' IS NULL OR jsonb_typeof(settings->'theme'->'soundEnabled') = 'null')
  AND jsonb_typeof(settings->'theme') = 'object';

-- If soundEnabled exists but backgroundMusic doesn't, copy it
UPDATE rooms
SET settings = jsonb_set(
  settings,
  '{theme,backgroundMusic}',
  COALESCE(settings->'theme'->'backgroundMusic', settings->'theme'->'soundEnabled')
)
WHERE settings->'theme'->'soundEnabled' IS NOT NULL 
  AND (settings->'theme'->'backgroundMusic' IS NULL OR jsonb_typeof(settings->'theme'->'backgroundMusic') = 'null')
  AND jsonb_typeof(settings->'theme') = 'object';

