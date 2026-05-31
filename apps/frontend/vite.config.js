import { defineConfig } from 'vite';

export default defineConfig({
  root: 'public',
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000'
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: 'public/index.html'
      }
    }
  },
  optimizeDeps: {
    exclude: ['@steam-ejector/shared']
  }
});
