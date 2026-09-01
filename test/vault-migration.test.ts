import { describe, expect, it } from 'vitest';
import {
  LEGACY_KEY_ID,
  migrateStoredVault,
  nextActiveAfterRemove,
  profileNeedsSecret,
  type StoredVaultV3,
} from '../src/background/vault';

describe('migrateStoredVault', () => {
  const v2 = {
    email: 'user@example.com',
    encryptedApiKey: 'QkFTRTY0Q0lQSEVSVEVYVA==',
    iv: 'SVZJVklWSVZJVg==',
    version: 2 as const,
  };

  it('v2 → v3: single global-key profile, ciphertext/iv byte-identical, active', () => {
    const { vault, changed } = migrateStoredVault(v2);
    expect(changed).toBe(true);
    expect(vault.version).toBe(3);
    expect(vault.profiles).toHaveLength(1);

    const p = vault.profiles[0];
    expect(p.kind).toBe('global-key');
    expect(p.label).toBe('user@example.com');
    expect(p.email).toBe('user@example.com');
    expect(p.encryptedSecret).toBe(v2.encryptedApiKey);
    expect(p.iv).toBe(v2.iv);
    expect(p.keyId).toBe(LEGACY_KEY_ID);
    expect(vault.activeProfileId).toBe(p.id);
  });

  it('v3 passes through unchanged', () => {
    const v3: StoredVaultV3 = { version: 3, profiles: [], activeProfileId: null };
    const { vault, changed } = migrateStoredVault(v3);
    expect(changed).toBe(false);
    expect(vault).toBe(v3);
  });

  it('nullish → empty v3, not marked changed', () => {
    for (const raw of [undefined, null]) {
      const { vault, changed } = migrateStoredVault(raw);
      expect(changed).toBe(false);
      expect(vault).toEqual({ version: 3, profiles: [], activeProfileId: null });
    }
  });

  it('garbage resets to empty v3', () => {
    for (const raw of [{ version: 99 }, 'nonsense', 42, { email: 1, version: 2 }]) {
      const { vault, changed } = migrateStoredVault(raw);
      expect(changed).toBe(true);
      expect(vault.profiles).toEqual([]);
      expect(vault.activeProfileId).toBeNull();
    }
  });
});

describe('profileNeedsSecret', () => {
  const profile = { keyId: 'key-1' };

  it('locked → always needs secret', () => {
    expect(profileNeedsSecret(profile, false, 'key-1')).toBe(true);
    expect(profileNeedsSecret(profile, false, null)).toBe(true);
  });

  it('unlocked + matching keyId → usable', () => {
    expect(profileNeedsSecret(profile, true, 'key-1')).toBe(false);
  });

  it('unlocked + stale keyId → needs secret', () => {
    expect(profileNeedsSecret(profile, true, 'key-2')).toBe(true);
    expect(profileNeedsSecret(profile, true, null)).toBe(true);
  });

  it('legacy v2 session key still opens the migrated profile', () => {
    expect(profileNeedsSecret({ keyId: LEGACY_KEY_ID }, true, LEGACY_KEY_ID)).toBe(false);
  });
});

describe('nextActiveAfterRemove', () => {
  const remaining = [{ id: 'a' }, { id: 'b' }];

  it('removing a non-active profile keeps the active one', () => {
    expect(nextActiveAfterRemove(remaining, 'c', 'b')).toBe('b');
  });

  it('removing the active profile picks the first remaining', () => {
    expect(nextActiveAfterRemove(remaining, 'c', 'c')).toBe('a');
  });

  it('removing the last profile → null', () => {
    expect(nextActiveAfterRemove([], 'a', 'a')).toBeNull();
  });
});
