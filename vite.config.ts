import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    proxy: {
      // Browser and Tauri webview both use /api/v1/* → same AgentService as weline-agent.
      '/api': {
        target: 'http://127.0.0.1:17640',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: ['es2022', 'chrome120', 'safari15'],
    sourcemap: true,
  },
});
