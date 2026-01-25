import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  outDir: 'dist',

  manifest: {
    name: 'Cloudflare Tools',
    description: 'Bulk operations for Cloudflare zones',
    version: '0.1.0',

    permissions: ['storage', 'sidePanel'],
    host_permissions: ['https://api.cloudflare.com/*'],

    icons: {
      16: 'icons/icon-16.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
  },

  // Build for both Chrome and Firefox
  browser: 'chrome',
});
