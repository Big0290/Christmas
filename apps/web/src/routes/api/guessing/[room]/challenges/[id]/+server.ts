import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseAnonClient } from '$lib/supabase';
import type { GuessingChallengePublic } from '@christmas/core';

/**
 * Public API endpoint to get a single challenge (without correct_answer)
 */
export const GET: RequestHandler = async ({ params }) => {
  const roomCode = params.room?.toUpperCase();
  const challengeId = params.id;
  
  if (!roomCode || !challengeId) {
    return json({ success: false, error: 'Room code and challenge ID required' }, { status: 400 });
  }

  const supabase = createSupabaseAnonClient();
  if (!supabase) {
    return json({ success: false, error: 'Database not available' }, { status: 500 });
  }

  try {
    const { data: challenge, error } = await supabase
      .from('guessing_challenges')
      .select('id, room_code, title, description, image_url, min_guess, max_guess, allow_multiple_guesses, reveal_at, is_revealed, created_at, updated_at')
      .eq('id', challengeId)
      .eq('room_code', roomCode)
      .single();

    if (error || !challenge) {
      console.error('[Guessing API] Error fetching challenge:', error);
      return json({ success: false, error: 'Challenge not found' }, { status: 404 });
    }

    return json({ success: true, challenge: challenge as GuessingChallengePublic });
  } catch (error: any) {
    console.error('[Guessing API] Error:', error);
    return json({ success: false, error: error.message || 'Failed to fetch challenge' }, { status: 500 });
  }
};

