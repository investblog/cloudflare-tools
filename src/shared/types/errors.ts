/**
 * Error Taxonomy for Cloudflare API responses
 *
 * Categories:
 * - Auth: Invalid credentials or token
 * - RateLimit: 429, should retry with Retry-After
 * - Validation: Domain already exists, invalid input
 * - Dependency: Zone has subscriptions, cannot delete
 * - Network: Timeout, 5xx errors
 * - Permission: Token lacks required scopes
 */

export type ErrorCategory =
  | 'auth'
  | 'rate_limit'
  | 'validation'
  | 'dependency'
  | 'network'
  | 'permission'
  | 'unknown';

export interface NormalizedError {
  category: ErrorCategory;
  code: number;
  message: string;
  recommendation: string;
  retryable: boolean;
  retryAfterMs?: number;
}

/**
 * Known Cloudflare error codes
 */
export const CF_ERROR_CODES = {
  // Auth errors
  INVALID_CREDENTIALS: 10000,
  INVALID_TOKEN: 10001,

  // Validation errors
  ZONE_ALREADY_EXISTS: 1061,
  INVALID_ZONE_NAME: 1003,

  // Dependency errors
  ZONE_HAS_SUBSCRIPTION: 1099,

  // Rate limit
  RATE_LIMITED: 429,
} as const;

/**
 * Map CF error code to normalized error
 */
export function normalizeError(
  code: number,
  message: string,
  retryAfterHeader?: string
): NormalizedError {
  const retryAfterMs = retryAfterHeader
    ? parseInt(retryAfterHeader, 10) * 1000
    : undefined;

  // Auth errors
  if (code === CF_ERROR_CODES.INVALID_CREDENTIALS || code === CF_ERROR_CODES.INVALID_TOKEN) {
    return {
      category: 'auth',
      code,
      message,
      recommendation: 'Check your email and Global API Key',
      retryable: false,
    };
  }

  // Rate limit
  if (code === CF_ERROR_CODES.RATE_LIMITED) {
    return {
      category: 'rate_limit',
      code,
      message: message || 'Rate limited',
      recommendation: 'Waiting for rate limit to reset...',
      retryable: true,
      retryAfterMs: retryAfterMs || 60000,
    };
  }

  // Validation - zone exists
  if (code === CF_ERROR_CODES.ZONE_ALREADY_EXISTS) {
    return {
      category: 'validation',
      code,
      message,
      recommendation: 'Zone already exists in this account',
      retryable: false,
    };
  }

  // Dependency - subscription
  if (code === CF_ERROR_CODES.ZONE_HAS_SUBSCRIPTION) {
    return {
      category: 'dependency',
      code,
      message,
      recommendation: 'Remove subscriptions in Cloudflare Dashboard first',
      retryable: false,
    };
  }

  // Network errors (5xx)
  if (code >= 500 && code < 600) {
    return {
      category: 'network',
      code,
      message: message || 'Server error',
      recommendation: 'Retrying automatically...',
      retryable: true,
    };
  }

  // Permission errors
  if (code === CF_ERROR_CODES.INVALID_TOKEN) {
    return {
      category: 'permission',
      code,
      message,
      recommendation: 'API key lacks required permissions',
      retryable: false,
    };
  }

  // Unknown
  return {
    category: 'unknown',
    code,
    message,
    recommendation: 'An unexpected error occurred',
    retryable: false,
  };
}
