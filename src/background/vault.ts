/**
 * Encrypted Vault for Cloudflare credentials.
 *
 * Security:
 * - Argon2id KDF (t=3, m=65536, p=4) for key derivation
 * - AES-256-GCM for encryption
 * - Per-device salt stored in chrome.storage.local
 * - Derived key kept only in memory, cleared on lock
 * - Auto-lock after configurable timeout
 */

import { argon2id } from 'hash-wasm';

// ============================================================================
// Types
// ============================================================================

export interface VaultState {
  isInitialized: boolean;
  isUnlocked: boolean;
  email?: string;
}

export interface Credentials {
  email: string;
  apiKey: string;
}

export interface VaultConfig {
  autoLockTimeoutMs: number;
  lockOnUnload: boolean;
}

interface StoredVault {
  email: string;
  encryptedApiKey: string;
  iv: string;
  salt: string;
  version: 1;
}

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY_VAULT = 'cf_vault';
const STORAGE_KEY_CONFIG = 'cf_vault_config';
const STORAGE_KEY_SESSION = 'cf_vault_session'; // Session storage for SW restart persistence

const DEFAULT_CONFIG: VaultConfig = {
  autoLockTimeoutMs: 15 * 60 * 1000, // 15 minutes
  lockOnUnload: true,
};

// Argon2id parameters (OWASP recommended for interactive login)
const ARGON2_ITERATIONS = 3;
const ARGON2_MEMORY = 65536; // 64 MB
const ARGON2_PARALLELISM = 4;
const ARGON2_HASH_LENGTH = 32; // 256 bits for AES-256

// ============================================================================
// Vault Class
// ============================================================================

export class Vault {
  private derivedKey: CryptoKey | null = null;
  private decryptedCredentials: Credentials | null = null;
  private config: VaultConfig = { ...DEFAULT_CONFIG };
  private autoLockTimer: ReturnType<typeof setTimeout> | null = null;
  private storedVault: StoredVault | null = null;

  /**
   * Initialize vault and load config from storage.
   * Restores unlock state from session storage if SW was restarted.
   */
  async init(): Promise<void> {
    // Load config and vault from local storage
    const stored = await chrome.storage.local.get([STORAGE_KEY_CONFIG, STORAGE_KEY_VAULT]);

    if (stored[STORAGE_KEY_CONFIG]) {
      this.config = { ...DEFAULT_CONFIG, ...stored[STORAGE_KEY_CONFIG] };
    }

    if (stored[STORAGE_KEY_VAULT]) {
      this.storedVault = stored[STORAGE_KEY_VAULT];
    }

    // Try to restore unlock state from session storage (survives SW restart)
    try {
      const session = await chrome.storage.session.get(STORAGE_KEY_SESSION);
      if (session[STORAGE_KEY_SESSION]) {
        const { email, apiKey, derivedKeyHex, salt } = session[STORAGE_KEY_SESSION];

        // Restore credentials
        this.decryptedCredentials = { email, apiKey };

        // Restore derived key
        const keyBytes = this.hexToArray(derivedKeyHex);
        this.derivedKey = await crypto.subtle.importKey(
          'raw',
          keyBytes.buffer as ArrayBuffer,
          { name: 'AES-GCM' },
          false,
          ['encrypt', 'decrypt']
        );

        console.log('[Vault] Restored unlock state from session');
        this.resetAutoLockTimer();
      }
    } catch (error) {
      console.log('[Vault] No session to restore:', error);
    }
  }

  /**
   * Get current vault state.
   */
  getState(): VaultState {
    return {
      isInitialized: this.storedVault !== null,
      isUnlocked: this.derivedKey !== null,
      email: this.storedVault?.email,
    };
  }

  /**
   * Initialize vault with master password and credentials.
   * Called on first setup.
   */
  async initialize(
    masterPassword: string,
    credentials: Credentials
  ): Promise<void> {
    // Generate random salt
    const salt = crypto.getRandomValues(new Uint8Array(16));

    // Derive key using Argon2id
    const derivedKeyBytes = await this.deriveKey(masterPassword, salt);

    // Import as CryptoKey for Web Crypto API
    this.derivedKey = await crypto.subtle.importKey(
      'raw',
      derivedKeyBytes,
      { name: 'AES-GCM' },
      false, // not extractable
      ['encrypt', 'decrypt']
    );

    // Encrypt API key
    const { ciphertext, iv } = await this.encrypt(credentials.apiKey);

    // Store encrypted vault
    this.storedVault = {
      email: credentials.email,
      encryptedApiKey: this.arrayToBase64(ciphertext),
      iv: this.arrayToBase64(iv),
      salt: this.arrayToBase64(salt),
      version: 1,
    };

    await chrome.storage.local.set({
      [STORAGE_KEY_VAULT]: this.storedVault,
    });

    // Keep decrypted credentials in memory
    this.decryptedCredentials = credentials;

    // Save to session storage for SW restart persistence
    await this.saveSession(derivedKeyBytes);

    // Start auto-lock timer
    this.resetAutoLockTimer();
  }

  /**
   * Unlock vault with master password.
   */
  async unlock(masterPassword: string): Promise<boolean> {
    if (!this.storedVault) {
      throw new Error('Vault not initialized');
    }

    const salt = this.base64ToArray(this.storedVault.salt);

    try {
      // Derive key
      const derivedKeyBytes = await this.deriveKey(masterPassword, salt);

      this.derivedKey = await crypto.subtle.importKey(
        'raw',
        derivedKeyBytes,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
      );

      // Try to decrypt - this validates the password
      const iv = this.base64ToArray(this.storedVault.iv);
      const ciphertext = this.base64ToArray(this.storedVault.encryptedApiKey);

      const apiKey = await this.decrypt(ciphertext, iv);

      this.decryptedCredentials = {
        email: this.storedVault.email,
        apiKey,
      };

      // Save to session storage for SW restart persistence
      await this.saveSession(derivedKeyBytes);

      this.resetAutoLockTimer();
      return true;
    } catch {
      // Wrong password - decryption failed
      this.derivedKey = null;
      this.decryptedCredentials = null;
      return false;
    }
  }

