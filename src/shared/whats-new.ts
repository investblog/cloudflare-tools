/**
 * Bundled release notes — shown on the welcome page and in Settings → About.
 * Ships with the build (zero network); the opt-in publisher news feed is separate.
 * Keep newest first, a handful of entries max. Locales fall back to `en`.
 */

export interface ReleaseNote {
  version: string;
  items: Record<string, string[]>; // locale → lines; `en` is required
}

/** Release-note lines for the browser UI language, falling back to English. */
export function releaseNoteItems(note: ReleaseNote): string[] {
  const lang = chrome.i18n.getUILanguage().split('-')[0];
  return note.items[lang] ?? note.items.en;
}

export const WHATS_NEW: ReleaseNote[] = [
  {
    version: '0.2.0',
    items: {
      en: [
        'API Token support: user tokens (cfut_) and account-owned tokens (cfat_) alongside the Global API Key',
        'Multiple credential profiles with quick switching',
        'Toolbar button now opens the panel directly (popup removed); its quick actions moved into the panel',
        '"Select all" purge for a whole account and cross-account CSV export',
        'Opt-in publisher news (off by default, no identifiers sent)',
      ],
      ru: [
        'Поддержка API-токенов: пользовательские (cfut_) и токены аккаунта (cfat_) наряду с Global API Key',
        'Несколько профилей учётных данных с быстрым переключением',
        'Кнопка на панели инструментов открывает панель напрямую (попап удалён); его быстрые действия переехали в панель',
        '«Выбрать все» для очистки кэша целого аккаунта и экспорт CSV по всем аккаунтам',
        'Новости издателя по явному включению (по умолчанию выключены, без идентификаторов)',
      ],
    },
  },
];
