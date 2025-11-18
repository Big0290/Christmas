import { browser } from '$app/environment';

export interface Track {
  filename: string;
  displayName: string;
  path: string;
}

let cachedTracks: Track[] | null = null;

/**
 * Discover available background music tracks
 * First tries to fetch from API endpoint, falls back to default track
 */
export async function discoverBackgroundMusicTracks(): Promise<Track[]> {
  if (!browser) {
    return [];
  }

  // Return cached tracks if available
  if (cachedTracks !== null) {
    return cachedTracks;
  }

  try {
    // Try to fetch from API endpoint
    const response = await fetch('/api/background-music');
    if (response.ok) {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        if (data.tracks && Array.isArray(data.tracks) && data.tracks.length > 0) {
          console.log(`[Audio Discovery] Loaded ${data.tracks.length} tracks from API`);
          cachedTracks = data.tracks;
          return cachedTracks;
        } else {
          console.warn('[Audio Discovery] API returned empty tracks array');
        }
      } else {
        const text = await response.text();
        console.error('[Audio Discovery] API returned non-JSON response:', text.substring(0, 200));
      }
    } else {
      console.warn(`[Audio Discovery] API returned status ${response.status}: ${response.statusText}`);
    }
  } catch (error: any) {
    console.warn('[Audio Discovery] Could not fetch background music tracks from API:', error.message);
  }

  // Fallback to default track if API fails or returns empty
  const defaultTrack: Track = {
    filename: 'background-music.mp3',
    displayName: 'Background Music',
    path: '/audio/background-music.mp3' // Fallback to root audio directory
  };

  cachedTracks = [defaultTrack];
  return cachedTracks;
}

/**
 * Clear cached tracks (useful for development/testing)
 */
export function clearTrackCache(): void {
  cachedTracks = null;
}

