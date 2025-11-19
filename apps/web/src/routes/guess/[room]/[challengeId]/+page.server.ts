import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createSupabaseAnonClient } from '$lib/supabase';
import { getClientFingerprint } from '$lib/utils/fingerprint';
import type { GuessingChallengePublic } from '@christmas/core';

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const load: PageServerLoad = async ({ params, fetch, url }) => {
  const roomCode = params.room?.toUpperCase();
  const challengeId = params.challengeId;

  // Validate room code (should be 4 uppercase letters)
  if (!roomCode || !/^[A-Z]{4}$/.test(roomCode)) {
    throw redirect(302, '/');
  }

  // Validate challenge ID (should be a UUID)
  if (!challengeId || !UUID_REGEX.test(challengeId)) {
    throw redirect(302, '/');
  }

  try {
    // Fetch challenge data from public API
    const apiUrl = `/api/guessing/${roomCode}/challenges/${challengeId}`;
    let response: Response;
    
    try {
      response = await fetch(apiUrl);
    } catch (fetchError: any) {
      console.error('[Guess Page] Fetch error:', fetchError);
      console.error('[Guess Page] Fetch error details:', {
        message: fetchError?.message,
        stack: fetchError?.stack,
        url: apiUrl,
      });
      throw redirect(302, '/');
    }
    
    if (!response.ok) {
      // If 404, challenge doesn't exist - redirect to home
      if (response.status === 404) {
        console.log('[Guess Page] Challenge not found (404)');
        throw redirect(302, '/');
      }
      
      // For 500 errors, try to get error details from response
      let errorDetails: any = null;
      try {
        errorDetails = await response.json();
      } catch (e) {
        // Ignore JSON parse errors
      }
      
      console.error('[Guess Page] API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorDetails,
        url: apiUrl,
      });
      throw redirect(302, '/');
    }
    
    let result: any;
    try {
      const responseText = await response.text();
      try {
        result = JSON.parse(responseText);
      } catch (parseError: any) {
        console.error('[Guess Page] JSON parse error:', parseError);
        console.error('[Guess Page] Response text:', responseText);
        throw redirect(302, '/');
      }
    } catch (readError: any) {
      console.error('[Guess Page] Error reading response:', readError);
      throw redirect(302, '/');
    }

    if (!result || !result.success || !result.challenge) {
      console.error('[Guess Page] Invalid API response:', {
        result,
        hasResult: !!result,
        hasSuccess: !!result?.success,
        hasChallenge: !!result?.challenge,
      });
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
    console.error('[Guess Page] Error stack:', error?.stack);
    throw redirect(302, '/');
  }
};

export const actions: Actions = {
  submitGuess: async ({ request, params, fetch, platform }) => {
    const roomCode = params.room?.toUpperCase();
    const challengeId = params.challengeId;

    if (!roomCode || !challengeId) {
      return fail(400, { error: 'Room code and challenge ID required' });
    }

    // Get env vars from platform (Fly.io) or process.env
    const env = (platform as any)?.env || process.env;
    const supabase = createSupabaseAnonClient(env);
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
        const { data: existingSubmission, error: checkError } = await supabase
          .from('guessing_submissions')
          .select('id')
          .eq('challenge_id', challengeId)
          .eq('client_fingerprint_hash', fingerprintHash)
          .maybeSingle();

        // If there's an error that's not "no rows found", log it
        if (checkError && checkError.code !== 'PGRST116') {
          console.error('[Guess Submission] Error checking for duplicates:', checkError);
        }

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

