import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root (3 levels up from apps/web/vite.config.ts)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    port: 5173,
    host: true, // Expose to local network (0.0.0.0)
    strictPort: false, // Allow port fallback if 5173 is taken
  },
  resolve: {
    alias: {
      '@christmas/core': fileURLToPath(new URL('../../packages/core/dist', import.meta.url)),
    },
  },
  optimizeDeps: {
    include: ['@christmas/core'],
  },
  ssr: {
    noExternal: ['@christmas/core'],
  },
  // SvelteKit automatically handles PUBLIC_ prefixed env vars
  // We load .env from project root above so Vite can access them
});
