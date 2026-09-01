/**
 * Publisher-news opt-in: constants, storage flags, and the optional-permission
 * flow. Zero network by default — everything activates only after the user
 * grants the optional permissions via the bell control. `alarms` is optional
 * too, so the required permission set (storage, sidePanel) never changes.
 */

import { browser } from 'wxt/browser';

export const NEWS_FEED_URL = 'https://301.sh/posts.json';
export const NEWS_ORIGIN = 'https://301.sh/*';
export const NEWS_ALARM_NAME = 'news-check';
export const NEWS_ALARM_PERIOD_MINUTES = 6 * 60;

export const NEWS_ENABLED_KEY = 'cfTools:newsEnabled';
export const NEWS_SEEN_KEY = 'cfTools:newsSeenSlugs';
export const NEWS_SEEDED_KEY = 'cfTools:newsSeeded';
export const NEWS_NOTIF_URLS_KEY = 'cfTools:newsNotifUrls';

export const MAX_NOTIFICATIONS_PER_CHECK = 3;
export const MAX_SEEN_SLUGS = 300;
export const MAX_NOTIF_URL_ENTRIES = 20;

// Firefox rejects 'alarms' as an optional permission (it is required there, see
// wxt.config.ts), so only Chromium requests/drops it at runtime.
const NEWS_PERMISSIONS = {
  permissions: import.meta.env.BROWSER === 'firefox' ? ['notifications'] : ['notifications', 'alarms'],
  origins: [NEWS_ORIGIN],
};

export async function getNewsEnabled(): Promise<boolean> {
  try {
    const res = await browser.storage.local.get(NEWS_ENABLED_KEY);
    return Boolean(res[NEWS_ENABLED_KEY]);
  } catch {
    return false;
  }
}

export async function setNewsEnabled(enabled: boolean): Promise<void> {
  await browser.storage.local.set({ [NEWS_ENABLED_KEY]: enabled });
}

export async function requestNewsPermissions(): Promise<boolean> {
  try {
    return await browser.permissions.request(NEWS_PERMISSIONS as any);
  } catch (e) {
    console.warn('news permission request failed', e);
    return false;
  }
}

export async function hasNewsPermissions(): Promise<boolean> {
  try {
    return await browser.permissions.contains(NEWS_PERMISSIONS as any);
  } catch {
    return false;
  }
}

export async function dropNewsPermissions(): Promise<void> {
  try {
    await browser.permissions.remove(NEWS_PERMISSIONS as any);
  } catch {
    /* Firefox may refuse to remove a permission that was never granted */
  }
}

/**
 * Call synchronously from the click handler with the state the control already
 * shows — Firefox accepts permissions.request only while the user-input
 * handler is still on the stack, so nothing may be awaited before it.
 */
export async function toggleNews(currentlyEnabled: boolean): Promise<boolean> {
  if (currentlyEnabled) {
    await setNewsEnabled(false);
    // Clear the alarm while the `alarms` permission is still granted — after
    // dropNewsPermissions() the namespace may be gone and the clear would be skipped.
    try {
      await (browser as any).alarms?.clear?.(NEWS_ALARM_NAME);
    } catch {
      /* namespace already unavailable */
    }
    await dropNewsPermissions();
    await browser.runtime.sendMessage({ type: 'news', enabled: false }).catch(() => {});
    return false;
  }
  if (!(await requestNewsPermissions())) return false;
  await setNewsEnabled(true);
  await browser.runtime.sendMessage({ type: 'news', enabled: true }).catch(() => {});
  return true;
}
