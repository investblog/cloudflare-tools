/**
 * Session-only multi-profile Vault for Cloudflare credentials (v3).
 *
 * Security model (unchanged from v2):
 * - One random AES-256-GCM session key encrypts every profile secret
 *   (each with its own random 12-byte IV)
 * - Encrypted profiles live in chrome.storage.local (survive restarts)
 * - The session key lives in chrome.storage.session (cleared on browser close;
 *   Firefox MV2 has no storage.session — in-memory fallback, worker lifetime)
 * - No passwords needed - simpler UX, same security isolation
 *
 * v3 additions:
 * - Multiple profiles (Global API Key / user token / account-owned token),
 *   one active at a time
 * - Per-profile `keyId`: the id of the session key that encrypted the secret.
 *   After a browser restart the key is gone, so every profile's keyId no longer
 *   matches — "needs its secret re-entered" becomes a sync pure computation
 *   instead of GCM-auth-failure control flow.
 * - Lossless v2 → v3 migration: the old single entry becomes a profile with
 *   ciphertext/IV carried over byte-identical (works even while locked).
 */

import type { CFCredential, CredentialKind, ProfileInfo, ProfileMeta } from '../shared/types/credentials';

// ============================================================================
// Stored shapes
// ============================================================================

export interface StoredProfile {
  id: string;
  label: string;
  kind: CredentialKind;
  email?: string; // global-key only
  accountId?: string; // account-token only
  encryptedSecret: string; // base64 AES-GCM ciphertext
  iv: string; // base64, unique per encryption
  keyId: string; // id of the session key that produced encryptedSecret
  createdAt: number;
  lastVerifiedAt?: number;
  meta?: ProfileMeta;
}

export interface StoredVaultV3 {
  version: 3;
  profiles: StoredProfile[];
  activeProfileId: string | null;
}

/** v2 shape, kept only for migration typing. */
interface StoredVaultV2 {
  email: string;
  encryptedApiKey: string;
  iv: string;
  version: 2;
}

export interface VaultState {
  isInitialized: boolean; // profiles.length > 0
  isUnlocked: boolean; // session key present
  profiles: ProfileInfo[];
  activeProfileId: string | null;
  /** @deprecated active profile's email ?? label; kept for the panel until the profile UI lands. */
  email?: string;
}

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY_VAULT = 'cf_vault';
const STORAGE_KEY_SESSION = 'cf_vault_key';
const STORAGE_KEY_SESSION_ID = 'cf_vault_key_id';

/** keyId sentinel for secrets encrypted by v2 code (session key without an id). */
export const LEGACY_KEY_ID = 'legacy-v2';

// ============================================================================
// Pure helpers (exported for tests)
// ============================================================================

function emptyVaultV3(): StoredVaultV3 {
  return { version: 3, profiles: [], activeProfileId: null };
}

/**
 * Migrate whatever is stored under cf_vault to the v3 shape.
 * v2 → one global-key profile with ciphertext/IV carried over byte-identical,
 * so migration is lossless and works while locked. Garbage resets to empty v3.
 */
export function migrateStoredVault(raw: unknown): { vault: StoredVaultV3; changed: boolean } {
  if (raw === null || raw === undefined) {
    return { vault: emptyVaultV3(), changed: false };
  }
  if (typeof raw !== 'object') {
    return { vault: emptyVaultV3(), changed: true };
  }

  const record = raw as Record<string, unknown>;

  if (record.version === 3 && Array.isArray(record.profiles)) {
    return { vault: raw as StoredVaultV3, changed: false };
  }

  if (
    record.version === 2 &&
    typeof record.email === 'string' &&
    typeof record.encryptedApiKey === 'string' &&
    typeof record.iv === 'string'
  ) {
    const v2 = raw as StoredVaultV2;
    const profile: StoredProfile = {
      id: crypto.randomUUID(),
      label: v2.email,
      kind: 'global-key',
      email: v2.email,
      encryptedSecret: v2.encryptedApiKey,
      iv: v2.iv,
      keyId: LEGACY_KEY_ID,
      createdAt: Date.now(),
    };
    return {
      vault: { version: 3, profiles: [profile], activeProfileId: profile.id },
      changed: true,
    };
  }

  // Unknown/corrupt: reset (matches v2's behavior of clearing invalid state)
  return { vault: emptyVaultV3(), changed: true };
}

