import { defineConfig } from 'wxt';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  srcDir: 'src',
  outDir: 'dist',

  manifest: {
    name: 'Cloudflare Tools',
    description: 'Bulk operations for Cloudflare zones',
    version: '0.1.0',

    permissions: ['storage', 'sidePanel'],
    host_permissions: [
      'https://api.cloudflare.com/*',
      'https://dash.cloudflare.com/*',
    ],

    icons: {
      16: 'icons/icon-16.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },

    // CSP for Argon2 WASM in Service Worker
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
  },

  // Vite plugins for WASM support
  vite: () => ({
    plugins: [wasm(), topLevelAwait()],
  }),

  // Build for both Chrome and Firefox
  browser: 'chrome',
});
