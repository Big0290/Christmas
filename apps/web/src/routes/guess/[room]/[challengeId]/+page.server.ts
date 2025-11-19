import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createSupabaseAnonClient } from '$lib/supabase';
import { getClientFingerprint } from '$lib/utils/fingerprint';
import type { GuessingChallengePublic } from '@christmas/core';

export const load: PageServerLoad = async ({ params, fetch, url }) => {
  const roomCode = params.room?.toUpperCase();
  const challengeId = params.challengeId;

  if (!roomCode || !challengeId) {
    throw redirect(302, '/');
  }

  try {
    // Fetch challenge data from public API
    const response = await fetch(`/api/guessing/${roomCode}/challenges/${challengeId}`);
    
    if (!response.ok) {
      console.error('[Guess Page] API error:', response.status, response.statusText);
      throw redirect(302, '/');
    }
    
    const result = await response.json();

    if (!result.success || !result.challenge) {
      throw redirect(302, '/');
    }

    return {
      challenge: result.challenge as GuessingChallengePublic,
      roomCode,
    };
  } catch (error: any) {
    // Don't redirect if it's already a redirect
    if (error?.status === 302) {
      throw error;
    }
    console.error('[Guess Page] Error loading challenge:', error);
    throw redirect(302, '/');
  }
};

export const actions: Actions = {
  submitGuess: async ({ request, params, fetch }) => {
    const roomCode = params.room?.toUpperCase();
    const challengeId = params.challengeId;

    if (!roomCode || !challengeId) {
      return fail(400, { error: 'Room code and challenge ID required' });
    }

    const supabase = createSupabaseAnonClient();
    if (!supabase) {
      return fail(500, { error: 'Database not available' });
    }

    try {
      const formData = await request.formData();
      const playerName = (formData.get('playerName') as string)?.trim() || '';
      const guessValue = parseFloat(formData.get('guess') as string);
      const fingerprintHash = formData.get('fingerprint') as string;

      if (!fingerprintHash) {
        return fail(400, { error: 'Fingerprint required' });
      }

      if (!playerName || playerName.length === 0) {
        return fail(400, { error: 'Player name required' });
      }

      if (playerName.length > 100) {
        return fail(400, { error: 'Player name must be 100 characters or less' });
      }

      if (isNaN(guessValue)) {
        return fail(400, { error: 'Invalid guess value' });
      }

      // Fetch challenge to validate bounds
      const { data: challenge, error: challengeError } = await supabase
        .from('guessing_challenges')
        .select('*')
        .eq('id', challengeId)
        .eq('room_code', roomCode)
        .single();

      if (challengeError || !challenge) {
        return fail(404, { error: 'Challenge not found' });
      }

      // Validate guess is within bounds
      if (guessValue < challenge.min_guess || guessValue > challenge.max_guess) {
        return fail(400, {
          error: `Guess must be between ${challenge.min_guess} and ${challenge.max_guess}`,
        });
      }

      // Check for duplicate submission (unless multiple guesses allowed)
      if (!challenge.allow_multiple_guesses) {
        const { data: existingSubmission } = await supabase
          .from('guessing_submissions')
          .select('id')
          .eq('challenge_id', challengeId)
          .eq('client_fingerprint_hash', fingerprintHash)
          .single();

        if (existingSubmission) {
          return fail(400, { error: 'You have already submitted a guess for this challenge' });
        }
      }

      // Calculate difference from correct answer
      const difference = Math.abs(guessValue - challenge.correct_answer);

      // Insert submission
      const { data: submission, error: insertError } = await supabase
        .from('guessing_submissions')
        .insert({
          challenge_id: challengeId,
          room_code: roomCode,
          player_name: playerName,
          guess_value: guessValue,
          client_fingerprint_hash: fingerprintHash,
          difference,
        })
        .select()
        .single();

      if (insertError) {
        console.error('[Guess Submission] Error inserting submission:', insertError);
        return fail(500, { error: insertError.message || 'Failed to submit guess' });
      }

      return { success: true, submission };
    } catch (error: any) {
      console.error('[Guess Submission] Error:', error);
      return fail(500, { error: error.message || 'Failed to submit guess' });
    }
  },
};

