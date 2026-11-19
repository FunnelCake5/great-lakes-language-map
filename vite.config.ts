import { defineConfig } from 'vite';

// Served from https://<owner>.github.io/great-lakes-language-map/
export default defineConfig({
  base: '/great-lakes-language-map/',
  build: { target: 'es2022', sourcemap: true },
});
