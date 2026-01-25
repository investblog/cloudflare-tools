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
  code: number | string,
  message: string,
  retryAfterHeader?: string
): NormalizedError {
  const retryAfterMs = retryAfterHeader
    ? parseInt(retryAfterHeader, 10) * 1000
    : undefined;

  // Timeout error
  if (code === 'TIMEOUT') {
    return {
      category: 'network',
      code: 0,
      message,
      recommendation: 'Request timed out, retrying...',
      retryable: true,
    };
  }

  // Ensure code is a number for remaining checks
  const numCode = typeof code === 'number' ? code : parseInt(code, 10) || 0;

  // Auth errors
  if (numCode === CF_ERROR_CODES.INVALID_CREDENTIALS || numCode === CF_ERROR_CODES.INVALID_TOKEN) {
    return {
      category: 'auth',
      code: numCode,
      message,
      recommendation: 'Check your email and Global API Key',
      retryable: false,
    };
  }

  // Rate limit
  if (numCode === CF_ERROR_CODES.RATE_LIMITED) {
    return {
      category: 'rate_limit',
      code: numCode,
      message: message || 'Rate limited',
      recommendation: 'Waiting for rate limit to reset...',
      retryable: true,
      retryAfterMs: retryAfterMs || 60000,
    };
  }

  // Validation - zone exists
  if (numCode === CF_ERROR_CODES.ZONE_ALREADY_EXISTS) {
    return {
      category: 'validation',
      code: numCode,
      message,
      recommendation: 'Zone already exists in this account',
      retryable: false,
    };
  }

  // Dependency - subscription
  if (numCode === CF_ERROR_CODES.ZONE_HAS_SUBSCRIPTION) {
    return {
      category: 'dependency',
      code: numCode,
      message,
      recommendation: 'Remove subscriptions in Cloudflare Dashboard first',
      retryable: false,
    };
  }

  // Network errors (5xx)
  if (numCode >= 500 && numCode < 600) {
    return {
      category: 'network',
      code: numCode,
      message: message || 'Server error',
      recommendation: 'Retrying automatically...',
      retryable: true,
    };
  }

  // Permission errors
  if (numCode === CF_ERROR_CODES.INVALID_TOKEN) {
    return {
      category: 'permission',
      code: numCode,
      message,
      recommendation: 'API key lacks required permissions',
      retryable: false,
    };
  }

  // Unknown
  return {
    category: 'unknown',
    code: numCode,
    message,
    recommendation: 'An unexpected error occurred',
    retryable: false,
  };
}
