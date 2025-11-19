import { Socket } from 'socket.io';
import { SupabaseClient } from '@supabase/supabase-js';
import type { RoomManager } from '../managers/room-manager.js';
import type { GuessingChallenge, GuessingSubmission, GuessingChallengeForm } from '@christmas/core';

/**
 * Check if socket is host of the room
 */
function isHost(socket: Socket, roomManager: RoomManager): boolean {
  const roomInfo = roomManager.getRoomBySocketId(socket.id);
  return roomInfo?.isHost === true;
}

/**
 * Hash a string using SHA-256
 */
async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Setup guessing game socket event handlers
 */
export function setupGuessingHandlers(
  socket: Socket,
  roomManager: RoomManager,
  supabase: SupabaseClient | null
) {
  // ========================================================================
  // CREATE GUESSING CHALLENGE
  // ========================================================================
  socket.on(
    'create_guessing_challenge',
    async (roomCode: string, challengeData: GuessingChallengeForm, callback: (response: any) => void) => {
      try {
        // Verify host permissions
        if (!isHost(socket, roomManager)) {
          callback({ success: false, error: 'You must be a host' });
          return;
        }

        // Verify room ownership
        const room = roomManager.getRoom(roomCode.toUpperCase());
        if (!room) {
          callback({ success: false, error: 'Room not found' });
          return;
        }

        const roomInfo = roomManager.getRoomBySocketId(socket.id);
        if (!roomInfo || roomInfo.room.hostId !== socket.id) {
          callback({ success: false, error: 'You must be the host of this room' });
          return;
        }

        if (!supabase) {
          callback({ success: false, error: 'Database not available' });
          return;
        }

        // Normalize room code
        const normalizedCode = roomCode.toUpperCase();

        // Verify room exists in database (for foreign key constraint)
        // If room exists in memory but not in database, ensure it's saved
        let { data: roomData, error: roomError } = await supabase
          .from('rooms')
          .select('code, is_active')
          .eq('code', normalizedCode)
          .single();

        // If room exists but is inactive, reactivate it
        let roomReactivated = false;
        if (roomData && !roomData.is_active) {
          console.warn('[Guessing Game] Room exists but is inactive, reactivating:', normalizedCode);
          const { error: updateError } = await supabase
            .from('rooms')
            .update({ is_active: true, last_accessed_at: new Date().toISOString() })
            .eq('code', normalizedCode);
          
          if (updateError) {
            console.error('[Guessing Game] Failed to reactivate room:', updateError);
          } else {
            roomData.is_active = true;
            roomError = null;
            roomReactivated = true;
          }
        }

        // Check if room exists and is active (skip if we just reactivated it)
        if (!roomReactivated && (roomError || !roomData || (roomData && !roomData.is_active))) {
          // Room exists in memory but not in database - try to save it
          console.warn('[Guessing Game] Room exists in memory but not in database, attempting to save:', normalizedCode);
          
          // Get room info to save it
          const roomInfo = roomManager.getRoomBySocketId(socket.id);
          if (roomInfo && roomInfo.room.code === normalizedCode) {
            const room = roomInfo.room;
            const hostToken = roomManager.getHostToken(normalizedCode);
            
            // Try to get userId from database first (in case room was created by another instance)
            let hostUserId = (room as any).hostUserId;
            if (!hostUserId) {
              const { data: existingRoom } = await supabase
                .from('rooms')
                .select('host_user_id')
                .eq('code', normalizedCode)
                .single();
              
              if (existingRoom?.host_user_id) {
                hostUserId = existingRoom.host_user_id;
              }
            }
            
            // Try to insert the room (or update if it exists)
            const { data: insertedData, error: insertError } = await supabase
              .from('rooms')
              .upsert({
                code: normalizedCode,
                host_id: room.hostId,
                host_user_id: hostUserId || null,
                host_token: hostToken || null,
                expires_at: new Date(room.expiresAt).toISOString(),
                last_accessed_at: new Date(room.createdAt).toISOString(),
                room_name: null,
                description: null,
                player_count: room.players.size,
                is_active: true,
              }, {
                onConflict: 'code'
              })
              .select('code, is_active')
              .single();

            if (insertError) {
              console.error('[Guessing Game] Failed to save room to database:', insertError);
              callback({ success: false, error: 'Room not found in database. Please refresh the page.' });
              return;
            } else {
              roomData = insertedData;
              roomError = null;
              console.log('[Guessing Game] Successfully saved room to database:', normalizedCode);
            }
          } else {
            console.error('[Guessing Game] Room not found in memory or database:', normalizedCode);
            callback({ success: false, error: 'Room not found. Please refresh the page.' });
            return;
          }
        }

        // Validate challenge data
        if (!challengeData.title || !challengeData.image_url) {
          callback({ success: false, error: 'Title and image are required' });
          return;
        }

        if (challengeData.min_guess >= challengeData.max_guess) {
          callback({ success: false, error: 'Min guess must be less than max guess' });
          return;
        }

        if (
          challengeData.correct_answer < challengeData.min_guess ||
          challengeData.correct_answer > challengeData.max_guess
        ) {
          callback({ success: false, error: 'Correct answer must be within min and max bounds' });
          return;
        }

        // Check challenge limit (max 10 per room)
        const { count } = await supabase
          .from('guessing_challenges')
          .select('*', { count: 'exact', head: true })
          .eq('room_code', normalizedCode);

        if ((count || 0) >= 10) {
          callback({ success: false, error: 'Maximum of 10 challenges per room' });
          return;
        }

        // Insert challenge
        const { data, error } = await supabase
          .from('guessing_challenges')
          .insert({
            room_code: normalizedCode,
            title: challengeData.title,
            description: challengeData.description || null,
            image_url: challengeData.image_url,
            correct_answer: challengeData.correct_answer,
            min_guess: challengeData.min_guess,
            max_guess: challengeData.max_guess,
            allow_multiple_guesses: challengeData.allow_multiple_guesses || false,
            reveal_at: challengeData.reveal_at || null,
            is_revealed: false,
          })
          .select()
          .single();

        if (error) {
          console.error('[Guessing Game] Error creating challenge:', error);
          callback({ success: false, error: error.message || 'Failed to create challenge' });
          return;
        }

        console.log(`[Guessing Game] Created challenge ${data.id} in room ${normalizedCode}`);
        callback({ success: true, challenge: data });
      } catch (error: any) {
        console.error('[Guessing Game] Error creating challenge:', error);
        callback({ success: false, error: error.message || 'Failed to create challenge' });
      }
    }
  );

  // ========================================================================
  // UPDATE GUESSING CHALLENGE
  // ========================================================================
  socket.on(
    'update_guessing_challenge',
    async (
      challengeId: string,
      roomCode: string,
      challengeData: Partial<GuessingChallengeForm>,
      callback: (response: any) => void
    ) => {
      try {
        // Verify host permissions
        if (!isHost(socket, roomManager)) {
          callback({ success: false, error: 'You must be a host' });
          return;
        }

        // Verify room ownership
        const room = roomManager.getRoom(roomCode.toUpperCase());
        if (!room) {
          callback({ success: false, error: 'Room not found' });
          return;
        }

        const roomInfo = roomManager.getRoomBySocketId(socket.id);
        if (!roomInfo || roomInfo.room.hostId !== socket.id) {
          callback({ success: false, error: 'You must be the host of this room' });
          return;
        }

        if (!supabase) {
          callback({ success: false, error: 'Database not available' });
          return;
        }

        // Get existing challenge to verify ownership
        const { data: existingChallenge, error: fetchError } = await supabase
          .from('guessing_challenges')
          .select('*')
          .eq('id', challengeId)
          .eq('room_code', roomCode.toUpperCase())
          .single();

        if (fetchError || !existingChallenge) {
          callback({ success: false, error: 'Challenge not found' });
          return;
        }

        // Validate bounds if updating
        if (
          challengeData.min_guess !== undefined &&
          challengeData.max_guess !== undefined &&
          challengeData.min_guess >= challengeData.max_guess
        ) {
          callback({ success: false, error: 'Min guess must be less than max guess' });
          return;
        }

        const minGuess = challengeData.min_guess ?? existingChallenge.min_guess;
        const maxGuess = challengeData.max_guess ?? existingChallenge.max_guess;
        const correctAnswer = challengeData.correct_answer ?? existingChallenge.correct_answer;

        if (correctAnswer < minGuess || correctAnswer > maxGuess) {
          callback({ success: false, error: 'Correct answer must be within min and max bounds' });
          return;
        }

        // Update challenge
        const { data, error } = await supabase
          .from('guessing_challenges')
          .update({
            title: challengeData.title,
            description: challengeData.description,
            image_url: challengeData.image_url,
            correct_answer: challengeData.correct_answer,
            min_guess: challengeData.min_guess,
            max_guess: challengeData.max_guess,
            allow_multiple_guesses: challengeData.allow_multiple_guesses,
            reveal_at: challengeData.reveal_at,
            updated_at: new Date().toISOString(),
          })
          .eq('id', challengeId)
          .eq('room_code', roomCode.toUpperCase())
          .select()
          .single();

        if (error) {
          console.error('[Guessing Game] Error updating challenge:', error);
          callback({ success: false, error: error.message || 'Failed to update challenge' });
          return;
        }

        console.log(`[Guessing Game] Updated challenge ${challengeId} in room ${roomCode}`);
        callback({ success: true, challenge: data });
      } catch (error: any) {
        console.error('[Guessing Game] Error updating challenge:', error);
        callback({ success: false, error: error.message || 'Failed to update challenge' });
      }
    }
  );

  // ========================================================================
  // DELETE GUESSING CHALLENGE
  // ========================================================================
  socket.on(
    'delete_guessing_challenge',
    async (challengeId: string, roomCode: string, callback: (response: any) => void) => {
      try {
        // Verify host permissions
        if (!isHost(socket, roomManager)) {
          callback({ success: false, error: 'You must be a host' });
          return;
        }

        // Verify room ownership
        const room = roomManager.getRoom(roomCode.toUpperCase());
        if (!room) {
          callback({ success: false, error: 'Room not found' });
          return;
        }

        const roomInfo = roomManager.getRoomBySocketId(socket.id);
        if (!roomInfo || roomInfo.room.hostId !== socket.id) {
          callback({ success: false, error: 'You must be the host of this room' });
          return;
        }

        if (!supabase) {
          callback({ success: false, error: 'Database not available' });
          return;
        }

        // Delete challenge (cascade will delete submissions)
        const { error } = await supabase
          .from('guessing_challenges')
          .delete()
          .eq('id', challengeId)
          .eq('room_code', roomCode.toUpperCase());

        if (error) {
          console.error('[Guessing Game] Error deleting challenge:', error);
          callback({ success: false, error: error.message || 'Failed to delete challenge' });
          return;
        }

        console.log(`[Guessing Game] Deleted challenge ${challengeId} from room ${roomCode}`);
        callback({ success: true });
      } catch (error: any) {
        console.error('[Guessing Game] Error deleting challenge:', error);
        callback({ success: false, error: error.message || 'Failed to delete challenge' });
      }
    }
  );

  // ========================================================================
  // GET GUESSING CHALLENGES
  // ========================================================================
  socket.on(
    'get_guessing_challenges',
    async (roomCode: string, callback: (response: any) => void) => {
      try {
        if (!supabase) {
          callback({ success: false, error: 'Database not available' });
          return;
        }

        const { data, error } = await supabase
          .from('guessing_challenges')
          .select('*')
          .eq('room_code', roomCode.toUpperCase())
          .order('created_at', { ascending: false });

        if (error) {
          console.error('[Guessing Game] Error fetching challenges:', error);
          callback({ success: false, error: error.message || 'Failed to fetch challenges' });
          return;
        }

        callback({ success: true, challenges: data || [] });
      } catch (error: any) {
        console.error('[Guessing Game] Error fetching challenges:', error);
        callback({ success: false, error: error.message || 'Failed to fetch challenges' });
      }
    }
  );

  // ========================================================================
  // GET GUESSING SUBMISSIONS
  // ========================================================================
  socket.on(
    'get_guessing_submissions',
    async (challengeId: string, roomCode: string, callback: (response: any) => void) => {
      try {
        // Verify host permissions
        if (!isHost(socket, roomManager)) {
          callback({ success: false, error: 'You must be a host' });
          return;
        }

        if (!supabase) {
          callback({ success: false, error: 'Database not available' });
          return;
        }

        // Get submissions sorted by difference (closest first)
        const { data, error } = await supabase
          .from('guessing_submissions')
          .select('*')
          .eq('challenge_id', challengeId)
          .eq('room_code', roomCode.toUpperCase())
          .order('difference', { ascending: true })
          .order('submitted_at', { ascending: true });

        if (error) {
          console.error('[Guessing Game] Error fetching submissions:', error);
          callback({ success: false, error: error.message || 'Failed to fetch submissions' });
          return;
        }

        callback({ success: true, submissions: data || [] });
      } catch (error: any) {
        console.error('[Guessing Game] Error fetching submissions:', error);
        callback({ success: false, error: error.message || 'Failed to fetch submissions' });
      }
    }
  );

  // ========================================================================
  // REVEAL GUESSING CHALLENGE
  // ========================================================================
  socket.on(
    'reveal_guessing_challenge',
    async (challengeId: string, roomCode: string, callback: (response: any) => void) => {
      try {
        // Verify host permissions
        if (!isHost(socket, roomManager)) {
          callback({ success: false, error: 'You must be a host' });
          return;
        }

        // Verify room ownership
        const room = roomManager.getRoom(roomCode.toUpperCase());
        if (!room) {
          callback({ success: false, error: 'Room not found' });
          return;
        }

        const roomInfo = roomManager.getRoomBySocketId(socket.id);
        if (!roomInfo || roomInfo.room.hostId !== socket.id) {
          callback({ success: false, error: 'You must be the host of this room' });
          return;
        }

        if (!supabase) {
          callback({ success: false, error: 'Database not available' });
          return;
        }

        // Update is_revealed flag
        const { data, error } = await supabase
          .from('guessing_challenges')
          .update({ is_revealed: true })
          .eq('id', challengeId)
          .eq('room_code', roomCode.toUpperCase())
          .select()
          .single();

        if (error) {
          console.error('[Guessing Game] Error revealing challenge:', error);
          callback({ success: false, error: error.message || 'Failed to reveal challenge' });
          return;
        }

        console.log(`[Guessing Game] Revealed challenge ${challengeId} in room ${roomCode}`);
        callback({ success: true, challenge: data });
      } catch (error: any) {
        console.error('[Guessing Game] Error revealing challenge:', error);
        callback({ success: false, error: error.message || 'Failed to reveal challenge' });
      }
    }
  );

  // ========================================================================
  // UPLOAD GUESSING IMAGE
  // ========================================================================
  socket.on(
    'upload_guessing_image',
    async (fileData: { name: string; type: string; data: string }, callback: (response: any) => void) => {
      try {
        // Verify host permissions
        if (!isHost(socket, roomManager)) {
          callback({ success: false, error: 'You must be a host' });
          return;
        }

        if (!supabase) {
          callback({ success: false, error: 'Database not available' });
          return;
        }

        const roomInfo = roomManager.getRoomBySocketId(socket.id);
        if (!roomInfo) {
          callback({ success: false, error: 'Room not found' });
          return;
        }

        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(fileData.type)) {
          callback({
            success: false,
            error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.',
          });
          return;
        }

        // Validate file size (max 5MB)
        const fileSize = Buffer.from(fileData.data, 'base64').length;
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (fileSize > maxSize) {
          callback({ success: false, error: 'File size exceeds 5MB limit' });
          return;
        }

        // Generate unique filename
        const fileExt = fileData.name.split('.').pop() || 'jpg';
        const fileName = `guessing/${roomInfo.room.hostId}/${Date.now()}_${Math.random().toString(36).substring(2, 11)}.${fileExt}`;

        // Convert base64 to buffer
        const fileBuffer = Buffer.from(fileData.data, 'base64');

        // Upload to Supabase storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('guessing-challenge-images')
          .upload(fileName, fileBuffer, {
            contentType: fileData.type,
            upsert: false,
          });

        if (uploadError) {
          console.error('[Guessing Game] Storage error:', uploadError);
          callback({ success: false, error: uploadError.message || 'Failed to upload image' });
          return;
        }

        // Get public URL
        const { data: urlData } = supabase.storage.from('guessing-challenge-images').getPublicUrl(fileName);

        if (!urlData?.publicUrl) {
          callback({ success: false, error: 'Failed to get image URL' });
          return;
        }

        callback({
          success: true,
          imageUrl: urlData.publicUrl,
        });

        console.log(`[Guessing Game] Uploaded image: ${fileName}`);
      } catch (error: any) {
        console.error('[Guessing Game] Error uploading image:', error);
        callback({ success: false, error: error.message || 'Failed to upload image' });
      }
    }
  );

  // ========================================================================
  // CHECK AUTO-REVEAL
  // ========================================================================
  // This can be called periodically or as part of a scheduled job
  socket.on('check_auto_reveal', async (roomCode: string, callback: (response: any) => void) => {
    try {
      if (!supabase) {
        callback({ success: false, error: 'Database not available' });
        return;
      }

      // Find challenges that should be auto-revealed
      const now = new Date().toISOString();
      const { data: challengesToReveal, error } = await supabase
        .from('guessing_challenges')
        .select('*')
        .eq('room_code', roomCode.toUpperCase())
        .eq('is_revealed', false)
        .not('reveal_at', 'is', null)
        .lte('reveal_at', now);

      if (error) {
        console.error('[Guessing Game] Error checking auto-reveal:', error);
        callback({ success: false, error: error.message || 'Failed to check auto-reveal' });
        return;
      }

      if (!challengesToReveal || challengesToReveal.length === 0) {
        callback({ success: true, revealed: [] });
        return;
      }

      // Auto-reveal challenges
      const revealedIds = challengesToReveal.map((c) => c.id);
      const { data: revealedChallenges, error: updateError } = await supabase
        .from('guessing_challenges')
        .update({ is_revealed: true })
        .in('id', revealedIds)
        .eq('room_code', roomCode.toUpperCase())
        .select();

      if (updateError) {
        console.error('[Guessing Game] Error auto-revealing challenges:', updateError);
        callback({ success: false, error: updateError.message || 'Failed to auto-reveal' });
        return;
      }

      console.log(`[Guessing Game] Auto-revealed ${revealedChallenges?.length || 0} challenges in room ${roomCode}`);
      callback({ success: true, revealed: revealedChallenges || [] });
    } catch (error: any) {
      console.error('[Guessing Game] Error checking auto-reveal:', error);
      callback({ success: false, error: error.message || 'Failed to check auto-reveal' });
    }
  });
}

