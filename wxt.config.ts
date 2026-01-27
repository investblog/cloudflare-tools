import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  outDir: 'dist',

  manifest: ({ browser }) => ({
    name: 'Cloudflare Tools',
    description: 'Bulk operations for Cloudflare zones',
    version: '0.1.0',
    homepage_url: 'https://301.st',

    // sidePanel is Chrome-only, Firefox uses sidebar_action (auto-added by WXT)
    permissions: browser === 'firefox'
      ? ['storage']
      : ['storage', 'sidePanel'],

    host_permissions: [
      'https://api.cloudflare.com/*',
      'https://dash.cloudflare.com/*',
    ],

    icons: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },

    // Firefox-specific settings
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'cf-tools@301.st',
          strict_min_version: '142.0',
          data_collection_permissions: {
            required: ['none'],
            optional: [],
          },
        },
      },
    }),
  }),

  // Build for both Chrome and Firefox
  browser: 'chrome',
});
