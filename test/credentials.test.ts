import { describe, expect, it } from 'vitest';
import {
  buildAuthHeaders,
  defaultProfileLabel,
  detectCredentialKind,
  verifyPathFor,
} from '../src/shared/types/credentials';

describe('detectCredentialKind', () => {
  it('detects prefixed secrets', () => {
    expect(detectCredentialKind('cfut_abc123')).toBe('user-token');
    expect(detectCredentialKind('cfat_abc123')).toBe('account-token');
    expect(detectCredentialKind('cfk_abc123')).toBe('global-key');
  });

  it('detects the legacy 37-hex Global API Key', () => {
    expect(detectCredentialKind('c2547eb745079dac9320b638f5e225cf483cc')).toBe('global-key');
  });

  it('trims surrounding whitespace', () => {
    expect(detectCredentialKind('  cfut_abc123\n')).toBe('user-token');
    expect(detectCredentialKind(' c2547eb745079dac9320b638f5e225cf483cc ')).toBe('global-key');
  });

  it('returns unknown for everything else', () => {
    // 36 hex / 38 hex
    expect(detectCredentialKind('c2547eb745079dac9320b638f5e225cf483c')).toBe('unknown');
    expect(detectCredentialKind('c2547eb745079dac9320b638f5e225cf483cc1')).toBe('unknown');
    // uppercase hex
    expect(detectCredentialKind('C2547EB745079DAC9320B638F5E225CF483CC')).toBe('unknown');
    // legacy unprefixed API token (40-char base62)
    expect(detectCredentialKind('YQSn-xWAQiiEh9qM58wZNnyQS7FUdoqGIUAbrh7T')).toBe('unknown');
    // empty
    expect(detectCredentialKind('')).toBe('unknown');
  });
});

describe('buildAuthHeaders', () => {
  it('global-key uses X-Auth headers only', () => {
    const headers = buildAuthHeaders({ kind: 'global-key', email: 'a@b.c', secret: 'key123' });
    expect(headers).toEqual({ 'X-Auth-Email': 'a@b.c', 'X-Auth-Key': 'key123' });
    expect(headers.Authorization).toBeUndefined();
  });

  it('tokens use Bearer only', () => {
    for (const credential of [
      { kind: 'user-token' as const, secret: 'cfut_x' },
      { kind: 'account-token' as const, secret: 'cfat_x', accountId: 'acc1' },
    ]) {
      const headers = buildAuthHeaders(credential);
      expect(headers).toEqual({ Authorization: `Bearer ${credential.secret}` });
      expect(headers['X-Auth-Email']).toBeUndefined();
      expect(headers['X-Auth-Key']).toBeUndefined();
    }
  });
});

describe('verifyPathFor', () => {
  it('maps each kind to its endpoint', () => {
    expect(verifyPathFor({ kind: 'global-key', email: 'a@b.c', secret: 's' })).toBe('/user');
    expect(verifyPathFor({ kind: 'user-token', secret: 's' })).toBe('/user/tokens/verify');
    expect(verifyPathFor({ kind: 'account-token', secret: 's', accountId: 'abc123' })).toBe(
      '/accounts/abc123/tokens/verify',
    );
  });
});

describe('defaultProfileLabel', () => {
  it('global-key prefers verified user email, then form email', () => {
    expect(defaultProfileLabel('global-key', { userEmail: 'real@cf.com' }, 'form@x.y')).toBe('real@cf.com');
    expect(defaultProfileLabel('global-key', {}, 'form@x.y')).toBe('form@x.y');
    expect(defaultProfileLabel('global-key', {})).toBe('Global API Key');
  });

  it('account-token prefers account name, then token id', () => {
    expect(defaultProfileLabel('account-token', { accountName: 'Prod', tokenId: 'deadbeef99' })).toBe('Prod');
    expect(defaultProfileLabel('account-token', { tokenId: 'deadbeef99' })).toBe('Account token deadbeef');
  });

  it('user-token uses token id', () => {
    expect(defaultProfileLabel('user-token', { tokenId: 'deadbeef99' })).toBe('API token deadbeef');
    expect(defaultProfileLabel('user-token', {})).toBe('API token');
  });
});
