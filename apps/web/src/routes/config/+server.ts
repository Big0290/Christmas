import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env from project root if not already loaded
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../../../../.env');
dotenv.config({ path: envPath });

// Runtime config endpoint - serves environment variables to the client
// This allows Fly.io secrets to be available at runtime even if not at build time
// The server reads from process.env (set by Fly.io secrets or .env file)
export const GET: RequestHandler = async ({ platform }) => {
  // In Fly.io, platform.env contains the environment variables
  // Fallback to process.env for Node.js environments
  const env = (platform as any)?.env || process.env;
  
  return json({
    PUBLIC_SUPABASE_URL: env.PUBLIC_SUPABASE_URL || '',
    PUBLIC_SUPABASE_ANON_KEY: env.PUBLIC_SUPABASE_ANON_KEY || '',
  });
};

