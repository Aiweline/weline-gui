import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteLocalScanPlugin } from './scripts/vite-local-scan-plugin.mjs';

export default defineConfig({
  plugins: [react(), viteLocalScanPlugin()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: ['es2022', 'chrome120', 'safari15'],
    sourcemap: true,
  },
});
