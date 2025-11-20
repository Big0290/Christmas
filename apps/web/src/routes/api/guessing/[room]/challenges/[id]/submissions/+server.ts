import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseAnonClient } from '$lib/supabase';
import type { GuessingSubmission } from '@christmas/core';

/**
 * Public API endpoint to get submissions for a revealed challenge
 * Only returns submissions if the challenge is revealed
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
      return json({ success: false, error: 'Database not available' }, { status: 500 });
    }

    // First, check if challenge exists and is revealed
    const { data: challenge, error: challengeError } = await supabase
      .from('guessing_challenges')
      .select('is_revealed')
      .eq('id', challengeId)
      .eq('room_code', roomCode)
      .maybeSingle();

    if (challengeError) {
      console.error('[Guessing Submissions API] Error fetching challenge:', challengeError);
      return json({ success: false, error: challengeError.message || 'Failed to fetch challenge' }, { status: 500 });
    }

    if (!challenge) {
      return json({ success: false, error: 'Challenge not found' }, { status: 404 });
    }

    // Only return submissions if challenge is revealed
    if (!challenge.is_revealed) {
      return json({ success: false, error: 'Challenge has not been revealed yet' }, { status: 403 });
    }

    // Get submissions sorted by difference (closest first)
    const { data: submissions, error: submissionsError } = await supabase
      .from('guessing_submissions')
      .select('id, challenge_id, room_code, player_name, guess_value, difference, submitted_at')
      .eq('challenge_id', challengeId)
      .eq('room_code', roomCode)
      .order('difference', { ascending: true })
      .order('submitted_at', { ascending: true });

    if (submissionsError) {
      console.error('[Guessing Submissions API] Error fetching submissions:', submissionsError);
      return json({ success: false, error: submissionsError.message || 'Failed to fetch submissions' }, { status: 500 });
    }

    return json({ 
      success: true, 
      submissions: (submissions || []) as GuessingSubmission[] 
    });
  } catch (error: any) {
    console.error('[Guessing Submissions API] Unexpected error:', error);
    return json({ success: false, error: error.message || 'Failed to fetch submissions' }, { status: 500 });
  }
};

