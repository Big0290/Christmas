-- ============================================================================
-- FIX GUESSING SUBMISSIONS RLS POLICY
-- ============================================================================
-- Drop existing policy if it exists (in case of re-running migration)
DROP POLICY IF EXISTS "Guessing submissions are insertable by everyone" ON guessing_submissions;

-- Recreate the policy to ensure public/anonymous inserts work
-- Explicitly grant to anon role for public submissions
CREATE POLICY "Guessing submissions are insertable by everyone"
  ON guessing_submissions FOR INSERT
  TO public, anon, authenticated
  WITH CHECK (true);

-- Also ensure the table allows inserts from anon role
-- This might be redundant but ensures compatibility
ALTER TABLE guessing_submissions ENABLE ROW LEVEL SECURITY;

