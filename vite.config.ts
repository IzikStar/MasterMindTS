import { defineConfig } from 'vite';

// Relative base so the build works at https://<user>.github.io/<repo>/ and anywhere else.
export default defineConfig({
  base: './',
  build: { outDir: 'dist' },
});
