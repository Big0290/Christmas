import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseAnonClient } from '$lib/supabase';
import type { GuessingChallengePublic } from '@christmas/core';

/**
 * Public API endpoint to get a single challenge (without correct_answer)
 */
export const GET: RequestHandler = async ({ params, platform }) => {
  const roomCode = params.room?.toUpperCase();
  const challengeId = params.id;
  
  if (!roomCode || !challengeId) {
    return json({ success: false, error: 'Room code and challenge ID required' }, { status: 400 });
  }

  try {
    // Get env vars from platform (Fly.io) or process.env
    const env = (platform as any)?.env || process.env;
    const supabase = createSupabaseAnonClient(env);
    if (!supabase) {
      console.error('[Guessing API] Failed to create Supabase client', {
        hasPlatform: !!platform,
        hasPlatformEnv: !!(platform as any)?.env,
        hasProcessEnv: !!process.env,
        urlFromPlatform: (platform as any)?.env?.PUBLIC_SUPABASE_URL ? 'set' : 'missing',
        urlFromProcess: process.env.PUBLIC_SUPABASE_URL ? 'set' : 'missing',
      });
      return json({ success: false, error: 'Database not available' }, { status: 500 });
    }

    const { data: challenge, error } = await supabase
      .from('guessing_challenges')
      .select('id, room_code, title, description, image_url, min_guess, max_guess, allow_multiple_guesses, reveal_at, is_revealed, created_at, updated_at')
      .eq('id', challengeId)
      .eq('room_code', roomCode)
      .maybeSingle();

    if (error) {
      // Check if it's a "no rows found" error (PGRST116)
      if (error.code === 'PGRST116') {
        return json({ success: false, error: 'Challenge not found' }, { status: 404 });
      }
      console.error('[Guessing API] Error fetching challenge:', error);
      return json({ success: false, error: error.message || 'Failed to fetch challenge' }, { status: 500 });
    }

    if (!challenge) {
      return json({ success: false, error: 'Challenge not found' }, { status: 404 });
    }

    return json({ success: true, challenge: challenge as GuessingChallengePublic });
  } catch (error: any) {
    console.error('[Guessing API] Unexpected error:', error);
    console.error('[Guessing API] Error stack:', error?.stack);
    return json({ success: false, error: error.message || 'Failed to fetch challenge' }, { status: 500 });
  }
};

