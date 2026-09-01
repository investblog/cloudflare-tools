/**
 * Cloudflare API Client
 *
 * All API requests to Cloudflare go through this client.
 * Credentials are resolved from the vault per call: the active profile by
 * default, a stamped profile for batch operations, or an explicit credential
 * override for pre-store verification.
 */

import type {
  CFAccount,
  CFApiResponse,
  CFPaginationInfo,
  CFTokenVerifyResult,
  CFUser,
  CFZone,
  CreateZoneRequest,
  PurgeCacheResponse,
} from '../shared/types/api';
import { buildAuthHeaders, type CFCredential, type ProfileMeta, verifyPathFor } from '../shared/types/credentials';
import { type CFOperation, type NormalizedError, normalizeError } from '../shared/types/errors';
import { VaultLockedError, vault } from './vault';

// ============================================================================
// Types
// ============================================================================

export interface ListZonesParams {
  accountId?: string;
  name?: string;
  page?: number;
  perPage?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: CFPaginationInfo;
}

export interface CFClientError extends Error {
  normalized: NormalizedError;
  retryAfterMs?: number;
}

interface CFRequestOptions {
  method: 'GET' | 'POST' | 'DELETE' | 'PATCH' | 'PUT';
  endpoint: string;
  body?: unknown;
  timeoutMs?: number;
  op: CFOperation; // drives permission-error recommendations
  credential?: CFCredential; // override (pre-store verification)
  profileId?: string; // batch-stamped profile; default = active
}

// ============================================================================
// Constants
// ============================================================================

const BASE_URL = 'https://api.cloudflare.com/client/v4';
const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds

// ============================================================================
// CF Client Class
// ============================================================================

export class CFClient {
  /**
   * Verify a credential BEFORE it is stored, routing by kind:
   * - global-key  → GET /user
   * - user-token  → GET /user/tokens/verify
   * - account-token → GET /accounts/{id}/tokens/verify
   * Returns non-secret facts for the profile record.
   */
  async verifyCredential(credential: CFCredential): Promise<{ meta: ProfileMeta; lastVerifiedAt: number }> {
    const path = verifyPathFor(credential);

    if (credential.kind === 'global-key') {
      const user = await this.fetchResult<CFUser>({ method: 'GET', endpoint: path, op: 'verify', credential });
      return { meta: { userEmail: user.email }, lastVerifiedAt: Date.now() };
    }

    const result = await this.fetchResult<CFTokenVerifyResult>({
      method: 'GET',
      endpoint: path,
      op: 'verify',
      credential,
    });

    if (result.status !== 'active') {
      const normalized = normalizeError(10001, `Token status is "${result.status}"`, undefined, undefined, 'verify');
      throw this.toClientError(normalized);
    }

    return { meta: { tokenId: result.id }, lastVerifiedAt: Date.now() };
  }

  /**
   * Fetch the authenticated user (global-key / user-token credentials only).
   * Doubles as a credential check — throws on bad credentials.
   */
  async getUser(credential?: CFCredential): Promise<CFUser> {
    return this.fetchResult<CFUser>({ method: 'GET', endpoint: '/user', op: 'verify', credential });
  }

  /**
   * Get all accounts (every page — CF caps per_page at 50).
   * Pass a credential override during profile setup.
   */
  async getAccounts(credential?: CFCredential): Promise<CFAccount[]> {
    const all: CFAccount[] = [];
    let page = 1;
    let totalPages = 1;
    const MAX_ACCOUNT_PAGES = 40; // safety cap: 40 * 50 = 2k accounts

    do {
      const { items, pagination } = await this.fetchPaginated<CFAccount>({
        method: 'GET',
        endpoint: `/accounts?page=${page}&per_page=50`,
        op: 'accounts',
        credential,
      });
      all.push(...items);
      totalPages = pagination.total_pages;
      page += 1;
      if (items.length === 0) break;
    } while (page <= totalPages && page <= MAX_ACCOUNT_PAGES);

    return all;
  }

  /**
   * List zones with optional filtering and pagination.
   */
  async listZones(params: ListZonesParams = {}): Promise<PaginatedResult<CFZone>> {
    const searchParams = new URLSearchParams();

    if (params.accountId) {
      searchParams.set('account.id', params.accountId);
    }
    if (params.name) {
      searchParams.set('name', params.name);
    }
    if (params.page) {
      searchParams.set('page', String(params.page));
    }
    if (params.perPage) {
      searchParams.set('per_page', String(params.perPage));
    }

    const query = searchParams.toString();
    const endpoint = query ? `/zones?${query}` : '/zones';

    return this.fetchPaginated<CFZone>({ method: 'GET', endpoint, op: 'list' });
  }

