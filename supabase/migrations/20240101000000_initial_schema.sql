-- ============================================================================
-- ROOMS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(8) UNIQUE NOT NULL,
  host_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  current_game VARCHAR(50),
  settings JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  INDEX idx_rooms_code (code),
  INDEX idx_rooms_expires_at (expires_at)
);

-- ============================================================================
-- GAME SETTINGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS game_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code VARCHAR(8) NOT NULL,
  game_type VARCHAR(50) NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (room_code) REFERENCES rooms(code) ON DELETE CASCADE,
  UNIQUE(room_code, game_type)
);

-- ============================================================================
-- TRIVIA QUESTIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS trivia_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  answers JSONB NOT NULL,
  correct_index INTEGER NOT NULL,
  difficulty VARCHAR(20) DEFAULT 'medium',
  category VARCHAR(100),
  image_url TEXT,
  set_id VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  INDEX idx_trivia_difficulty (difficulty),
  INDEX idx_trivia_set_id (set_id)
);

-- ============================================================================
-- PRICE ITEMS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS price_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  image_url TEXT NOT NULL,
  category VARCHAR(100),
  set_id VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  INDEX idx_price_category (category),
  INDEX idx_price_set_id (set_id)
);

-- ============================================================================
-- EMOJI SETS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS emoji_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  emojis JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- NAUGHTY PROMPTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS naughty_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt TEXT NOT NULL,
  category VARCHAR(100),
  content_rating VARCHAR(20) DEFAULT 'pg',
  set_id VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  INDEX idx_prompts_rating (content_rating),
  INDEX idx_prompts_set_id (set_id)
);

-- ============================================================================
-- WORKSHOP UPGRADES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS workshop_upgrades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  base_cost INTEGER NOT NULL,
  production_boost DECIMAL(5, 2) NOT NULL,
  icon VARCHAR(50),
  tier INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- LEADERBOARDS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS leaderboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code VARCHAR(8) NOT NULL,
  player_id VARCHAR(255) NOT NULL,
  player_name VARCHAR(100) NOT NULL,
  game_type VARCHAR(50) NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  rank INTEGER,
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (room_code) REFERENCES rooms(code) ON DELETE CASCADE,
  INDEX idx_leaderboard_room (room_code),
  INDEX idx_leaderboard_game (game_type),
  INDEX idx_leaderboard_score (score DESC)
);

-- ============================================================================
-- SEED DEFAULT DATA
-- ============================================================================

-- Default Trivia Questions
INSERT INTO trivia_questions (question, answers, correct_index, difficulty, category) VALUES
('What color is Santa''s suit?', '["Red", "Blue", "Green", "Yellow"]', 0, 'easy', 'Christmas'),
('How many reindeer pull Santa''s sleigh (including Rudolph)?', '["8", "9", "10", "12"]', 1, 'easy', 'Christmas'),
('What do children typically leave out for Santa on Christmas Eve?', '["Cookies and milk", "Pizza", "Candy", "Fruit"]', 0, 'easy', 'Christmas'),
('In which country did the tradition of putting up a Christmas tree originate?', '["USA", "England", "Germany", "France"]', 2, 'medium', 'Christmas'),
('What is the name of the Grinch''s dog?', '["Max", "Buddy", "Charlie", "Rex"]', 0, 'medium', 'Movies'),
('Which Christmas carol includes the lyric "Sleep in heavenly peace"?', '["Silent Night", "Jingle Bells", "Deck the Halls", "Joy to the World"]', 0, 'medium', 'Carols'),
('How many gifts in total were given in "The Twelve Days of Christmas"?', '["78", "144", "364", "120"]', 2, 'hard', 'Carols'),
('What is the name of the famous Russian ballet about Christmas?', '["The Nutcracker", "Swan Lake", "Sleeping Beauty", "Cinderella"]', 0, 'easy', 'Culture'),
('In the movie Elf, what is the first rule of "The Code of Elves"?', '["Treat every day like Christmas", "Make toys", "Spread cheer", "Be nice"]', 0, 'medium', 'Movies'),
('Which country started the tradition of exchanging gifts?', '["Italy", "Germany", "USA", "Netherlands"]', 0, 'hard', 'History');

