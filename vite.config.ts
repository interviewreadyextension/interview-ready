import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import ripPlugin from './vite-plugin-rip.js';

/**
 * Moves the popup HTML from dist/src/popup/index.html → dist/popup/index.html
 * Vite preserves the path relative to the project root, which we don't want.
 */
function flattenPopupHtml(): Plugin {
  return {
    name: 'flatten-popup-html',
    enforce: 'post',
    generateBundle(_, bundle) {
      for (const key of Object.keys(bundle)) {
        if (key.endsWith('/index.html') && key.includes('src/popup')) {
          const chunk = bundle[key];
          delete bundle[key];
          chunk.fileName = 'popup/index.html';
          bundle['popup/index.html'] = chunk;
        }
      }
    },
  };
}

/**
 * Popup build — React app bundled as ES module.
 * Chrome extension popups support <script type="module">.
 *
 * Static assets (manifest.json, images, options page) live in public/
 * and are copied as-is into dist/.
 */
export default defineConfig(({ command }) => ({
  plugins: [ripPlugin(), react(), flattenPopupHtml()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
    extensions: ['.rip', '.ts', '.tsx', '.js', '.jsx', '.json'],
  },
  publicDir: 'public',
  build: {
    outDir: 'dist',
    // Only empty outDir during production builds, not watch mode.
    // In watch mode, both popup and content script builds run concurrently,
    // so wiping dist/ would delete the content script output.
    emptyOutDir: command === 'build' && !process.argv.includes('--watch'),
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
      },
      output: {
        entryFileNames: 'popup/[name].js',
        chunkFileNames: 'popup/chunks/[name]-[hash].js',
        assetFileNames: 'popup/assets/[name]-[hash][extname]',
      },
    },
  },
}));
