/**
 * Theme management for Cloudflare Tools
 * Supports: dark, light, auto (system preference)
 */

const THEME_STORAGE_KEY = 'cf_tools_theme';

export type Theme = 'dark' | 'light';
export type ThemePreference = Theme | 'auto';

/**
 * Get the current effective theme (dark or light)
 */
export function getTheme(): Theme {
  const root = document.documentElement;

  // Check explicit data-theme attribute
  const explicit = root.dataset.theme as Theme | undefined;
  if (explicit === 'dark' || explicit === 'light') {
    return explicit;
  }

  // Fall back to system preference
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

/**
 * Get the stored theme preference (dark, light, or auto)
 */
export function getThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemePreference | null;
    if (stored === 'dark' || stored === 'light' || stored === 'auto') {
      return stored;
    }
  } catch {
    // localStorage may be blocked
  }
  return 'auto';
}

/**
 * Apply a theme to the document
 */
export function setTheme(theme: Theme | null): void {
  const root = document.documentElement;
  if (theme) {
    root.dataset.theme = theme;
  } else {
    // Remove data-theme to let CSS media query handle it
    delete root.dataset.theme;
  }
}

/**
 * Save theme preference and apply it
 */
export function setThemePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // localStorage may be blocked
  }

  if (preference === 'auto') {
    setTheme(null);
  } else {
    setTheme(preference);
  }
}

/**
 * Toggle between dark and light themes
 */
export function toggleTheme(): void {
  const current = getTheme();
  const next = current === 'dark' ? 'light' : 'dark';
  setThemePreference(next);
}

/**
 * Initialize theme system
 * - Applies saved preference
 * - Listens for system preference changes (when set to auto)
 */
export function initTheme(): void {
  const preference = getThemePreference();

  if (preference === 'auto') {
    setTheme(null);
  } else {
    setTheme(preference);
  }

  // Listen for system preference changes
  try {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    mql.addEventListener('change', () => {
      // Only react if user preference is auto
      if (getThemePreference() === 'auto') {
        // CSS media query handles it, but we might need to update UI
        document.dispatchEvent(new CustomEvent('themechange', { detail: getTheme() }));
      }
    });
  } catch {
    // matchMedia may not be available
  }
}

/**
 * Get theme icon name based on current theme
 */
export function getThemeIcon(theme: Theme): string {
  return theme === 'dark' ? 'moon' : 'sun';
}
