import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import { createManifest } from './manifest.config';

export default defineConfig(({ mode }) => ({
  plugins: [crx({ manifest: createManifest(mode) })],
  build: {
    target: 'esnext',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
}));
