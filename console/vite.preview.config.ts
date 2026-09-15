import { defineConfig } from "vite";
export default defineConfig({
  esbuild: { jsx: "automatic", jsxImportSource: "preact" },
  define: { "import.meta.env.VITE_CONSOLE_PREVIEW": JSON.stringify("true") },
  build: {
    outDir: "dist/preview",
    assetsInlineLimit: 1000000,
    cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