-- Default Price Items
INSERT INTO price_items (name, description, price, image_url, category) VALUES
('iPhone 15 Pro', 'Latest Apple smartphone', 999.00, 'https://picsum.photos/seed/iphone/400/300', 'Electronics'),
('PlayStation 5', 'Gaming console', 499.99, 'https://picsum.photos/seed/ps5/400/300', 'Electronics'),
('AirPods Pro', 'Wireless earbuds', 249.00, 'https://picsum.photos/seed/airpods/400/300', 'Electronics'),
('Christmas Sweater', 'Ugly holiday sweater', 39.99, 'https://picsum.photos/seed/sweater/400/300', 'Clothing'),
('Gingerbread House Kit', 'DIY holiday treat', 24.99, 'https://picsum.photos/seed/gingerbread/400/300', 'Food'),
('LEGO Star Wars Set', '1000+ pieces', 149.99, 'https://picsum.photos/seed/lego/400/300', 'Toys'),
('Instant Pot', 'Multi-use cooker', 89.99, 'https://picsum.photos/seed/instantpot/400/300', 'Kitchen'),
('Weighted Blanket', '15lb cozy blanket', 79.99, 'https://picsum.photos/seed/blanket/400/300', 'Home'),
('Ring Doorbell', 'Smart home security', 179.99, 'https://picsum.photos/seed/ring/400/300', 'Electronics'),
('Starbucks Coffee Maker', 'Programmable brewer', 129.99, 'https://picsum.photos/seed/coffee/400/300', 'Kitchen');

-- Default Emoji Sets
INSERT INTO emoji_sets (name, emojis, description) VALUES
('Christmas Classics', '["🎅", "🎄", "⛄", "🎁", "🔔", "⭐", "🕯️", "🦌", "🤶", "🧝", "🎿", "⛷️"]', 'Traditional Christmas emojis'),
('Winter Wonderland', '["❄️", "⛄", "🌨️", "🧊", "🏔️", "⛷️", "🎿", "🧤", "🧣", "🎩", "☃️", "🌬️"]', 'Winter themed emojis'),
('Holiday Food', '["🍪", "🥛", "🍭", "🍬", "🎂", "🧁", "🥧", "🍫", "🍷", "🥂", "🍾", "🎄"]', 'Festive food and drinks');

-- Default Naughty/Nice Prompts
INSERT INTO naughty_prompts (prompt, category, content_rating) VALUES
('Someone who talks during movies', 'Social', 'pg'),
('People who don''t return shopping carts', 'Social', 'pg'),
('Friends who spoil TV shows', 'Social', 'pg'),
('Someone who chews with their mouth open', 'Manners', 'pg'),
('People who don''t use turn signals', 'Driving', 'pg'),
('Someone who steals food from the office fridge', 'Work', 'pg'),
('People who leave the toilet seat up', 'Home', 'pg'),
('Someone who''s always late', 'Social', 'pg'),
('People who don''t silence their phone in movies', 'Social', 'pg'),
('Someone who regifts presents', 'Holidays', 'pg');

-- Default Workshop Upgrades
INSERT INTO workshop_upgrades (name, description, base_cost, production_boost, icon, tier) VALUES
('Elf Helper', 'Adds one elf to your workshop', 50, 1.2, '🧝', 1),
('Toy Machine', 'Automated toy production', 100, 1.5, '🏭', 1),
('Magic Dust', 'Speeds up all production', 150, 1.3, '✨', 2),
('Reindeer Power', 'Delivery speed boost', 200, 1.4, '🦌', 2),
('Santa''s Blessing', 'Maximum efficiency', 500, 2.0, '🎅', 3);

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_game_settings_updated_at
  BEFORE UPDATE ON game_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Cleanup expired rooms
CREATE OR REPLACE FUNCTION cleanup_expired_rooms()
RETURNS void AS $$
BEGIN
  UPDATE rooms SET is_active = FALSE
  WHERE expires_at < NOW() AND is_active = TRUE;
END;
$$ LANGUAGE plpgsql;
