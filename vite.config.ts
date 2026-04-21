import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5177,
    proxy: {
      '/api': 'http://localhost:3456',
      '/uploads': 'http://localhost:3456',
    },
  },
});
