import { resolve } from 'node:path';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  outDir: 'dist',

  alias: {
    '@': resolve('src'),
    '@shared': resolve('src/shared'),
    '@engine': resolve('src/engine'),
    '@background': resolve('src/background'),
  },

  vite: ({ browser }) => ({
    define: {
      // Per-store review link (footer, welcome page).
      // TODO: swap the Edge fallback for the real Edge Add-ons product URL once known.
      __REVIEW_URL__: JSON.stringify(
        browser === 'firefox'
          ? 'https://addons.mozilla.org/en-US/firefox/addon/cloudflare-tools/?utm_source=extension'
          : 'https://chromewebstore.google.com/detail/gncbekdjakchefiiahjbjlbhhfijoikp?utm_source=extension',
      ),
      __TARGET_BROWSER__: JSON.stringify(browser),
    },
  }),

  manifest: ({ browser }) => ({
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    version: '0.2.0',
    homepage_url: 'https://301.st',

    // sidePanel is Chrome-only, Firefox uses sidebar_action (auto-added by WXT).
    // Firefox disallows 'alarms' in optional_permissions (AMO MANIFEST_OPTIONAL_PERMISSIONS
    // warning, and permissions.request would reject it) — it is a silent no-prompt
    // permission there, so it rides in the required set on Firefox only.
    permissions: browser === 'firefox' ? ['storage', 'alarms'] : ['storage', 'sidePanel'],

    host_permissions: ['https://api.cloudflare.com/*', 'https://dash.cloudflare.com/*'],

    // Publisher-news opt-in — optional so the Chromium required set never changes.
    // Firefox MV2 has no optional_host_permissions; origins fold into optional_permissions.
    ...(browser === 'firefox'
      ? { optional_permissions: ['notifications', 'https://301.sh/*'] }
      : {
          optional_permissions: ['notifications', 'alarms'],
          optional_host_permissions: ['https://301.sh/*'],
        }),

    // Toolbar button without a popup: Chromium opens the side panel via
    // setPanelBehavior (background), Firefox opens the sidebar from the
    // browserAction.onClicked handler. No intermediate popup window.
    ...(browser === 'firefox'
      ? {
          browser_action: {
            default_title: 'Cloudflare Tools',
            default_icon: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png' },
          },
          // Firefox: a bindable "toggle the sidebar" command (the toolbar button does the same).
          commands: { _execute_sidebar_action: { description: 'Toggle the Cloudflare Tools sidebar' } },
        }
      : {
          action: {
            default_title: 'Cloudflare Tools',
            default_icon: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png' },
          },
        }),

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
