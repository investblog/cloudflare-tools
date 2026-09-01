/**
 * Publisher-news feed logic (pure, no DOM, no browser APIs).
 *
 * Feed contract (https://301.sh/posts.json): `{ posts: NewsPost[] }`, posts
 * ordered OLDEST FIRST. Ported from the spintax-extension news pipeline.
 */

export interface NewsPost {
  slug: string;
  title: string;
  description: string;
  date: string;
  url: string;
}

/** Tolerant feed parse — drops malformed entries instead of throwing. */
export function parseFeed(raw: unknown): NewsPost[] {
  if (!raw || typeof raw !== 'object') return [];
  const posts = (raw as { posts?: unknown }).posts;
  if (!Array.isArray(posts)) return [];
  const out: NewsPost[] = [];
  for (const p of posts) {
    if (!p || typeof p !== 'object') continue;
    const { slug, title, description, date, url } = p as Record<string, unknown>;
    if (typeof slug !== 'string' || !slug || typeof title !== 'string' || typeof url !== 'string') continue;
    out.push({
      slug,
      title,
      description: typeof description === 'string' ? description : '',
      date: typeof date === 'string' ? date : '',
      url,
    });
  }
  return out;
}

/**
 * Posts after the LAST seen slug, newest first. Scanning for the last seen
 * index (instead of filtering by "not in set") prevents re-notifying old posts
 * once the capped seen window no longer reaches the feed head.
 */
export function unseenNewestFirst(posts: NewsPost[], seen: ReadonlySet<string>): NewsPost[] {
  let lastSeenIdx = -1;
  for (let i = posts.length - 1; i >= 0; i--) {
    if (seen.has(posts[i].slug)) {
      lastSeenIdx = i;
      break;
    }
  }
  return posts.slice(lastSeenIdx + 1).reverse();
}

/** Merge feed slugs into the seen list (feed order), capped to the newest `max`. */
export function nextSeen(previous: string[], posts: NewsPost[], max: number): string[] {
  const merged = [...previous];
  const known = new Set(previous);
  for (const p of posts) {
    if (!known.has(p.slug)) {
      known.add(p.slug);
      merged.push(p.slug);
    }
  }
  return merged.slice(-max);
}

/** Cap an insertion-ordered map to its newest `max` entries. */
export function capMap(map: Record<string, string>, max: number): Record<string, string> {
  const entries = Object.entries(map);
  return entries.length <= max ? map : Object.fromEntries(entries.slice(-max));
}
