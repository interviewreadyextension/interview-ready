import { defineConfig } from 'vite';
import { resolve } from 'path';
import ripPlugin from './vite-plugin-rip.js';

/**
 * Content script build — IIFE bundle (no ES modules allowed).
 * Runs AFTER the popup build (emptyOutDir: false to preserve popup output).
 */
export default defineConfig({
  plugins: [ripPlugin()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
    extensions: ['.rip', '.ts', '.tsx', '.js', '.jsx', '.json'],
  },
  publicDir: false, // Don't copy public/ again
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/content-script/index.rip'),
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
