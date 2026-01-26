/**
 * Session-only Vault for Cloudflare credentials.
 *
 * Security model:
 * - Random AES-256 key generated on setup
 * - Encrypted credentials stored in chrome.storage.local
 * - Encryption key stored in chrome.storage.session (cleared on browser close)
 * - No passwords needed - simpler UX, same security isolation
 *
 * Flow:
 * - Browser start: User enters email + API key
 * - During session: Credentials available automatically
 * - Browser close: Session cleared, need to re-enter credentials
 */

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

interface StoredVault {
  email: string;
  encryptedApiKey: string;
  iv: string;
  version: 2; // v2 = session-only
}

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY_VAULT = 'cf_vault';
const STORAGE_KEY_SESSION = 'cf_vault_key';

// ============================================================================
// Vault Class
// ============================================================================

export class Vault {
  private encryptionKey: CryptoKey | null = null;
  private credentials: Credentials | null = null;
  private storedVault: StoredVault | null = null;

  /**
   * Initialize vault - restore from session if available.
   */
  async init(): Promise<void> {
    // Load stored vault from local storage
    const local = await chrome.storage.local.get(STORAGE_KEY_VAULT);
    if (local[STORAGE_KEY_VAULT]) {
      this.storedVault = local[STORAGE_KEY_VAULT];
    }

    // Try to restore key from session storage
    const session = await chrome.storage.session.get(STORAGE_KEY_SESSION);
    if (session[STORAGE_KEY_SESSION] && this.storedVault) {
      try {
        const keyData = this.base64ToArray(session[STORAGE_KEY_SESSION]);
        this.encryptionKey = await crypto.subtle.importKey(
          'raw',
          keyData.buffer as ArrayBuffer,
          { name: 'AES-GCM' },
          false,
          ['encrypt', 'decrypt']
        );

        // Decrypt credentials
        const iv = this.base64ToArray(this.storedVault.iv);
        const ciphertext = this.base64ToArray(this.storedVault.encryptedApiKey);
        const apiKey = await this.decrypt(ciphertext, iv);

        this.credentials = {
          email: this.storedVault.email,
          apiKey,
        };

        console.log('[Vault] Restored from session');
      } catch (error) {
        console.log('[Vault] Failed to restore from session:', error);
        // Clear invalid session
        await chrome.storage.session.remove(STORAGE_KEY_SESSION);
        this.encryptionKey = null;
        this.credentials = null;
      }
    }
  }

  /**
   * Get current vault state.
   */
  getState(): VaultState {
    return {
      isInitialized: this.storedVault !== null,
      isUnlocked: this.credentials !== null,
      email: this.credentials?.email ?? this.storedVault?.email,
    };
  }

  /**
   * Setup vault with credentials.
   * Generates random encryption key and stores encrypted credentials.
   */
  async setup(credentials: Credentials): Promise<void> {
    // Generate random AES-256 key
    this.encryptionKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true, // extractable for storage
      ['encrypt', 'decrypt']
    );

    // Export key for session storage
    const keyData = await crypto.subtle.exportKey('raw', this.encryptionKey);
    await chrome.storage.session.set({
      [STORAGE_KEY_SESSION]: this.arrayToBase64(new Uint8Array(keyData)),
    });

    // Encrypt API key
    const { ciphertext, iv } = await this.encrypt(credentials.apiKey);

    // Store encrypted vault
    this.storedVault = {
      email: credentials.email,
      encryptedApiKey: this.arrayToBase64(ciphertext),
      iv: this.arrayToBase64(iv),
      version: 2,
    };

    await chrome.storage.local.set({
      [STORAGE_KEY_VAULT]: this.storedVault,
    });

    // Keep credentials in memory
    this.credentials = credentials;

    console.log('[Vault] Setup complete');
  }

  /**
   * Lock vault - clear session data.
   * User will need to re-enter credentials.
   */
  async lock(): Promise<void> {
    this.encryptionKey = null;
    this.credentials = null;
    await chrome.storage.session.remove(STORAGE_KEY_SESSION);
    console.log('[Vault] Locked');
  }

  /**
   * Clear all vault data.
   */
  async clearAll(): Promise<void> {
    await this.lock();
    this.storedVault = null;
    await chrome.storage.local.remove(STORAGE_KEY_VAULT);
    console.log('[Vault] Cleared');
  }

  /**
   * Get decrypted credentials. Throws if not available.
   */
  getCredentials(): Credentials {
    if (!this.credentials) {
      throw new VaultLockedError();
    }
    return this.credentials;
  }

  /**
   * Check if credentials are available.
   */
  hasCredentials(): boolean {
    return this.credentials !== null;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Encrypt plaintext using AES-256-GCM.
   */
  private async encrypt(
    plaintext: string
  ): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
    if (!this.encryptionKey) {
      throw new Error('No encryption key');
    }

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.encryptionKey,
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
  private async decrypt(ciphertext: Uint8Array, iv: Uint8Array): Promise<string> {
    if (!this.encryptionKey) {
      throw new Error('No encryption key');
    }

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
      this.encryptionKey,
      ciphertext.buffer as ArrayBuffer
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
  constructor() {
    super('Vault is locked - please enter credentials');
    this.name = 'VaultLockedError';
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const vault = new Vault();
