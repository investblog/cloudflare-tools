import { capMap, type NewsPost, nextSeen, parseFeed, unseenNewestFirst } from '@engine/news';
import { describe, expect, it } from 'vitest';

function post(slug: string): NewsPost {
  return { slug, title: `Post ${slug}`, description: '', date: '2026-01-01', url: `https://301.sh/${slug}` };
}

describe('news', () => {
  describe('parseFeed', () => {
    it('parses a valid feed', () => {
      const raw = { posts: [{ slug: 'a', title: 'A', description: 'd', date: '2026-01-01', url: 'https://x/a' }] };
      expect(parseFeed(raw)).toEqual([
        { slug: 'a', title: 'A', description: 'd', date: '2026-01-01', url: 'https://x/a' },
      ]);
    });

    it('returns empty for non-object, missing posts, or non-array posts', () => {
      expect(parseFeed(null)).toEqual([]);
      expect(parseFeed('x')).toEqual([]);
      expect(parseFeed({})).toEqual([]);
      expect(parseFeed({ posts: 'nope' })).toEqual([]);
    });

    it('drops malformed entries and defaults optional fields', () => {
      const raw = {
        posts: [null, { title: 'no slug', url: 'x' }, { slug: 'ok', title: 'T', url: 'u', description: 7, date: null }],
      };
      expect(parseFeed(raw)).toEqual([{ slug: 'ok', title: 'T', description: '', date: '', url: 'u' }]);
    });
  });

  describe('unseenNewestFirst', () => {
    it('returns posts after the last seen slug, newest first', () => {
      const posts = ['a', 'b', 'c', 'd'].map(post);
      expect(unseenNewestFirst(posts, new Set(['a', 'b'])).map((p) => p.slug)).toEqual(['d', 'c']);
    });

    it('returns everything newest-first when nothing is seen', () => {
      const posts = ['a', 'b'].map(post);
      expect(unseenNewestFirst(posts, new Set()).map((p) => p.slug)).toEqual(['b', 'a']);
    });

    it('does not re-notify old posts that fell out of the capped seen window', () => {
      // Feed: 305 posts oldest-first; the seen window keeps only the newest 300.
      const posts = Array.from({ length: 305 }, (_, i) => post(`p${i}`));
      const seen = new Set(posts.slice(5, 300).map((p) => p.slug));
      const fresh = unseenNewestFirst(posts, seen).map((p) => p.slug);
      // p0..p4 are unseen but OLDER than the last seen post — they must not resurface.
      expect(fresh).toEqual(['p304', 'p303', 'p302', 'p301', 'p300']);
    });
  });

  describe('nextSeen', () => {
    it('appends new slugs in feed order and dedupes', () => {
      expect(nextSeen(['a'], ['a', 'b', 'c'].map(post), 10)).toEqual(['a', 'b', 'c']);
    });

    it('caps to the newest max entries', () => {
      expect(nextSeen(['a', 'b'], ['c', 'd'].map(post), 3)).toEqual(['b', 'c', 'd']);
    });
  });

  describe('capMap', () => {
    it('keeps the map when under the cap', () => {
      const map = { a: '1', b: '2' };
      expect(capMap(map, 2)).toBe(map);
    });

    it('drops the oldest entries above the cap', () => {
      expect(capMap({ a: '1', b: '2', c: '3' }, 2)).toEqual({ b: '2', c: '3' });
    });
  });
});
