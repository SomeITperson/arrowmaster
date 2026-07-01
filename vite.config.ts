import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Consume the shared package straight from its TypeScript source so the client
// and server provably run the same simulation code (no build step in between).
export default defineConfig({
  resolve: {
    alias: {
      '@duels/shared': fileURLToPath(new URL('./packages/shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
});
