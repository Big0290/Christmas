import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseAnonClient } from '$lib/supabase';
import type { GuessingChallengePublic } from '@christmas/core';

/**
 * Public API endpoint to get all challenges for a room (without correct_answer)
 */
export const GET: RequestHandler = async ({ params }) => {
  const roomCode = params.room?.toUpperCase();
  
  if (!roomCode) {
    return json({ success: false, error: 'Room code required' }, { status: 400 });
  }

  const supabase = createSupabaseAnonClient();
  if (!supabase) {
    return json({ success: false, error: 'Database not available' }, { status: 500 });
  }

  try {
    const { data: challenges, error } = await supabase
      .from('guessing_challenges')
      .select('id, room_code, title, description, image_url, min_guess, max_guess, allow_multiple_guesses, reveal_at, is_revealed, created_at, updated_at')
      .eq('room_code', roomCode)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Guessing API] Error fetching challenges:', error);
      return json({ success: false, error: error.message || 'Failed to fetch challenges' }, { status: 500 });
    }

    return json({ success: true, challenges: (challenges || []) as GuessingChallengePublic[] });
  } catch (error: any) {
    console.error('[Guessing API] Error:', error);
    return json({ success: false, error: error.message || 'Failed to fetch challenges' }, { status: 500 });
  }
};

