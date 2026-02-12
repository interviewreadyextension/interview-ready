import { defineConfig } from 'vite';
import { resolve } from 'path';

/**
 * Content script build — IIFE bundle (no ES modules allowed).
 * Runs AFTER the popup build (emptyOutDir: false to preserve popup output).
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  publicDir: false, // Don't copy public/ again
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/content-script/index.ts'),
      formats: ['iife'],
      name: 'InterviewReadyContentScript',
      fileName: () => 'onsite/content-script.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