/**
 * Does this profile need its secret re-entered under the current session key?
 */
export function profileNeedsSecret(
  profile: Pick<StoredProfile, 'keyId'>,
  unlocked: boolean,
  currentKeyId: string | null,
): boolean {
  if (!unlocked || currentKeyId === null) return true;
  return profile.keyId !== currentKeyId;
}

/**
 * Which profile becomes active after removing one.
 */
export function nextActiveAfterRemove(
  remaining: Array<Pick<StoredProfile, 'id'>>,
  removedId: string,
  currentActive: string | null,
): string | null {
  if (currentActive !== null && currentActive !== removedId && remaining.some((p) => p.id === currentActive)) {
    return currentActive;
  }
  return remaining[0]?.id ?? null;
}

// ============================================================================
// Session Storage Helper (Firefox MV2 doesn't have chrome.storage.session)
// ============================================================================

// Check if session storage is available (Chrome MV3 only)
const hasSessionStorage = typeof chrome !== 'undefined' && chrome.storage && 'session' in chrome.storage;

const sessionStorage = {
  async get(keys: string[]): Promise<Record<string, string | undefined>> {
    if (hasSessionStorage) {
      try {
        const result = await chrome.storage.session.get(keys);
        return result || {};
      } catch (e) {
        console.log('[Vault] Session storage get failed:', e);
      }
    }
    // Fallback: no persistence (memory only handled by Vault class)
    return {};
  },

  async set(data: Record<string, string>): Promise<void> {
    if (hasSessionStorage) {
      try {
        await chrome.storage.session.set(data);
      } catch (e) {
        console.log('[Vault] Session storage set failed:', e);
      }
    }
    // Fallback: no-op (key stays in memory only)
  },

  async remove(keys: string[]): Promise<void> {
    if (hasSessionStorage) {
      try {
        await chrome.storage.session.remove(keys);
      } catch (e) {
        console.log('[Vault] Session storage remove failed:', e);
      }
    }
    // Fallback: no-op
  },
};

// ============================================================================
// Vault Class
// ============================================================================

export class Vault {
  private encryptionKey: CryptoKey | null = null;
  private currentKeyId: string | null = null;
  private sessionKeyPromise: Promise<void> | null = null;
  /** Bumped on lock()/clearAll(): in-flight async work must not resurrect state. */
  private epoch = 0;
  private storedVault: StoredVaultV3 = emptyVaultV3();
  private decryptedCache = new Map<string, CFCredential>();
  // In-memory fallbacks for Firefox MV2 (no storage.session)
  private keyBase64: string | null = null;
  private keyIdMemory: string | null = null;

  /**
   * Initialize vault - migrate stored data, restore session key if available.
   */
  async init(): Promise<void> {
    // Load + migrate stored vault from local storage
    const local = (await chrome.storage.local.get(STORAGE_KEY_VAULT)) || {};
    const { vault: migrated, changed } = migrateStoredVault(local[STORAGE_KEY_VAULT]);
    this.storedVault = migrated;
    if (changed) {
      await this.persist();
      console.log('[Vault] Migrated stored vault to v3');
    }

    // Try to restore key from session storage (or in-memory for Firefox)
    const session = (await sessionStorage.get([STORAGE_KEY_SESSION, STORAGE_KEY_SESSION_ID])) || {};
    const storedKey = session[STORAGE_KEY_SESSION] || this.keyBase64;
    const storedKeyId = session[STORAGE_KEY_SESSION_ID] || this.keyIdMemory;

    if (storedKey) {
      try {
        const keyData = this.base64ToArray(storedKey);
        this.encryptionKey = await crypto.subtle.importKey(
          'raw',
          keyData.buffer as ArrayBuffer,
          { name: 'AES-GCM' },
          false,
          ['encrypt', 'decrypt'],
        );
        // A session key written by v2 code has no id — it is the legacy key,
        // so the migrated profile stays decryptable within the live session.
        this.currentKeyId = storedKeyId ?? LEGACY_KEY_ID;
        if (!storedKeyId) {
          await sessionStorage.set({ [STORAGE_KEY_SESSION_ID]: LEGACY_KEY_ID });
        }
        this.keyBase64 = storedKey;
        this.keyIdMemory = this.currentKeyId;
        console.log('[Vault] Session key restored');
      } catch (error) {
        console.log('[Vault] Failed to restore session key:', error);
        await this.lock();
      }
    }
  }

