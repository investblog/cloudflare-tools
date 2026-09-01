/**
 * Background half of the publisher news: alarm-driven feed checks and
 * notifications. Everything is gated on the optional permissions — off means
 * off, no network. The `alarms` / `notifications` namespaces may be absent
 * until the optional permission is granted (on Firefox sometimes until
 * restart), so they are re-read on every access, never destructured at module
 * load. State writes are serialized: enable/disable can interleave with a slow
 * fetch, and the notification click map is a whole-object write.
 */

import { capMap, type NewsPost, nextSeen, parseFeed, unseenNewestFirst } from '@engine/news';
import {
  getNewsEnabled,
  hasNewsPermissions,
  MAX_NOTIF_URL_ENTRIES,
  MAX_NOTIFICATIONS_PER_CHECK,
  MAX_SEEN_SLUGS,
  NEWS_ALARM_NAME,
  NEWS_ALARM_PERIOD_MINUTES,
  NEWS_FEED_URL,
  NEWS_NOTIF_URLS_KEY,
  NEWS_SEEDED_KEY,
  NEWS_SEEN_KEY,
  setNewsEnabled,
} from '@shared/news';
import { browser } from 'wxt/browser';

const notifications = (): any => (browser as any).notifications;
const alarms = (): any => (browser as any).alarms;

let chain: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => {});
  return next;
}

async function takeNotifUrl(id: string): Promise<string | undefined> {
  const res = await browser.storage.local.get(NEWS_NOTIF_URLS_KEY);
  const map = { ...((res[NEWS_NOTIF_URLS_KEY] ?? {}) as Record<string, string>) };
  const url = map[id];
  if (url) {
    delete map[id];
    await browser.storage.local.set({ [NEWS_NOTIF_URLS_KEY]: map });
  }
  return url;
}

async function rememberNotifUrl(id: string, url: string): Promise<void> {
  const res = await browser.storage.local.get(NEWS_NOTIF_URLS_KEY);
  const map = { ...((res[NEWS_NOTIF_URLS_KEY] ?? {}) as Record<string, string>) };
  map[id] = url;
  await browser.storage.local.set({ [NEWS_NOTIF_URLS_KEY]: capMap(map, MAX_NOTIF_URL_ENTRIES) });
}

let listenersRegistered = false;
export function registerNotificationListeners(): void {
  if (listenersRegistered) return;
  const api = notifications();
  if (!api?.onClicked) return;
  listenersRegistered = true;
  api.onClicked.addListener((id: string) => {
    void serialized(async () => {
      const url = await takeNotifUrl(id);
      if (url) await browser.tabs.create({ url });
      notifications()?.clear?.(id);
    });
  });
  api.onClosed?.addListener((id: string) => {
    void serialized(() => takeNotifUrl(id));
  });
}

async function notifyPost(post: NewsPost): Promise<void> {
  const api = notifications();
  if (!api?.create) return;
  const id = `news-${post.slug}`;
  // Persist the url BEFORE creating the toast — a fast click must not race an unwritten map.
  await rememberNotifUrl(id, post.url);
  // Last-moment opt-out check: the write above is itself an await window.
  if (!(await getNewsEnabled())) return;
  await api.create(id, {
    type: 'basic',
    iconUrl: browser.runtime.getURL('/icons/icon-128.png'),
    title: post.title,
    message: post.description.slice(0, 200),
  });
}

async function checkNewsInner(seedOnly: boolean): Promise<boolean> {
  if (!(await getNewsEnabled())) return false;
  if (!(await hasNewsPermissions())) return false;

  const res = await fetch(NEWS_FEED_URL, { headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) throw new Error(`news feed HTTP ${res.status}`);
  const posts = parseFeed(await res.json());

  // Re-check after the fetch: the user may have opted out while it was in
  // flight (the disable is queued behind this serialized run and cannot cancel it).
  if (!(await getNewsEnabled()) || !(await hasNewsPermissions())) return false;

  const stored = await browser.storage.local.get([NEWS_SEEN_KEY, NEWS_SEEDED_KEY]);
  const seen = (stored[NEWS_SEEN_KEY] ?? []) as string[];
  const seeded = Boolean(stored[NEWS_SEEDED_KEY]);

  // A missing/false seeded flag means "still seeding" — a failed seed must not
  // dump the whole backlog as notifications on the next tick.
  if (seedOnly || !seeded) {
    await browser.storage.local.set({
      [NEWS_SEEN_KEY]: nextSeen(seen, posts, MAX_SEEN_SLUGS),
      [NEWS_SEEDED_KEY]: true,
    });
    return true;
  }

  const fresh = unseenNewestFirst(posts, new Set(seen));
  for (const post of fresh.slice(0, MAX_NOTIFICATIONS_PER_CHECK)) {
    await notifyPost(post);
  }
  await browser.storage.local.set({ [NEWS_SEEN_KEY]: nextSeen(seen, posts, MAX_SEEN_SLUGS) });
  return true;
}

export function checkNews(opts: { seedOnly?: boolean } = {}): Promise<boolean> {
  return serialized(() => checkNewsInner(Boolean(opts.seedOnly))).catch((e) => {
    console.warn('news check failed', e);
    return false;
  });
}

/** alarms.create with an existing name restarts the countdown — only create when absent. */
export async function ensureNewsAlarm(): Promise<void> {
  const api = alarms();
  if (!api?.get) return;
  const existing = await api.get(NEWS_ALARM_NAME);
  if (!existing) api.create(NEWS_ALARM_NAME, { periodInMinutes: NEWS_ALARM_PERIOD_MINUTES });
}

export function enableNews(): Promise<void> {
  return serialized(async () => {
    registerNotificationListeners();
    registerAlarmListener();
    await browser.storage.local.set({ [NEWS_SEEDED_KEY]: false });
    await checkNewsInner(true).catch((e) => console.warn('news seed failed', e));
    // Re-read: the user may have switched it back off while the first fetch was in flight.
    if (await getNewsEnabled()) await ensureNewsAlarm();
  });
}

export function disableNews(): Promise<void> {
  return serialized(async () => {
    await alarms()?.clear?.(NEWS_ALARM_NAME);
  });
}

let alarmListenerRegistered = false;
function registerAlarmListener(): void {
  if (alarmListenerRegistered) return;
  const api = alarms();
  if (!api?.onAlarm) return;
  alarmListenerRegistered = true;
  api.onAlarm.addListener((alarm: { name: string }) => {
    if (alarm.name === NEWS_ALARM_NAME) void checkNews();
  });
}

/** Register listeners and restore the alarm after browser / service-worker restarts. */
export function setupNews(): void {
  registerAlarmListener();
  registerNotificationListeners();
  browser.permissions.onAdded?.addListener(() => {
    // Namespaces appear once the optional permissions are granted.
    registerAlarmListener();
    registerNotificationListeners();
    void getNewsEnabled().then((on) => {
      if (on) void ensureNewsAlarm();
    });
  });
  // Revocation from browser settings: turn the feature off instead of leaving
  // a stale enabled flag and a periodic alarm that can never fetch.
  browser.permissions.onRemoved?.addListener(() => {
    void hasNewsPermissions().then(async (ok) => {
      if (!ok && (await getNewsEnabled())) {
        await setNewsEnabled(false);
        await disableNews();
      }
    });
  });
  browser.runtime.onMessage.addListener((raw: unknown) => {
    const msg = raw as { type?: string; enabled?: boolean };
    if (msg?.type !== 'news') return;
    void (msg.enabled ? enableNews() : disableNews());
  });
  void getNewsEnabled().then((on) => {
    if (on) void ensureNewsAlarm();
  });
}
