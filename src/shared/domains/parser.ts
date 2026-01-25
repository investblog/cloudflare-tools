/**
 * Domain Parser
 * Extracts and validates domain names from arbitrary text input.
 *
 * Copied from 301-ui: src/domains/add-domains-drawer.ts
 */

/**
 * Regex for extracting domain names from text.
 * Matches: example.com, xn--domain.net, sub.domain.co.uk, домен.рф (as punycode)
 */
const DOMAIN_REGEX = /\b((?=[a-z0-9-]{1,63}\.)(?:xn--)?[a-z0-9]+(?:-[a-z0-9]+)*\.)+(?:xn--)?[a-z0-9-]{2,63}\b/gi;

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
 * Parse domains from arbitrary text input.
 * Extracts unique, valid domains and identifies duplicates/invalid entries.
 *
 * @param text - Raw text input (can contain URLs, emails, random text)
 * @param rootOnly - If true, filter to root domains only (default: true)
 * @returns ParseResult with domains, duplicates, and invalid entries
 */
export function parseDomains(text: string, rootOnly = true): ParseResult {
  const matches = text.match(DOMAIN_REGEX) || [];
  const seen = new Set<string>();
  const domains: string[] = [];
  const duplicates: string[] = [];
  const invalid: string[] = [];

  for (const match of matches) {
    const domain = match.toLowerCase().trim();

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
  const matches = text.match(DOMAIN_REGEX) || [];
  const unique = new Set(
    matches
      .map((d) => d.toLowerCase().trim())
      .filter(hasValidTLD)
  );
  return unique.size;
}
