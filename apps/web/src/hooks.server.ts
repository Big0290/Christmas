import type { Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root (3 levels up from apps/web/src/hooks.server.ts)
const envPath = path.resolve(__dirname, '../../../.env');
dotenv.config({ path: envPath });

if (dev) {
  console.log('[Hooks] ✅ Loaded .env from:', envPath);
  console.log('[Hooks] PUBLIC_SUPABASE_URL:', process.env.PUBLIC_SUPABASE_URL ? '✅ Set' : '❌ Missing');
  console.log('[Hooks] PUBLIC_SUPABASE_ANON_KEY:', process.env.PUBLIC_SUPABASE_ANON_KEY ? '✅ Set' : '❌ Missing');
}

export const handle: Handle = async ({ event, resolve }) => {
  return resolve(event);
};