  /**
   * Check if a zone exists by domain name.
   */
  async checkZoneExists(domain: string): Promise<{ exists: boolean; zoneId?: string }> {
    const result = await this.listZones({ name: domain, perPage: 1 });

    if (result.items.length > 0) {
      return { exists: true, zoneId: result.items[0].id };
    }

    return { exists: false };
  }

  /**
   * Create a new zone.
   */
  async createZone(
    domain: string,
    accountId: string,
    options: { type?: 'full' | 'partial'; jumpStart?: boolean } = {},
    profileId?: string,
  ): Promise<CFZone> {
    const body: CreateZoneRequest = {
      name: domain,
      account: { id: accountId },
      type: options.type ?? 'full',
      jump_start: options.jumpStart ?? true,
    };

    return this.fetchResult<CFZone>({ method: 'POST', endpoint: '/zones', body, op: 'create', profileId });
  }

  /**
   * Delete a zone by ID.
   */
  async deleteZone(zoneId: string, profileId?: string): Promise<void> {
    await this.fetchResult<{ id: string }>({
      method: 'DELETE',
      endpoint: `/zones/${zoneId}`,
      op: 'delete',
      profileId,
    });
  }

  /**
   * Purge all cache for a zone.
   */
  async purgeCacheEverything(zoneId: string, profileId?: string): Promise<PurgeCacheResponse> {
    return this.fetchResult<PurgeCacheResponse>({
      method: 'POST',
      endpoint: `/zones/${zoneId}/purge_cache`,
      body: { purge_everything: true },
      op: 'purge',
      profileId,
    });
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * The single authenticated request path: timeout, security headers,
   * CF-envelope success check, error normalization.
   */
  private async request<T>(opts: CFRequestOptions): Promise<CFApiResponse<T>> {
    const credential = opts.credential ?? (await vault.getCredentials(opts.profileId));
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    // AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const options: RequestInit = {
      method: opts.method,
      headers: {
        ...buildAuthHeaders(credential),
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      // Security hardening
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    };

    if (opts.body) {
      options.body = JSON.stringify(opts.body);
    }

    try {
      const response = await fetch(`${BASE_URL}${opts.endpoint}`, options);
      const data: CFApiResponse<T> = await response.json();

      if (!data.success) {
        const error = data.errors[0];
        const retryAfterHeader = response.headers.get('Retry-After');

        // Extract detailed message from error_chain if available
        const detailedMessage = error?.error_chain?.[0]?.message ?? error?.message ?? 'Unknown error';

        const normalized = normalizeError(
          error?.code ?? response.status,
          detailedMessage,
          retryAfterHeader ?? undefined,
          response.status,
          opts.op,
        );

        throw this.toClientError(normalized);
      }

      return data;
    } catch (err) {
      // Handle abort/timeout
      if (err instanceof Error && err.name === 'AbortError') {
        const normalized = normalizeError('TIMEOUT', `Request timed out after ${timeoutMs}ms`);
        throw this.toClientError(normalized);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async fetchResult<T>(opts: CFRequestOptions): Promise<T> {
    const data = await this.request<T>(opts);
    return data.result;
  }

  private async fetchPaginated<T>(opts: CFRequestOptions): Promise<PaginatedResult<T>> {
    const data = await this.request<T[]>(opts);
    return {
      items: data.result,
      pagination: data.result_info ?? {
        page: 1,
        per_page: data.result.length,
        count: data.result.length,
        total_count: data.result.length,
        total_pages: 1,
      },
    };
  }

  private toClientError(normalized: NormalizedError): CFClientError {
    const cfError = new Error(normalized.message) as CFClientError;
    cfError.name = 'CFClientError';
    cfError.normalized = normalized;
    cfError.retryAfterMs = normalized.retryAfterMs;
    return cfError;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if an error is a CFClientError.
 */
export function isCFClientError(error: unknown): error is CFClientError {
  return error instanceof Error && 'normalized' in error && typeof (error as CFClientError).normalized === 'object';
}

/**
 * Check if an error is a VaultLockedError.
 */
export function isVaultLockedError(error: unknown): error is VaultLockedError {
  return error instanceof VaultLockedError;
}

// ============================================================================
// Singleton Export
// ============================================================================

export const cfClient = new CFClient();