  /**
   * Get current vault state (no secrets).
   */
  getState(): VaultState {
    const unlocked = this.encryptionKey !== null;
    const profiles: ProfileInfo[] = this.storedVault.profiles.map((p) => ({
      id: p.id,
      label: p.label,
      kind: p.kind,
      email: p.email,
      accountId: p.accountId,
      createdAt: p.createdAt,
      lastVerifiedAt: p.lastVerifiedAt,
      meta: p.meta,
      needsSecret: profileNeedsSecret(p, unlocked, this.currentKeyId),
    }));

    const active = this.storedVault.profiles.find((p) => p.id === this.storedVault.activeProfileId);

    return {
      isInitialized: this.storedVault.profiles.length > 0,
      isUnlocked: unlocked,
      profiles,
      activeProfileId: this.storedVault.activeProfileId,
      email: active ? (active.email ?? active.label) : undefined,
    };
  }

  /**
   * Add a profile: encrypt the secret, persist, make it active.
   * The caller is expected to have VERIFIED the credential first.
   */
  async addProfile(input: {
    kind: CredentialKind;
    secret: string;
    email?: string;
    accountId?: string;
    label: string;
    meta?: ProfileMeta;
  }): Promise<ProfileInfo> {
    const epoch = this.epoch;
    await this.ensureSessionKey();

    const { ciphertext, iv } = await this.encrypt(input.secret);
    // A lock() while encrypting must win: don't persist or cache after it.
    if (epoch !== this.epoch) {
      throw new VaultLockedError();
    }
    const profile: StoredProfile = {
      id: crypto.randomUUID(),
      label: input.label,
      kind: input.kind,
      email: input.email,
      accountId: input.accountId,
      encryptedSecret: this.arrayToBase64(ciphertext),
      iv: this.arrayToBase64(iv),
      keyId: this.currentKeyId as string,
      createdAt: Date.now(),
      lastVerifiedAt: Date.now(),
      meta: input.meta,
    };

    this.storedVault.profiles.push(profile);
    this.storedVault.activeProfileId = profile.id;
    await this.persist();

    this.decryptedCache.set(profile.id, this.toCredential(profile, input.secret));
    console.log('[Vault] Profile added:', profile.label);
    return this.getState().profiles.find((p) => p.id === profile.id) as ProfileInfo;
  }

  /**
   * Re-enter the secret for an existing profile (after a browser restart) —
   * re-encrypts under the current session key.
   */
  async reauthProfile(profileId: string, secret: string): Promise<ProfileInfo> {
    const profile = this.requireProfile(profileId);
    const epoch = this.epoch;
    await this.ensureSessionKey();

    const { ciphertext, iv } = await this.encrypt(secret);
    // A lock() while encrypting must win: don't persist or cache after it.
    if (epoch !== this.epoch) {
      throw new VaultLockedError();
    }
    profile.encryptedSecret = this.arrayToBase64(ciphertext);
    profile.iv = this.arrayToBase64(iv);
    profile.keyId = this.currentKeyId as string;
    profile.lastVerifiedAt = Date.now();
    await this.persist();

    this.decryptedCache.set(profile.id, this.toCredential(profile, secret));
    console.log('[Vault] Profile re-authenticated:', profile.label);
    return this.getState().profiles.find((p) => p.id === profile.id) as ProfileInfo;
  }

