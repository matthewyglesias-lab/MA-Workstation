import { defineConfig } from 'vite';
export default defineConfig({
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  server: { port: 5175, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3100' } },
  build: { outDir: 'dist/web' },
});
