/**
 * Credential kinds and pure helpers for the multi-profile vault (v0.2.0).
 *
 * Three ways to authenticate against the Cloudflare API:
 * - Global API Key (legacy 37-hex or `cfk_` prefix): X-Auth-Email + X-Auth-Key, needs email.
 * - User API token (`cfut_`): Authorization: Bearer.
 * - Account-owned token (`cfat_`): Authorization: Bearer, scoped to a single account.
 *
 * Everything in this module is pure (no browser APIs) so it is unit-testable in node.
 */

export type CredentialKind = 'global-key' | 'user-token' | 'account-token';

export interface GlobalKeyCredential {
  kind: 'global-key';
  email: string;
  secret: string;
}

export interface UserTokenCredential {
  kind: 'user-token';
  secret: string;
}

export interface AccountTokenCredential {
  kind: 'account-token';
  secret: string;
  accountId: string;
}

export type CFCredential = GlobalKeyCredential | UserTokenCredential | AccountTokenCredential;

/** Non-secret facts learned during credential verification. */
export interface ProfileMeta {
  userEmail?: string; // global-key: from GET /user
  tokenId?: string; // tokens: id from tokens/verify (not a secret)
  accountName?: string; // account-token: from GET /accounts when discovery worked
}

/** Safe-to-broadcast profile shape (no ciphertext, no secret). */
export interface ProfileInfo {
  id: string;
  label: string;
  kind: CredentialKind;
  email?: string; // global-key only
  accountId?: string; // account-token only
  createdAt: number;
  lastVerifiedAt?: number;
  meta?: ProfileMeta;
  needsSecret: boolean; // cannot decrypt under the current session key
}

/**
 * Detect the credential kind from the secret itself.
 *
 * New-format Cloudflare secrets carry a prefix (`cfk_` / `cfut_` / `cfat_`);
 * a bare 37-char lowercase-hex string is the legacy Global API Key. Anything
 * else (including legacy unprefixed API tokens) is 'unknown' — the UI then
 * shows a "Treat as..." kind selector.
 */
export function detectCredentialKind(secret: string): CredentialKind | 'unknown' {
  const s = secret.trim();
  if (s.startsWith('cfut_')) return 'user-token';
  if (s.startsWith('cfat_')) return 'account-token';
  if (s.startsWith('cfk_')) return 'global-key';
  if (/^[0-9a-f]{37}$/.test(s)) return 'global-key'; // legacy Global API Key
  return 'unknown';
}

/**
 * Auth-only headers for a credential. Content-Type stays in cf-client.
 */
export function buildAuthHeaders(credential: CFCredential): Record<string, string> {
  if (credential.kind === 'global-key') {
    return {
      'X-Auth-Email': credential.email,
      'X-Auth-Key': credential.secret,
    };
  }
  return { Authorization: `Bearer ${credential.secret}` };
}

/**
 * Verification endpoint for a credential.
 */
export function verifyPathFor(credential: CFCredential): string {
  switch (credential.kind) {
    case 'global-key':
      return '/user';
    case 'user-token':
      return '/user/tokens/verify';
    case 'account-token':
      return `/accounts/${credential.accountId}/tokens/verify`;
  }
}

/**
 * Human-readable default label for a freshly added profile.
 */
export function defaultProfileLabel(kind: CredentialKind, meta: ProfileMeta, email?: string): string {
  const tokenId8 = meta.tokenId?.slice(0, 8) ?? '';
  switch (kind) {
    case 'global-key':
      return meta.userEmail ?? email ?? 'Global API Key';
    case 'account-token':
      return meta.accountName ?? `Account token ${tokenId8}`.trim();
    case 'user-token':
      return `API token ${tokenId8}`.trim();
  }
}