  /**
   * Patch non-secret profile fields learned during verification.
   */
  async updateProfile(
    profileId: string,
    patch: { lastVerifiedAt?: number; meta?: ProfileMeta; accountId?: string },
  ): Promise<void> {
    const profile = this.requireProfile(profileId);
    if (patch.lastVerifiedAt !== undefined) profile.lastVerifiedAt = patch.lastVerifiedAt;
    if (patch.meta !== undefined) profile.meta = { ...profile.meta, ...patch.meta };
    if (patch.accountId !== undefined) {
      profile.accountId = patch.accountId;
      // The cached credential embeds accountId — rebuild it on next access.
      this.decryptedCache.delete(profileId);
    }
    await this.persist();
  }

  /**
   * Remove a profile and pick the next active one.
   */
  async removeProfile(profileId: string): Promise<{ activeProfileId: string | null }> {
    this.requireProfile(profileId);
    this.storedVault.profiles = this.storedVault.profiles.filter((p) => p.id !== profileId);
    this.storedVault.activeProfileId = nextActiveAfterRemove(
      this.storedVault.profiles,
      profileId,
      this.storedVault.activeProfileId,
    );
    this.decryptedCache.delete(profileId);
    await this.persist();
    console.log('[Vault] Profile removed');
    return { activeProfileId: this.storedVault.activeProfileId };
  }

  /**
   * Switch the active profile. No verification here.
   */
  async setActiveProfile(profileId: string): Promise<void> {
    this.requireProfile(profileId);
    this.storedVault.activeProfileId = profileId;
    await this.persist();
  }

  /**
   * Sync check: can getCredentials() succeed for this profile right now?
   */
  credentialsAvailable(profileId?: string): boolean {
    const id = profileId ?? this.storedVault.activeProfileId;
    if (!id) return false;
    if (this.decryptedCache.has(id)) return true;
    const profile = this.storedVault.profiles.find((p) => p.id === id);
    if (!profile) return false;
    return !profileNeedsSecret(profile, this.encryptionKey !== null, this.currentKeyId);
  }

  /**
   * Get decrypted credentials for a profile (default: the active one).
   * Decrypts on demand and caches the result for the session.
   */
  async getCredentials(profileId?: string): Promise<CFCredential> {
    const id = profileId ?? this.storedVault.activeProfileId;
    if (!id) {
      throw new VaultLockedError();
    }

    const cached = this.decryptedCache.get(id);
    if (cached) return cached;

    const profile = this.storedVault.profiles.find((p) => p.id === id);
    if (!profile) {
      throw new ProfileNotFoundError(id);
    }
    if (!this.encryptionKey || profileNeedsSecret(profile, true, this.currentKeyId)) {
      throw new VaultLockedError(`Profile "${profile.label}" needs its secret re-entered`);
    }

    const iv = this.base64ToArray(profile.iv);
    const ciphertext = this.base64ToArray(profile.encryptedSecret);
    const epoch = this.epoch;
    const secret = await this.decrypt(ciphertext, iv);

    // A lock() while decrypting must win: never repopulate the cache after it.
    if (epoch !== this.epoch) {
      throw new VaultLockedError();
    }
    // A removeProfile() while decrypting must win too: never recache a removed secret.
    if (!this.storedVault.profiles.some((p) => p.id === id)) {
      throw new ProfileNotFoundError(id);
    }

    const credential = this.toCredential(profile, secret);
    this.decryptedCache.set(id, credential);
    return credential;
  }

  /**
   * Lock vault - clear session key and decrypted secrets.
   * Profile metadata stays; users re-enter one secret to resume.
   */
  async lock(): Promise<void> {
    this.epoch += 1; // invalidate in-flight decrypts / key generations
    this.encryptionKey = null;
    this.currentKeyId = null;
    this.sessionKeyPromise = null;
    this.keyBase64 = null;
    this.keyIdMemory = null;
    this.decryptedCache.clear();
    await sessionStorage.remove([STORAGE_KEY_SESSION, STORAGE_KEY_SESSION_ID]);
    console.log('[Vault] Locked');
  }

