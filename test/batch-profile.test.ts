import { describe, expect, it } from 'vitest';
import { resolveBatchProfileId } from '../src/shared/types/tasks';

describe('resolveBatchProfileId', () => {
  it('a stamped batch keeps its profile regardless of the active one', () => {
    expect(resolveBatchProfileId('p1', 'p2')).toBe('p1');
    expect(resolveBatchProfileId('p1', null)).toBe('p1');
  });

  it('a pre-v0.2.0 batch falls back to the active profile', () => {
    expect(resolveBatchProfileId(undefined, 'p2')).toBe('p2');
  });

  it('no stamp and no active profile → undefined (vault will throw VaultLockedError)', () => {
    expect(resolveBatchProfileId(undefined, null)).toBeUndefined();
  });
});
