/**
 * IDN (Internationalized Domain Name) Utilities
 *
 * Policy:
 * - API always receives ASCII-LDH (punycode)
 * - UI always shows Unicode
 * - Search matches both representations
 */

/**
 * Check if domain contains punycode labels (xn-- prefix)
 */
export function isPunycode(domain: string): boolean {
  return domain.split('.').some((label) => label.startsWith('xn--'));
}

/**
 * Check if domain contains non-ASCII characters
 */
export function isUnicode(domain: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /[^\x00-\x7F]/.test(domain);
}

/**
 * Encode Unicode domain to punycode (ASCII-LDH)
 * Uses the URL API for punycode conversion.
 *
 * @example
 * encodeDomain('домен.рф') => 'xn--d1acufc.xn--p1ai'
 * encodeDomain('müller.de') => 'xn--mller-kva.de'
 */
export function encodeDomain(domain: string): string {
  if (!isUnicode(domain)) {
    return domain.toLowerCase();
  }

  try {
    // Use URL API for punycode conversion
    const url = new URL(`http://${domain}`);
    return url.hostname;
  } catch {
    // Fallback: return as-is (let API validate)
    return domain.toLowerCase();
  }
}

/**
 * Decode punycode domain to Unicode
 *
 * @example
 * decodeDomain('xn--d1acufc.xn--p1ai') => 'домен.рф'
 * decodeDomain('xn--mller-kva.de') => 'müller.de'
 */
export function decodeDomain(domain: string): string {
  if (!isPunycode(domain)) {
    return domain;
  }

  try {
    // Use URL API for punycode decoding
    const url = new URL(`http://${domain}`);
    // URL.hostname returns punycode, but we can decode it
    const decoded = url.hostname
      .split('.')
      .map((label) => {
        if (label.startsWith('xn--')) {
          try {
            // Use punycode decoding via URL
            const testUrl = new URL(`http://${label}.test`);
            return testUrl.hostname.replace('.test', '');
          } catch {
            return label;
          }
        }
        return label;
      })
      .join('.');
    return decoded;
  } catch {
    return domain;
  }
}

/**
 * Format domain for display
 *
 * @param domain - Domain name (can be punycode or unicode)
 * @param mode - 'compact' shows unicode only, 'full' shows both if different
 */
export function formatDomainDisplay(
  domain: string,
  mode: 'compact' | 'full' = 'compact'
): string {
  const unicode = decodeDomain(domain);
  const ascii = encodeDomain(domain);

  if (mode === 'compact' || unicode === ascii) {
    return unicode;
  }

  // Full mode: show both if different
  return `${unicode} (${ascii})`;
}

/**
 * Check if search query matches domain (both representations)
 */
export function domainMatchesSearch(domain: string, query: string): boolean {
  const lowerQuery = query.toLowerCase();
  const unicode = decodeDomain(domain).toLowerCase();
  const ascii = encodeDomain(domain).toLowerCase();

  return unicode.includes(lowerQuery) || ascii.includes(lowerQuery);
}