  /**
   * Clear all vault data (every profile).
   */
  async clearAll(): Promise<void> {
    await this.lock();
    this.storedVault = emptyVaultV3();
    await chrome.storage.local.remove(STORAGE_KEY_VAULT);
    console.log('[Vault] Cleared');
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private requireProfile(profileId: string): StoredProfile {
    const profile = this.storedVault.profiles.find((p) => p.id === profileId);
    if (!profile) {
      throw new ProfileNotFoundError(profileId);
    }
    return profile;
  }

  private toCredential(profile: StoredProfile, secret: string): CFCredential {
    switch (profile.kind) {
      case 'global-key':
        return { kind: 'global-key', email: profile.email ?? '', secret };
      case 'user-token':
        return { kind: 'user-token', secret };
      case 'account-token':
        return { kind: 'account-token', secret, accountId: profile.accountId ?? '' };
    }
  }

  /**
   * Generate the session AES key lazily (first profile added this session).
   * Memoized: concurrent PROFILE_ADD/PROFILE_REAUTH must share ONE key —
   * two interleaved generations would encrypt profiles under different keys.
   */
  private ensureSessionKey(): Promise<void> {
    if (this.encryptionKey && this.currentKeyId) return Promise.resolve();
    if (!this.sessionKeyPromise) {
      this.sessionKeyPromise = this.createSessionKey().catch((error) => {
        this.sessionKeyPromise = null; // allow a retry after a failure
        throw error;
      });
    }
    return this.sessionKeyPromise;
  }

  private async createSessionKey(): Promise<void> {
    const epoch = this.epoch;
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const keyData = await crypto.subtle.exportKey('raw', key);

    // A lock() while generating must win: don't restore key material after it.
    if (epoch !== this.epoch) {
      throw new VaultLockedError();
    }

    this.encryptionKey = key;
    this.currentKeyId = crypto.randomUUID();
    this.keyBase64 = this.arrayToBase64(new Uint8Array(keyData));
    this.keyIdMemory = this.currentKeyId;
    await sessionStorage.set({
      [STORAGE_KEY_SESSION]: this.keyBase64,
      [STORAGE_KEY_SESSION_ID]: this.currentKeyId,
    });

    // lock() raced the persist above: undo it and report locked.
    if (epoch !== this.epoch) {
      await sessionStorage.remove([STORAGE_KEY_SESSION, STORAGE_KEY_SESSION_ID]);
      this.encryptionKey = null;
      this.currentKeyId = null;
      this.keyBase64 = null;
      this.keyIdMemory = null;
      throw new VaultLockedError();
    }
  }

  private async persist(): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEY_VAULT]: this.storedVault });
  }

  /**
   * Encrypt plaintext using AES-256-GCM.
   */
  private async encrypt(plaintext: string): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
    if (!this.encryptionKey) {
      throw new Error('No encryption key');
    }

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);

    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.encryptionKey, encoded);

    return {
      ciphertext: new Uint8Array(ciphertext),
      iv,
    };
  }

  /**
   * Decrypt ciphertext using AES-256-GCM.
   */
  private async decrypt(ciphertext: Uint8Array, iv: Uint8Array): Promise<string> {
    if (!this.encryptionKey) {
      throw new Error('No encryption key');
    }

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
      this.encryptionKey,
      ciphertext.buffer as ArrayBuffer,
    );

    return new TextDecoder().decode(decrypted);
  }

  /**
   * Convert Uint8Array to base64 string.
   */
  private arrayToBase64(array: Uint8Array): string {
    return btoa(String.fromCharCode(...array));
  }

  /**
   * Convert base64 string to Uint8Array.
   */
  private base64ToArray(base64: string): Uint8Array {
    const binary = atob(base64);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      array[i] = binary.charCodeAt(i);
    }
    return array;
  }
}

// ============================================================================
// Errors
// ============================================================================

export class VaultLockedError extends Error {
  constructor(message = 'Vault is locked - please enter credentials') {
    super(message);
    this.name = 'VaultLockedError';
  }
}

export class ProfileNotFoundError extends Error {
  constructor(profileId: string) {
    super(`Profile not found: ${profileId}`);
    this.name = 'ProfileNotFoundError';
  }
}

export function isProfileNotFoundError(error: unknown): error is ProfileNotFoundError {
  return error instanceof ProfileNotFoundError;
}

// ============================================================================
// Singleton Export
// ============================================================================

export const vault = new Vault();
