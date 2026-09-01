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

export type ErrorCategory = 'auth' | 'rate_limit' | 'validation' | 'dependency' | 'network' | 'permission' | 'unknown';

/** The high-level operation a request belongs to — drives permission recommendations. */
export type CFOperation = 'verify' | 'accounts' | 'list' | 'create' | 'delete' | 'purge';

export const PERMISSION_RECOMMENDATIONS: Record<CFOperation, string> = {
  verify: 'This credential cannot be verified — check the token status and scopes',
  accounts: 'Token lacks "Account Settings: Read" — add it, or enter the Account ID manually',
  list: 'Token lacks "Zone: Read" for this account',
  create: 'Token lacks "Zone: Edit" on account resources (required to create zones)',
  delete: 'Token lacks "Zone: Edit" for this zone',
  purge: 'Token lacks "Cache Purge: Purge" (or "Zone: Edit") for this zone',
};

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
  // Auth errors (various codes CF uses for credential issues)
  INVALID_CREDENTIALS: 10000,
  INVALID_TOKEN: 10001,
  INVALID_REQUEST_HEADERS: 6003,
  INVALID_AUTH_KEY_FORMAT: 6100,
  INVALID_AUTH_EMAIL_FORMAT: 6101,
  MISSING_AUTH_EMAIL: 6102,
  MISSING_AUTH_KEY: 6103,
  UNKNOWN_AUTH_KEY: 9103,
  INVALID_AUTH_HEADER: 9106,

  // Token lacks the required permission for the attempted operation
  TOKEN_MISSING_PERMISSION: 9109,

  // Validation errors
  ZONE_ALREADY_EXISTS: 1061,
  INVALID_ZONE_NAME: 1003,

  // Dependency errors
  ZONE_HAS_SUBSCRIPTION: 1099,

  // Rate limit
  RATE_LIMITED: 429,
} as const;

/**
 * Auth-related error codes
 */
const AUTH_ERROR_CODES: Set<number> = new Set([
  CF_ERROR_CODES.INVALID_CREDENTIALS,
  CF_ERROR_CODES.INVALID_TOKEN,
  CF_ERROR_CODES.INVALID_REQUEST_HEADERS,
  CF_ERROR_CODES.INVALID_AUTH_KEY_FORMAT,
  CF_ERROR_CODES.INVALID_AUTH_EMAIL_FORMAT,
  CF_ERROR_CODES.MISSING_AUTH_EMAIL,
  CF_ERROR_CODES.MISSING_AUTH_KEY,
  CF_ERROR_CODES.UNKNOWN_AUTH_KEY,
  CF_ERROR_CODES.INVALID_AUTH_HEADER,
]);

/**
 * Codes that unambiguously mean bad key material / malformed auth headers —
 * these stay `auth` even when transported over HTTP 403.
 */
const KEY_MATERIAL_ERROR_CODES: Set<number> = new Set([
  CF_ERROR_CODES.INVALID_TOKEN,
  CF_ERROR_CODES.INVALID_REQUEST_HEADERS,
  CF_ERROR_CODES.INVALID_AUTH_KEY_FORMAT,
  CF_ERROR_CODES.INVALID_AUTH_EMAIL_FORMAT,
  CF_ERROR_CODES.MISSING_AUTH_EMAIL,
  CF_ERROR_CODES.MISSING_AUTH_KEY,
  CF_ERROR_CODES.UNKNOWN_AUTH_KEY,
  CF_ERROR_CODES.INVALID_AUTH_HEADER,
]);

/**
 * Map CF error code to normalized error.
 *
 * `httpStatus` and `operation` are optional so existing call sites keep working;
 * pass them to get the `permission` category and per-operation recommendations.
 */
export function normalizeError(
  code: number | string,
  message: string,
  retryAfterHeader?: string,
  httpStatus?: number,
  operation?: CFOperation,
): NormalizedError {
  const retryAfterMs = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : undefined;

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

  // Permission errors: code 9109 is CF's "token not authorized for this
  // resource"; an HTTP 403 whose code is not clearly bad key material (9103
  // unknown key, 6100..6103 malformed headers, ...) also means a scope
  // problem — including the generic 10000 "Authentication error" that CF
  // reuses for authorization failures. Pinned by tests; revisit after live
  // testing against real tokens.
  if (
    numCode === CF_ERROR_CODES.TOKEN_MISSING_PERMISSION ||
    (httpStatus === 403 && !KEY_MATERIAL_ERROR_CODES.has(numCode))
  ) {
    return {
      category: 'permission',
      code: numCode,
      message,
      recommendation: PERMISSION_RECOMMENDATIONS[operation ?? 'verify'],
      retryable: false,
    };
  }

  // Auth errors (check against all known auth codes)
  if (AUTH_ERROR_CODES.has(numCode)) {
    return {
      category: 'auth',
      code: numCode,
      message,
      recommendation: 'Check your API credentials (key or token), or re-add this profile',
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

  // Unknown
  return {
    category: 'unknown',
    code: numCode,
    message,
    recommendation: 'An unexpected error occurred',
    retryable: false,
  };
}
