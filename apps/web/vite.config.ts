import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    port: 5173,
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
});
