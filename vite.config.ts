// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ['buffer', 'process', 'url'],
      globals: { Buffer: true, global: true, process: true },
      protocolImports: true,
    }),
  ],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://nakodamobile.com/', // your prod API
        changeOrigin: true,                 // makes the upstream see Host as nakodamobile.in
        secure: true,                       // keep true for valid HTTPS
        rewrite: (path) => path,            // keep /api prefix as-is
        // optional: add headers if your upstream needs them
        // headers: { 'X-Forwarded-Proto': 'https' },
      },
    },
  },
  define: {
    global: 'globalThis',
  },
});
