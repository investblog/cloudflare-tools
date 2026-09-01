import { describe, expect, it } from 'vitest';
import { CF_ERROR_CODES, normalizeError, PERMISSION_RECOMMENDATIONS } from '../src/shared/types/errors';

describe('normalizeError — permission branch', () => {
  it('code 9109 is permission regardless of HTTP status', () => {
    expect(normalizeError(9109, 'not authorized').category).toBe('permission');
    expect(normalizeError(9109, 'not authorized', undefined, 400).category).toBe('permission');
  });

  it('HTTP 403 with generic code 10000 is permission (authorization, not authentication)', () => {
    const e = normalizeError(10000, 'Authentication error', undefined, 403);
    expect(e.category).toBe('permission');
    expect(e.retryable).toBe(false);
  });

  it('HTTP 403 with key-material codes stays auth (bad key, not missing scope)', () => {
    expect(normalizeError(9103, 'Unknown X-Auth-Key', undefined, 403).category).toBe('auth');
    expect(normalizeError(6103, 'Missing X-Auth-Key', undefined, 403).category).toBe('auth');
    // 10001 = INVALID_TOKEN: replace the credential, not the scopes
    expect(normalizeError(10001, 'Invalid token', undefined, 403).category).toBe('auth');
  });

  it('code 10000 without 403 stays auth', () => {
    expect(normalizeError(10000, 'Authentication error', undefined, 401).category).toBe('auth');
    expect(normalizeError(10000, 'Authentication error').category).toBe('auth');
  });

  it('picks the per-operation recommendation, defaulting to verify', () => {
    for (const op of ['verify', 'accounts', 'list', 'create', 'delete', 'purge'] as const) {
      expect(normalizeError(9109, 'x', undefined, 403, op).recommendation).toBe(PERMISSION_RECOMMENDATIONS[op]);
    }
    expect(normalizeError(9109, 'x').recommendation).toBe(PERMISSION_RECOMMENDATIONS.verify);
  });
});

describe('normalizeError — auth recommendation', () => {
  it('no longer assumes a Global API Key', () => {
    const e = normalizeError(CF_ERROR_CODES.INVALID_CREDENTIALS, 'bad');
    expect(e.category).toBe('auth');
    expect(e.recommendation).not.toMatch(/Global/);
    expect(e.recommendation).not.toMatch(/email/);
  });
});

describe('normalizeError — regressions', () => {
  it('TIMEOUT is retryable network', () => {
    const e = normalizeError('TIMEOUT', 'Request timed out after 30000ms');
    expect(e.category).toBe('network');
    expect(e.retryable).toBe(true);
  });

  it('429 parses Retry-After seconds to ms and defaults to 60s', () => {
    expect(normalizeError(429, 'slow down', '12').retryAfterMs).toBe(12000);
    expect(normalizeError(429, 'slow down').retryAfterMs).toBe(60000);
    expect(normalizeError(429, 'slow down').category).toBe('rate_limit');
  });

  it('1061 zone exists is validation, not retryable', () => {
    const e = normalizeError(1061, 'already exists');
    expect(e.category).toBe('validation');
    expect(e.retryable).toBe(false);
  });

  it('1099 subscription is dependency', () => {
    expect(normalizeError(1099, 'has subscription').category).toBe('dependency');
  });

  it('5xx is retryable network', () => {
    const e = normalizeError(502, 'bad gateway');
    expect(e.category).toBe('network');
    expect(e.retryable).toBe(true);
  });

  it('anything else is unknown', () => {
    expect(normalizeError(1234, 'meh').category).toBe('unknown');
  });
});