  /**
   * Lock vault - clear sensitive data from memory and session.
   */
  async lock(): Promise<void> {
    this.derivedKey = null;
    this.decryptedCredentials = null;

    if (this.autoLockTimer) {
      clearTimeout(this.autoLockTimer);
      this.autoLockTimer = null;
    }

    // Clear session storage
    await chrome.storage.session.remove(STORAGE_KEY_SESSION);
  }

  /**
   * Get decrypted credentials. Throws if locked.
   */
  getCredentials(): Credentials {
    if (!this.decryptedCredentials) {
      throw new VaultLockedError();
    }

    this.resetAutoLockTimer();
    return this.decryptedCredentials;
  }

  /**
   * Check if credentials are available (vault is unlocked).
   */
  hasCredentials(): boolean {
    return this.decryptedCredentials !== null;
  }

  /**
   * Change master password.
   */
  async changePassword(
    oldPassword: string,
    newPassword: string
  ): Promise<boolean> {
    if (!this.storedVault) {
      throw new Error('Vault not initialized');
    }

    // Verify old password
    const unlocked = await this.unlock(oldPassword);
    if (!unlocked) {
      return false;
    }

    // Re-encrypt with new password
    const credentials = this.getCredentials();
    await this.initialize(newPassword, credentials);

    return true;
  }

  /**
   * Update vault configuration.
   */
  async updateConfig(config: Partial<VaultConfig>): Promise<void> {
    this.config = { ...this.config, ...config };
    await chrome.storage.local.set({
      [STORAGE_KEY_CONFIG]: this.config,
    });

    // Reset timer with new timeout
    if (this.derivedKey) {
      this.resetAutoLockTimer();
    }
  }

  /**
   * Get current configuration.
   */
  getConfig(): VaultConfig {
    return { ...this.config };
  }

  /**
   * Clear all vault data.
   */
  async clearAll(): Promise<void> {
    await this.lock();
    this.storedVault = null;
    await chrome.storage.local.remove([
      STORAGE_KEY_VAULT,
      STORAGE_KEY_CONFIG,
    ]);
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Derive key from password using Argon2id.
   */
  private async deriveKey(
    password: string,
    salt: Uint8Array
  ): Promise<ArrayBuffer> {
    const hashHex = await argon2id({
      password,
      salt,
      iterations: ARGON2_ITERATIONS,
      memorySize: ARGON2_MEMORY,
      parallelism: ARGON2_PARALLELISM,
      hashLength: ARGON2_HASH_LENGTH,
      outputType: 'hex',
    });

    // Convert hex string to ArrayBuffer
    const hashArray = new Uint8Array(hashHex.length / 2);
    for (let i = 0; i < hashHex.length; i += 2) {
      hashArray[i / 2] = parseInt(hashHex.substring(i, i + 2), 16);
    }

    return hashArray.buffer as ArrayBuffer;
  }

  /**
   * Encrypt plaintext using AES-256-GCM.
   */
  private async encrypt(
    plaintext: string
  ): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
    if (!this.derivedKey) {
      throw new VaultLockedError();
    }

    const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM
    const encoded = new TextEncoder().encode(plaintext);

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.derivedKey,
      encoded
    );

    return {
      ciphertext: new Uint8Array(ciphertext),
      iv,
    };
  }

  /**
   * Decrypt ciphertext using AES-256-GCM.
   */
  private async decrypt(
    ciphertext: Uint8Array,
    iv: Uint8Array
  ): Promise<string> {
    if (!this.derivedKey) {
      throw new VaultLockedError();
    }

    // Copy to ensure ArrayBuffer type compatibility
    const ciphertextBuffer = new Uint8Array(ciphertext).buffer as ArrayBuffer;
    const ivBuffer = new Uint8Array(iv);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBuffer },
      this.derivedKey,
      ciphertextBuffer
    );

    return new TextDecoder().decode(decrypted);
  }

  /**
   * Reset auto-lock timer.
   */
  private resetAutoLockTimer(): void {
    if (this.autoLockTimer) {
      clearTimeout(this.autoLockTimer);
    }

    if (this.config.autoLockTimeoutMs > 0) {
      this.autoLockTimer = setTimeout(() => {
        this.lock();
        // Notify UI that vault was locked
        chrome.runtime.sendMessage({ type: 'VAULT_LOCKED' }).catch(() => {
          // Panel might not be open, ignore error
        });
      }, this.config.autoLockTimeoutMs);
    }
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

  /**
   * Convert ArrayBuffer to hex string.
   */
  private arrayToHex(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Convert hex string to Uint8Array.
   */
  private hexToArray(hex: string): Uint8Array {
    const array = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      array[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return array;
  }

  /**
   * Save unlock state to session storage (survives SW restart).
   */
  private async saveSession(derivedKeyBytes: ArrayBuffer): Promise<void> {
    if (!this.decryptedCredentials) return;

    await chrome.storage.session.set({
      [STORAGE_KEY_SESSION]: {
        email: this.decryptedCredentials.email,
        apiKey: this.decryptedCredentials.apiKey,
        derivedKeyHex: this.arrayToHex(derivedKeyBytes),
      },
    });
  }
}

// ============================================================================
// Errors
// ============================================================================

export class VaultLockedError extends Error {
  constructor() {
    super('Vault is locked');
    this.name = 'VaultLockedError';
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const vault = new Vault();
