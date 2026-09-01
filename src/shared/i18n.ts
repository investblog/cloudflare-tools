/**
 * i18n wrapper. Message catalogs live in public/_locales/{en,ru}; the browser
 * falls back to default_locale (en) for missing locales, and t() falls back to
 * the raw key if a message is missing from both.
 */

export function t(key: string, ...substitutions: string[]): string {
  const msg = chrome.i18n.getMessage(key, substitutions.length > 0 ? substitutions : undefined);
  return msg || key;
}
