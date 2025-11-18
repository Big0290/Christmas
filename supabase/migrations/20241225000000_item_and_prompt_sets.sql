-- ============================================================================
-- PRICE ITEM SETS TABLE
-- ============================================================================
-- This table stores metadata for price item sets, allowing hosts to name and organize their price items
CREATE TABLE IF NOT EXISTS price_item_sets (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  host_id VARCHAR(255),
  description TEXT,
  item_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_item_sets_host ON price_item_sets(host_id);
CREATE INDEX IF NOT EXISTS idx_price_item_sets_name ON price_item_sets(name);

-- ============================================================================
-- NAUGHTY PROMPT SETS TABLE
-- ============================================================================
-- This table stores metadata for prompt sets, allowing hosts to name and organize their naughty or nice prompts
CREATE TABLE IF NOT EXISTS naughty_prompt_sets (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  host_id VARCHAR(255),
  description TEXT,
  prompt_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_naughty_prompt_sets_host ON naughty_prompt_sets(host_id);
CREATE INDEX IF NOT EXISTS idx_naughty_prompt_sets_name ON naughty_prompt_sets(name);

-- ============================================================================
-- FUNCTION TO UPDATE ITEM COUNT
-- ============================================================================
CREATE OR REPLACE FUNCTION update_item_set_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE price_item_sets
    SET item_count = item_count + 1,
        updated_at = NOW()
    WHERE id = NEW.set_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE price_item_sets
    SET item_count = GREATEST(0, item_count - 1),
        updated_at = NOW()
    WHERE id = OLD.set_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update item count
DROP TRIGGER IF EXISTS trigger_update_item_set_count ON price_items;
CREATE TRIGGER trigger_update_item_set_count
  AFTER INSERT OR DELETE ON price_items
  FOR EACH ROW
  EXECUTE FUNCTION update_item_set_count();

-- ============================================================================
-- FUNCTION TO UPDATE PROMPT COUNT
-- ============================================================================
CREATE OR REPLACE FUNCTION update_prompt_set_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE naughty_prompt_sets
    SET prompt_count = prompt_count + 1,
        updated_at = NOW()
    WHERE id = NEW.set_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE naughty_prompt_sets
    SET prompt_count = GREATEST(0, prompt_count - 1),
        updated_at = NOW()
    WHERE id = OLD.set_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update prompt count
DROP TRIGGER IF EXISTS trigger_update_prompt_set_count ON naughty_prompts;
CREATE TRIGGER trigger_update_prompt_set_count
  AFTER INSERT OR DELETE ON naughty_prompts
  FOR EACH ROW
  EXECUTE FUNCTION update_prompt_set_count();

