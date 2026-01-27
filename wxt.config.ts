import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  outDir: 'dist',

  manifest: ({ browser }) => ({
    name: 'Cloudflare Tools',
    description: 'Bulk operations for Cloudflare zones',
    version: '0.1.0',

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
            required: false,
            personally_identifiable: false,
            health: false,
            financial_and_payment: false,
            search: false,
            content: false,
            technical_and_interaction: false,
            location: false,
            biometric: false,
            personal_communications: false,
            user_generated_content: false,
          },
        },
      },
    }),
  }),

  // Build for both Chrome and Firefox
  browser: 'chrome',
});
