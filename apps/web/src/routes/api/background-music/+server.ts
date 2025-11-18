import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readdir } from 'fs/promises';
import { join } from 'path';

// List available background music tracks
export const GET: RequestHandler = async ({ platform }) => {
  try {
    const cwd = process.cwd();
    let audioDir: string;
    let files: string[] = [];
    
    // Check if we're already in apps/web directory or at project root
    // In SvelteKit dev, it might run from apps/web, so check both
    const isInAppsWeb = cwd.endsWith('apps/web') || cwd.endsWith('apps\\web');
    
    if (isInAppsWeb) {
      // Running from apps/web directory
      audioDir = join(cwd, 'static', 'audio', 'background-music');
    } else {
      // Running from project root
      audioDir = join(cwd, 'apps', 'web', 'static', 'audio', 'background-music');
    }
    
    try {
      files = await readdir(audioDir);
    } catch (err) {
      // Try the other path as fallback
      const fallbackDir = isInAppsWeb 
        ? join(cwd, '..', '..', 'apps', 'web', 'static', 'audio', 'background-music')
        : join(cwd, 'static', 'audio', 'background-music');
      
      try {
        files = await readdir(fallbackDir);
        audioDir = fallbackDir;
      } catch (fallbackErr) {
        console.warn('[API] Could not find background-music directory.');
        console.warn('[API] Current working directory:', cwd);
        console.warn('[API] Is in apps/web:', isInAppsWeb);
        console.warn('[API] Tried:', audioDir);
        console.warn('[API] Fallback tried:', fallbackDir);
        return json({ tracks: [] });
      }
    }
    
    const audioFiles = files
      .filter(file => /\.(mp3|ogg|wav|m4a)$/i.test(file))
      .map(file => ({
        filename: file,
        displayName: file.replace(/\.(mp3|ogg|wav|m4a)$/i, '').replace(/[-_]/g, ' '),
        path: `/audio/background-music/${file}`
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
    
    console.log(`[API] Found ${audioFiles.length} tracks in ${audioDir}`);
    return json({ tracks: audioFiles });
  } catch (error: any) {
    console.error('[API] Error listing background music:', error);
    return json({ tracks: [] }, { status: 500 });
  }
};

