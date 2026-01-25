/**
 * Domain Parser
 * Extracts and validates domain names from arbitrary text input.
 *
 * Handles:
 * - ASCII domains (example.com)
 * - Punycode domains (xn--d1acufc.xn--p1ai)
 * - Unicode/IDN domains (домен.рф, müller.de)
 * - URLs (extracts domain from https://example.com/path)
 * - Trailing dots (example.com. → example.com)
 */

import { encodeDomain, isUnicode } from './idn';

/**
 * Regex for extracting ASCII domain names from text.
 * Matches: example.com, xn--domain.net, sub.domain.co.uk
 */
const ASCII_DOMAIN_REGEX = /\b((?=[a-z0-9-]{1,63}\.)(?:xn--)?[a-z0-9]+(?:-[a-z0-9]+)*\.)+(?:xn--)?[a-z0-9-]{2,63}\b/gi;

/**
 * Regex for extracting Unicode domain names.
 * Matches domain-like patterns with non-ASCII characters.
 */
const UNICODE_DOMAIN_REGEX = /(?:^|[\s,;|])([^\s,;|./]+(?:\.[^\s,;|./]+)+)(?:[\s,;|]|$)/g;

/**
 * Validates that TLD contains at least one letter.
 * Filters out IP addresses and numeric-only strings.
 */
function hasValidTLD(domain: string): boolean {
  const tld = domain.split('.').pop() || '';
  return /[a-z]/i.test(tld);
}

/**
 * Checks if a domain is a valid second-level domain (not a subdomain).
 * For Cloudflare zones, we typically want root domains only.
 */
function isRootDomain(domain: string): boolean {
  const parts = domain.split('.');
  // Handle special TLDs like .co.uk, .com.br, etc.
  const specialSLDs = ['co', 'com', 'net', 'org', 'edu', 'gov', 'ac', 'me'];
  if (parts.length === 3 && specialSLDs.includes(parts[1])) {
    return true;
  }
  return parts.length === 2;
}

export interface ParseResult {
  domains: string[];
  duplicates: string[];
  invalid: string[];
}

/**
 * Normalize a domain string:
 * - Trim whitespace
 * - Remove trailing dots
 * - Convert Unicode to punycode
 * - Lowercase
 */
function normalizeDomain(domain: string): string {
  let normalized = domain.trim().toLowerCase();

  // Remove trailing dot (DNS root)
  if (normalized.endsWith('.')) {
    normalized = normalized.slice(0, -1);
  }

  // Convert Unicode to punycode
  if (isUnicode(normalized)) {
    normalized = encodeDomain(normalized);
  }

  return normalized;
}

/**
 * Extract potential domains from text, including Unicode domains.
 */
function extractPotentialDomains(text: string): string[] {
  const results: string[] = [];

  // Extract ASCII domains
  const asciiMatches = text.match(ASCII_DOMAIN_REGEX) || [];
  results.push(...asciiMatches);

  // Extract Unicode domains (line by line to handle mixed content)
  const lines = text.split(/[\n\r]+/);
  for (const line of lines) {
    // Split by common separators
    const parts = line.split(/[\s,;|]+/);
    for (const part of parts) {
      // Check if it looks like a Unicode domain
      if (isUnicode(part) && part.includes('.')) {
        // Try to encode it - if successful, it's likely a valid domain
        const encoded = encodeDomain(part);
        if (encoded !== part.toLowerCase() && encoded.includes('.')) {
          results.push(encoded);
        }
      }
    }
  }

  return results;
}

/**
 * Parse domains from arbitrary text input.
 * Extracts unique, valid domains and identifies duplicates/invalid entries.
 *
 * @param text - Raw text input (can contain URLs, emails, random text)
 * @param rootOnly - If true, filter to root domains only (default: true)
 * @returns ParseResult with domains, duplicates, and invalid entries
 */
export function parseDomains(text: string, rootOnly = true): ParseResult {
  const matches = extractPotentialDomains(text);
  const seen = new Set<string>();
  const domains: string[] = [];
  const duplicates: string[] = [];
  const invalid: string[] = [];

  for (const match of matches) {
    const domain = normalizeDomain(match);

    // Skip empty
    if (!domain) continue;

    // Skip invalid TLDs
    if (!hasValidTLD(domain)) {
      if (!invalid.includes(domain)) {
        invalid.push(domain);
      }
      continue;
    }

    // Skip subdomains if rootOnly is enabled
    if (rootOnly && !isRootDomain(domain)) {
      continue;
    }

    // Track duplicates
    if (seen.has(domain)) {
      if (!duplicates.includes(domain)) {
        duplicates.push(domain);
      }
      continue;
    }

    seen.add(domain);
    domains.push(domain);
  }

  return {
    domains: domains.sort(),
    duplicates: duplicates.sort(),
    invalid: invalid.sort(),
  };
}

/**
 * Quick count of unique domains in text.
 * Useful for preview without full parsing.
 */
export function countDomains(text: string): number {
  const matches = extractPotentialDomains(text);
  const unique = new Set(
    matches
      .map(normalizeDomain)
      .filter((d) => d && hasValidTLD(d))
  );
  return unique.size;
}
