/**
 * Background Service Worker
 *
 * Responsibilities:
 * - CF API client (all API calls go through here)
 * - Encrypted vault (credentials storage)
 * - Rate-limited request queues
 * - Task ledger (IndexedDB persistence)
 * - Message routing to panel/popup
 */

export default defineBackground(() => {
  console.log('[CF Tools] Background service worker started');

  // TODO: Initialize vault
  // TODO: Initialize CF client
  // TODO: Initialize queue pools
  // TODO: Initialize task ledger
  // TODO: Set up message handlers
});
