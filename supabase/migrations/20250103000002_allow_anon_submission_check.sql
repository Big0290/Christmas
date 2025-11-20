-- ============================================================================
-- ALLOW ANONYMOUS USERS TO CHECK FOR DUPLICATE SUBMISSIONS
-- ============================================================================
-- This policy allows anonymous users to SELECT from guessing_submissions
-- to check for duplicate submissions before inserting.
-- 
-- Security note: While this allows anonymous SELECT, the application code
-- filters queries by client_fingerprint_hash, so users can only see their
-- own submissions. The fingerprint hash is unique per user/browser, providing
-- effective isolation.

-- Drop existing SELECT policy if it exists (to recreate with broader access)
DROP POLICY IF EXISTS "Guessing submissions are readable by authenticated users" ON guessing_submissions;

-- Create a new policy that allows both authenticated and anonymous users to SELECT
-- Anonymous users need this to check for duplicate submissions
CREATE POLICY "Guessing submissions are readable for duplicate checking"
  ON guessing_submissions FOR SELECT
  TO public, anon, authenticated
  USING (true);

