/**
 * Cloudflare API Client
 *
 * All API requests to Cloudflare go through this client.
 * Credentials are retrieved from the vault.
 */

import type {
  CFUser,
  CFAccount,
  CFZone,
  CFApiResponse,
  CFPaginationInfo,
  CreateZoneRequest,
  PurgeCacheResponse,
} from '../shared/types/api';
import { normalizeError, type NormalizedError } from '../shared/types/errors';
import { vault, VaultLockedError } from './vault';

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
   * Verify credentials by fetching user info.
   */
  async verifyCredentials(): Promise<CFUser> {
    const response = await this.fetch<CFUser>('GET', '/user');
    return response;
  }

  /**
   * Get all accounts for the authenticated user.
   */
  async getAccounts(): Promise<CFAccount[]> {
    const response = await this.fetch<CFAccount[]>('GET', '/accounts');
    return response;
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

    const response = await this.fetchWithPagination<CFZone>(endpoint);
    return response;
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
    options: { type?: 'full' | 'partial'; jumpStart?: boolean } = {}
  ): Promise<CFZone> {
    const body: CreateZoneRequest = {
      name: domain,
      account: { id: accountId },
      type: options.type ?? 'full',
      jump_start: options.jumpStart ?? true,
    };

    const response = await this.fetch<CFZone>('POST', '/zones', body);
    return response;
  }

  /**
   * Delete a zone by ID.
   */
  async deleteZone(zoneId: string): Promise<void> {
    await this.fetch<{ id: string }>('DELETE', `/zones/${zoneId}`);
  }

  /**
   * Purge all cache for a zone.
   */
  async purgeCacheEverything(zoneId: string): Promise<PurgeCacheResponse> {
    const response = await this.fetch<PurgeCacheResponse>(
      'POST',
      `/zones/${zoneId}/purge_cache`,
      { purge_everything: true }
    );
    return response;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Make an authenticated request to Cloudflare API.
   * Includes timeout, security headers, and proper error handling.
   */
  private async fetch<T>(
    method: 'GET' | 'POST' | 'DELETE' | 'PATCH' | 'PUT',
    endpoint: string,
    body?: unknown,
    timeoutMs: number = DEFAULT_TIMEOUT_MS
  ): Promise<T> {
    const credentials = vault.getCredentials();

    // AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const headers: HeadersInit = {
      'X-Auth-Email': credentials.email,
      'X-Auth-Key': credentials.apiKey,
      'Content-Type': 'application/json',
    };

    const options: RequestInit = {
      method,
      headers,
      signal: controller.signal,
      // Security hardening
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, options);
      const data: CFApiResponse<T> = await response.json();

      if (!data.success) {
        const error = data.errors[0];
        const retryAfterHeader = response.headers.get('Retry-After');
        const normalized = normalizeError(
          error?.code ?? response.status,
          error?.message ?? 'Unknown error',
          retryAfterHeader ?? undefined
        );

        const cfError = new Error(normalized.message) as CFClientError;
        cfError.name = 'CFClientError';
        cfError.normalized = normalized;
        cfError.retryAfterMs = normalized.retryAfterMs;

        throw cfError;
      }

      return data.result;
    } catch (err) {
      // Handle abort/timeout
      if (err instanceof Error && err.name === 'AbortError') {
        const normalized = normalizeError(
          'TIMEOUT',
          `Request timed out after ${timeoutMs}ms`
        );
        const cfError = new Error(normalized.message) as CFClientError;
        cfError.name = 'CFClientError';
        cfError.normalized = normalized;
        throw cfError;
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Fetch with pagination info.
   * Includes timeout and security headers.
   */
  private async fetchWithPagination<T>(
    endpoint: string,
    timeoutMs: number = DEFAULT_TIMEOUT_MS
  ): Promise<PaginatedResult<T>> {
    const credentials = vault.getCredentials();

    // AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const headers: HeadersInit = {
      'X-Auth-Email': credentials.email,
      'X-Auth-Key': credentials.apiKey,
      'Content-Type': 'application/json',
    };

    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        method: 'GET',
        headers,
        signal: controller.signal,
        // Security hardening
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
      });

      const data: CFApiResponse<T[]> = await response.json();

      if (!data.success) {
        const error = data.errors[0];
        const retryAfterHeader = response.headers.get('Retry-After');
        const normalized = normalizeError(
          error?.code ?? response.status,
          error?.message ?? 'Unknown error',
          retryAfterHeader ?? undefined
        );

        const cfError = new Error(normalized.message) as CFClientError;
        cfError.name = 'CFClientError';
        cfError.normalized = normalized;
        cfError.retryAfterMs = normalized.retryAfterMs;

        throw cfError;
      }

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
    } catch (err) {
      // Handle abort/timeout
      if (err instanceof Error && err.name === 'AbortError') {
        const normalized = normalizeError(
          'TIMEOUT',
          `Request timed out after ${timeoutMs}ms`
        );
        const cfError = new Error(normalized.message) as CFClientError;
        cfError.name = 'CFClientError';
        cfError.normalized = normalized;
        throw cfError;
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if an error is a CFClientError.
 */
export function isCFClientError(error: unknown): error is CFClientError {
  return (
    error instanceof Error &&
    'normalized' in error &&
    typeof (error as CFClientError).normalized === 'object'
  );
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
