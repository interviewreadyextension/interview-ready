import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

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
export default defineConfig({
  plugins: [react(), flattenPopupHtml()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
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
});
