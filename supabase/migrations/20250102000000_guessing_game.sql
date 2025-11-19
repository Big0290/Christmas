-- ============================================================================
-- GUESSING CHALLENGES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS guessing_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code VARCHAR(8) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  image_url TEXT NOT NULL,
  correct_answer DECIMAL(10,2) NOT NULL,
  min_guess DECIMAL(10,2) NOT NULL,
  max_guess DECIMAL(10,2) NOT NULL,
  allow_multiple_guesses BOOLEAN DEFAULT false,
  reveal_at TIMESTAMP WITH TIME ZONE,
  is_revealed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (room_code) REFERENCES rooms(code) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_guessing_challenges_room_code ON guessing_challenges(room_code);
CREATE INDEX IF NOT EXISTS idx_guessing_challenges_reveal_at ON guessing_challenges(reveal_at);
CREATE INDEX IF NOT EXISTS idx_guessing_challenges_is_revealed ON guessing_challenges(is_revealed);

-- ============================================================================
-- GUESSING SUBMISSIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS guessing_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL,
  room_code VARCHAR(8) NOT NULL,
  guess_value DECIMAL(10,2) NOT NULL,
  client_fingerprint_hash VARCHAR(64) NOT NULL,
  difference DECIMAL(10,2) NOT NULL,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (challenge_id) REFERENCES guessing_challenges(id) ON DELETE CASCADE,
  FOREIGN KEY (room_code) REFERENCES rooms(code) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_guessing_submissions_challenge_id ON guessing_submissions(challenge_id);
CREATE INDEX IF NOT EXISTS idx_guessing_submissions_room_code ON guessing_submissions(room_code);
CREATE INDEX IF NOT EXISTS idx_guessing_submissions_difference ON guessing_submissions(difference);
CREATE INDEX IF NOT EXISTS idx_guessing_submissions_fingerprint ON guessing_submissions(challenge_id, client_fingerprint_hash);

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE guessing_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE guessing_submissions ENABLE ROW LEVEL SECURITY;

-- Guessing challenges: Public read (for submission pages), authenticated write (host only)
CREATE POLICY "Guessing challenges are viewable by everyone"
  ON guessing_challenges FOR SELECT
  USING (true);

CREATE POLICY "Guessing challenges are insertable by authenticated users"
  ON guessing_challenges FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Guessing challenges are updatable by authenticated users"
  ON guessing_challenges FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Guessing challenges are deletable by authenticated users"
  ON guessing_challenges FOR DELETE
  USING (auth.role() = 'authenticated');

-- Guessing submissions: Public insert (for submission page), authenticated read (host only)
CREATE POLICY "Guessing submissions are insertable by everyone"
  ON guessing_submissions FOR INSERT
  TO public, anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Guessing submissions are readable by authenticated users"
  ON guessing_submissions FOR SELECT
  USING (auth.role() = 'authenticated');

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_guessing_challenges_updated_at
  BEFORE UPDATE ON guessing_challenges
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- STORAGE BUCKETS
-- ============================================================================
-- Create storage bucket for guessing challenge images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'guessing-challenge-images',
  'guessing-challenge-images',
  true, -- Public read access
  5242880, -- 5MB file size limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Create storage bucket for Price Is Right item images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'price-item-images',
  'price-item-images',
  true, -- Public read access
  5242880, -- 5MB file size limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for guessing-challenge-images bucket
-- Public read access (anyone can view images)
CREATE POLICY "Public read access for guessing challenge images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'guessing-challenge-images');

-- Authenticated write access (only authenticated users can upload)
CREATE POLICY "Authenticated write access for guessing challenge images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'guessing-challenge-images' AND
    auth.role() = 'authenticated'
  );

-- Authenticated update access (only authenticated users can update)
CREATE POLICY "Authenticated update access for guessing challenge images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'guessing-challenge-images' AND
    auth.role() = 'authenticated'
  );

-- Authenticated delete access (only authenticated users can delete)
CREATE POLICY "Authenticated delete access for guessing challenge images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'guessing-challenge-images' AND
    auth.role() = 'authenticated'
  );

-- Storage policies for price-item-images bucket
-- Drop existing policies if they exist (in case of re-running migration)
DROP POLICY IF EXISTS "Public read access for price item images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated write access for price item images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update access for price item images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete access for price item images" ON storage.objects;

-- Public read access (anyone can view images)
CREATE POLICY "Public read access for price item images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'price-item-images');

-- Authenticated write access (only authenticated users can upload)
CREATE POLICY "Authenticated write access for price item images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'price-item-images' AND
    auth.role() = 'authenticated'
  );

-- Authenticated update access (only authenticated users can update)
CREATE POLICY "Authenticated update access for price item images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'price-item-images' AND
    auth.role() = 'authenticated'
  );

-- Authenticated delete access (only authenticated users can delete)
CREATE POLICY "Authenticated delete access for price item images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'price-item-images' AND
    auth.role() = 'authenticated'
  );

