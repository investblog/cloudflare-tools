# Cloudflare Tools — Техническое задание

## Концепция

**Расширение браузера** для массовых операций с Cloudflare, работающее напрямую с CF API через Global API Key. Решает проблему rate-limits и квот при bulk-операциях.

**Название:** Cloudflare Tools
**Тип:** Browser Extension (Chrome/Firefox)
**Репозиторий:** Отдельный (не monorepo)
**Связь с 301.st:** Ссылки на основной проект, без API интеграции

## Почему расширение браузера?

1. **Нет CORS ограничений** — расширения могут делать любые HTTP запросы
2. **Доверие пользователей** — установка из официального магазина расширений
3. **Безопасность** — `chrome.storage.local` + шифрование надёжнее чем localStorage
4. **Интеграция с CF** — можно добавить кнопки прямо в Cloudflare Dashboard
5. **Global API Key** — поддерживается с соблюдением rate-limits; реализованы очереди и backoff
6. **Трафик** — приложение приводит пользователей к основному проекту 301.st

## Архитектура

```
┌─────────────────────────────────────────────────────────┐
│                  Browser Extension                      │
│                  (Cloudflare Tools)                     │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Side Panel  │  │ Background   │  │  Content     │  │
│  │  (main app)  │  │   Worker     │  │  Script      │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│         │                │                  │          │
│         ▼                ▼                  ▼          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Domain Parser│  │  CF API      │  │  CF Dashboard│  │
│  │ (from 301-ui)│  │  Client      │  │  Integration │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
├─────────────────────────────────────────────────────────┤
│              chrome.storage.local                       │
│       (Global API Key encrypted, never leaves ext)      │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼ (no CORS!)
                   ┌─────────────┐
                   │ Cloudflare  │
                   │ API Direct  │
                   └─────────────┘
```

### Extension Components

| Component | Назначение |
|-----------|------------|
| **Side Panel** | Основной UI: auth, bulk create, delete, purge, results |
| **Popup** | Quick actions + кнопка "Open Panel" |
| **Background Worker** | API запросы, хранение credentials |
| **Content Script** | Интеграция с dash.cloudflare.com (опционально) |

### Auth Headers (Global API Key)
```
X-Auth-Email: user@example.com
X-Auth-Key: c2547eb745079dac9320b638f5e225cf483cc5cfdda41
```

## Side Panel (Chrome) / Sidebar (Firefox)

### Стратегия: Hybrid

- **Side Panel** — основной интерфейс для bulk операций (Chrome 114+)
- **Sidebar** — аналог для Firefox
- **Popup** — quick actions + кнопка "Open Panel" (fallback для старых браузеров)

**Build:** WXT с targets `chrome` + `firefox`, единый UI-бандл (`src/panel/`).
**Feature detect:** `chrome.sidePanel` vs `browser.sidebarAction` в runtime.

### Преимущества Side Panel

| Аспект | Popup | Side Panel |
|--------|-------|------------|
| **Размер** | 800×600 max | Широкий, высота = окно |
| **Закрытие** | При клике вне | Остаётся открытым |
| **Работа параллельно** | ❌ Нет | ✅ Да |
| **Progress видимость** | ❌ Закрывается | ✅ Всегда виден |
| **Навигация по вкладкам** | ❌ Теряется контекст | ✅ Сохраняется |

### Сценарий использования

```
┌─────────────────────────────────────────────┬───────────┐
│                                             │           │
│                                             │  CF Tools │
│         Cloudflare Dashboard                │           │
│                                             │  [Add]    │
│         Websites                            │  [Delete] │
│         ┌─────────────────────┐             │  [Purge]  │
│         │ example.com         │             │           │
│         │ site.ru             │             │ ───────── │
│         │ domain.net          │             │           │
│         └─────────────────────┘             │  Progress │
│                                             │  ████░░░  │
│                                             │  12/50    │
│                                             │           │
└─────────────────────────────────────────────┴───────────┘
```

Пользователь запустил добавление 100 доменов → может переключиться на CF Dashboard и смотреть результаты → Side Panel продолжает работать и показывает прогресс.

## Переиспользуемый код из 301-ui

### 1. Domain Parser (`src/domains/add-domains-drawer.ts`)

**Regex для извлечения доменов:**
```typescript
// Matches: example.com, xn--domain.net, sub.domain.co.uk, домен.рф
const DOMAIN_REGEX = /\b((?=[a-z0-9-]{1,63}\.)(?:xn--)?[a-z0-9]+(?:-[a-z0-9]+)*\.)+(?:xn--)?[a-z0-9-]{2,63}\b/gi;
```

**Функции для выноса:**
```typescript
// Парсинг доменов из текста
function parseDomains(text: string): string[] {
  const matches = text.match(DOMAIN_REGEX) || [];
  return [...new Set(matches.map(d => d.toLowerCase().trim()))]
    .filter(hasValidTLD)
    .sort();
}

// Валидация TLD (должен содержать хотя бы одну букву)
function hasValidTLD(domain: string): boolean {
  const tld = domain.split('.').pop() || '';
  return /[a-z]/i.test(tld);
}
```

### 2. IDN Utilities (`src/utils/idn.ts`)

```typescript
import punycode from 'punycode.js';

// Decode punycode → Unicode (для отображения)
export function decodeDomain(domain: string): string;

// Encode Unicode → punycode (для API)
export function encodeDomain(domain: string): string;

// Проверка на punycode
export function isPunycode(domain: string): boolean;

// Форматирование для UI
export function formatDomainDisplay(domain: string, mode: 'compact' | 'full'): string;
```

**Правило:** API всегда получает ASCII-LDH (punycode), UI показывает Unicode.
Поиск матчит оба представления: "müller.de" находит `xn--mller-kva.de`.

### 3. CSS Components (`static/css/`)
- `theme.css` — design tokens, colors, spacing
- `site.css` — buttons, inputs, cards, panels
- `tables.css` — data tables (для списка зон)
- `drawers.css` — side panels

### 4. Icon Sprite
- `static/icons-sprite.svg`
- `static/img/icons-src/` — source SVGs

### 5. i18n Structure (`src/i18n/`)
- Структура локалей
- Переключатель языков
- Функция `t()` для переводов

### 6. Style Guide (`docs/StyleGuide.md`)

**ВАЖНО:** UI расширения должен выглядеть как Drawer'ы 301.st

#### Ключевые правила из StyleGuide.md:

**Unified Control Recipe (высота кнопок/инпутов):**
```css
height = font-size × line-height + padding × 2
/* Никаких фиксированных height! */
```

**Размеры контролов:**
```css
--control-sm: 0.875rem font, 0.375rem padding  /* 28px */
--control-md: 0.875rem font, 0.625rem padding  /* 36px */
--control-lg: 1rem font, 0.75rem padding       /* 44px */
```

**Border-radius:**
```css
--r-pill: 999px;     /* Buttons, chips */
--r-field: 0.75rem;  /* Inputs, textareas */
--radius-lg: 0.75rem; /* Cards, panels */
--radius: 0.5rem;    /* Dropdowns */
```

**Spacing tokens:**
```css
--space-1: 0.25rem;  /* 4px */
--space-2: 0.5rem;   /* 8px */
--space-3: 0.75rem;  /* 12px */
--space-4: 1rem;     /* 16px */
--space-5: 1.5rem;   /* 24px */
--space-6: 2rem;     /* 32px */
```

**Panel layout (для Side Panel):**
```css
.panel {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.panel__header {
  padding: var(--space-4);
  border-bottom: 1px solid var(--border);
}

.panel__body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4);
}

.panel__footer {
  padding: var(--space-4);
  border-top: 1px solid var(--border-subtle);
  background: var(--panel);
}
```

**Цвета (Dark theme):**
```css
--bg: #0a0a0b;
--panel: #141416;
--border: #2a2a2e;
--text: #f4f4f5;
--text-muted: #71717a;
--brand: #3b82f6;      /* Primary actions */
--accent-cf: #f6821f;  /* Cloudflare orange */
--success: #22c55e;
--danger: #ef4444;
```

## Функциональность

### MVP (Phase 1)

#### Авторизация (Global API Key only)
- [ ] Ввод CF Account Email + Global API Key
- [ ] Валидация через `GET /user` (проверка ключа)
- [ ] Получение списка аккаунтов `GET /accounts`
- [ ] Хранение в `chrome.storage.local` (**encrypted**)
- [ ] "Remember me" checkbox
- [ ] Ссылка на инструкцию получения Global API Key

#### Bulk Zone Creation
- [ ] Textarea для вставки доменов/текста
- [ ] Парсер доменов (из 301-ui)
- [ ] Preview с количеством и списком
- [ ] Выбор CF Account (обязательный `account.id` в body)
- [ ] Настройки зоны:
  - [ ] Jump start (auto DNS scan) — default: true
  - [ ] Type (full/partial) — default: full
- [ ] Batch создание с progress bar
- [ ] Retry logic для failed domains
- [ ] Results: success/failed/skipped списки

> **Note:** Plan (free/pro/business/enterprise) не указывается при создании — зона создаётся на Free, апгрейд через биллинг CF.

#### Bulk Zone Deletion
- [ ] Селект аккаунта (обязателен, фильтрует зоны)
- [ ] Список существующих зон (с поиском)
- [ ] Постраничная загрузка зон до исчерпания (с индикатором "Loading zones...")
- [ ] Multi-select для удаления
- [ ] Confirmation dialog
- [ ] Batch удаление с progress

#### Bulk Purge Cache (конкурентное преимущество)
- [ ] Селект аккаунта (обязателен, фильтрует зоны)
- [ ] Постраничная загрузка зон до исчерпания (с индикатором "Loading zones...")
- [ ] Список зон с multi-select
- [ ] Purge Everything (одним кликом)
- [ ] Progress bar для batch операций
- [ ] Results: success/failed списки

```
POST /zones/:zone_id/purge_cache
Body: { "purge_everything": true }
```

#### Export/Import (низкий приоритет)
- [ ] Export results as CSV/JSON
- [ ] Export zone list
- [ ] Import domains from CSV

### Preflight / Dry-run

Before any batch run, the tool performs an **automatic preflight** (`GET /zones?name={domain}` for each item) to classify rows:

| Status | Описание |
|--------|----------|
| `will-create` | Зона не существует, будет создана |
| `exists` | Зона уже есть в аккаунте → skip |
| `invalid` | Невалидный домен (парсер отклонил) |
| `duplicate` | Дубликат в списке ввода |

**UI:**
- **"Check first"** — запускает только preflight (без мутаций)
- **"Start"** — доступен сразу после preflight
- Preflight results кешируются в сессии; редактирование списка инвалидирует кеш

**Идемпотентность:** повторный запуск не создаёт дублей; `exists` → `skipped`.

### Phase 2 (Extended)

#### DNS Management
- [ ] Bulk DNS record creation
- [ ] Template records (apply to multiple zones)
- [ ] DNS record export/import

#### Zone Settings
- [ ] Bulk SSL mode change
- [ ] Bulk security level
- [ ] Bulk cache settings

#### Ссылки на 301.st
- [ ] "Powered by 301.st" в footer
- [ ] CTA после успешных операций
- [ ] About page с описанием 301.st

## Технический стек

```
Manifest:       Manifest V3 (Chrome/Firefox compatible)
Framework:      Vanilla TS (как 301-ui) или Preact (UI)
Build:          Vite + CRXJS или WXT (extension bundler)
Styling:        CSS из 301-ui (theme.css, site.css)
Icons:          Icon sprite из 301-ui
Stores:         Chrome Web Store, Firefox Add-ons
```

### Рекомендуемый bundler: WXT
```bash
npm create wxt@latest cloudflare-tools
```
- Поддержка Manifest V3
- Hot reload при разработке
- Одновременная сборка для Chrome и Firefox

## Структура проекта

```
cloudflare-tools/
├── manifest.json             # Extension manifest
├── src/
│   ├── panel/                # Общий UI (side panel + sidebar + popup fallback)
│   │   ├── index.html
│   │   ├── main.ts
│   │   └── components/
│   │       ├── auth-form.ts
│   │       ├── bulk-create.ts
│   │       ├── bulk-delete.ts
│   │       ├── bulk-purge.ts
│   │       ├── progress.ts
│   │       └── results.ts
│   ├── popup/                # Quick actions + "Open Panel"
│   │   ├── index.html
│   │   └── main.ts
│   ├── sidepanel/            # Chrome Side Panel entry
│   │   └── index.html        # → загружает panel/
│   ├── sidebar/              # Firefox Sidebar entry
│   │   └── index.html        # → загружает panel/
│   ├── background/           # Service Worker
│   │   ├── index.ts          # Main entry, message routing
│   │   ├── vault.ts          # Encryption, master password
│   │   ├── cf-client.ts      # Cloudflare API client
│   │   ├── queue.ts          # Rate-limited request queues
│   │   └── ledger.ts         # Task persistence (IndexedDB)
│   ├── content/              # Content script (optional)
│   │   └── cf-dashboard.ts   # Inject into dash.cloudflare.com
│   ├── shared/
│   │   ├── types/
│   │   │   ├── api.ts        # CF API types
│   │   │   ├── tasks.ts      # Task/Batch types
│   │   │   └── errors.ts     # Error taxonomy
│   │   ├── domains/
│   │   │   ├── parser.ts     # Domain extraction
│   │   │   └── idn.ts        # Punycode utilities
│   │   ├── messaging/
│   │   │   └── protocol.ts   # Type-safe message passing
│   │   └── i18n/
│   │       └── ...
│   └── assets/
│       ├── css/              # From 301-ui
│       └── icons/            # Extension icons (16, 48, 128px)
├── wxt.config.ts             # WXT config
└── package.json
```

### Manifest V3

```json
{
  "manifest_version": 3,
  "name": "Cloudflare Tools",
  "version": "1.0.0",
  "description": "Bulk operations for Cloudflare zones",

  "permissions": ["storage", "sidePanel"],
  "host_permissions": ["https://api.cloudflare.com/*"],

  "action": {
    "default_popup": "popup/index.html",
    "default_title": "Cloudflare Tools",
    "default_icon": {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },

  "side_panel": {
    "default_path": "sidepanel/index.html"
  },

  "background": {
    "service_worker": "background/index.js"
  },

  "content_scripts": [{
    "matches": ["https://dash.cloudflare.com/*"],
    "js": ["content/cf-dashboard.js"]
  }]
}
```

### Firefox Manifest additions

```json
{
  "sidebar_action": {
    "default_panel": "sidebar/index.html",
    "default_title": "Cloudflare Tools",
    "default_icon": "icons/icon-48.png"
  }
}
```

## Cloudflare API

### Base URL
```
https://api.cloudflare.com/client/v4
```

### Auth Headers
```typescript
const headers = {
  'X-Auth-Email': email,
  'X-Auth-Key': globalApiKey,
  'Content-Type': 'application/json',
};
```

### User & Accounts
```
GET    /user                     # Verify credentials, get user info
GET    /accounts                 # List accounts (for account selection)
```

### Zones
```
POST   /zones                    # Create zone
GET    /zones                    # List zones (with pagination)
DELETE /zones/:id                # Delete zone
GET    /zones/:id                # Zone details
PATCH  /zones/:id                # Update zone settings
```

**POST /zones** body:
```typescript
{
  name: string;              // Required: domain name
  account: { id: string };   // Required: CF account ID
  type?: 'full' | 'partial'; // Optional, default: 'full'
  jump_start?: boolean;      // Optional, default: true
}
```

### Cache (Phase 1)
```
POST   /zones/:id/purge_cache    # Purge cache
Body: { "purge_everything": true }
# или выборочно:
Body: { "files": ["https://example.com/style.css"] }
Body: { "tags": ["header", "footer"] }
Body: { "hosts": ["www.example.com"] }
```

### DNS (Phase 2)
```
POST   /zones/:id/dns_records    # Create DNS record
GET    /zones/:id/dns_records    # List DNS records
DELETE /zones/:id/dns_records/:r # Delete DNS record
```

### Rate Limiting & Backoff

Cloudflare API имеет лимиты независимо от метода аутентификации. Реализация:

| Параметр | Default | Cap | Описание |
|----------|---------|-----|----------|
| `maxConcurrency` | 4 | 8 | Параллельные запросы per pool |
| `maxRetries` | 3 | 5 | Максимум повторов |
| `baseDelay` | 500ms | 20s | Базовая задержка backoff |
| `jitter` | 0.3 | — | Коэффициент случайной добавки |

**Очереди per-operation:**
- `createZonesPool` — создание зон
- `deleteZonesPool` — удаление зон
- `purgePool` — очистка кеша
- `preflightPool` — preflight запросы

**Backoff strategy:**
```typescript
delay = min(cap, baseDelay * 2^attempt) + random(0..baseDelay * jitter)
// Retry-After header has priority over calculated delay
```

**Конфиг** выносится в Settings для продвинутых пользователей.

### Error Taxonomy

| Категория | Код | Стратегия | UI Action |
|-----------|-----|-----------|-----------|
| **Auth** | 10000 | Нет retry | "Check credentials" |
| **Rate limit** | 429 | Retry с Retry-After | Badge "waiting" |
| **Validation** | 1061 (zone exists) | Skip | "skipped (exists)" |
| **Dependency** | 1099 (subscription) | Нет retry | "blocked → go to Dashboard" |
| **Network** | timeout/5xx | Retry с backoff | Badge "retrying" |
| **Permission** | 10001 | Нет retry | "Token lacks permission" |

**UI mapping:**
- Каждой ошибке — понятный текст и рекомендация
- `blocked` не предлагает retry, а ссылку на Dashboard
- `failed` (retryable) показывает кнопку "Retry"

### Task Ledger (IndexedDB)

Персистентное хранение состояния batch операций:

```typescript
interface TaskEntry {
  id: string;
  batchId: string;
  domain: string;
  operation: 'create' | 'delete' | 'purge';
  status: 'queued' | 'running' | 'success' | 'failed' | 'skipped' | 'blocked';
  attempt: number;
  zoneId?: string;
  errorCode?: number;
  errorMessage?: string;
  latency?: number;
  createdAt: number;
  updatedAt: number;
}
```

**Возможности:**
- Resume после перезапуска браузера/расширения
- "Retry failed only" — перезапуск только упавших
- Audit log для разбора больших прогонов
- Export как JSON/CSV

## Безопасность

### Encrypted Vault

Секреты (email, Global API Key / API Token) хранятся **только в зашифрованном виде**:

| Компонент | Реализация |
|-----------|------------|
| **KDF** | Argon2id (per-device salt, parameter versioning) |
| **Cipher** | AES-256-GCM |
| **Master Password** | Обязателен при первом запуске |

### Session & Auto-lock

- **"Remember for session"** — включено по умолчанию
- **Auto-lock** по таймауту бездействия (default 15 min, настраиваемо 1–60)
- **Immediate lock** при выгрузке Service Worker (MV3)
- После локировки все API-вызовы блокируются до повторного ввода пароля

### Изоляция

| Компонент | Доступ к секретам |
|-----------|-------------------|
| Service Worker | Yes (единственный) |
| Side Panel / Popup | No (через messaging) |
| Content Script | No (строго изолирован) |

### UI Settings

- [ ] Set master password (первый запуск)
- [ ] Change master password
- [ ] Lock now
- [ ] Auto-lock timeout (default: **15 min**, range: 1–60)
- [ ] Remember for session (default: **on**)
- [ ] Lock on SW unload (default: **on**, MV3 Service Worker termination)
- [ ] Clear all data

### Принципы

1. **Global API Key никогда не покидает устройство**
2. **Нет внешних серверов** — все запросы напрямую к api.cloudflare.com
3. **Minimal permissions** — только `storage`, `sidePanel` и `host_permissions` для CF API
4. **No tracking** — никакой аналитики, никаких внешних скриптов
5. **Open source** — код открыт для аудита

## UI/UX

### Side Panel Views (основной интерфейс)

1. **Auth** — ввод Email + Global API Key + Master Password
2. **Dashboard** — выбор операции, статус подключения
3. **Bulk Create** — textarea + preview + preflight + progress
4. **Bulk Delete** — селект аккаунта (обязателен) → список зон (с пагинацией) + multi-select
5. **Bulk Purge** — селект аккаунта (обязателен) → список зон (с пагинацией) + multi-select + purge
6. **Results** — success/failed списки + export
7. **Settings** — auto-lock timeout, change password, clear data

### Batch Runner Controls

| Кнопка | Действие |
|--------|----------|
| **Check first** | Только preflight (без мутаций) |
| **Start** | Запуск batch после preflight |
| **Pause** | Приостановка (сохранение checkpoint) |
| **Resume** | Продолжение с checkpoint |
| **Cancel** | Отмена и сброс |
| **Retry failed only** | Перезапуск только упавших |
| **Export failed** | CSV/JSON: `domain, operation, status, errorCode, errorMessage, attempt, latencyMs, zoneId?` |

### Status Legend

| Статус | Иконка | Описание |
|--------|--------|----------|
| `queued` | (hourglass) | В очереди |
| `running` | (spinner) | Выполняется |
| `success` | (check) | Успешно |
| `failed` | (cross) | Ошибка (retryable) |
| `skipped` | (skip) | Пропущен (exists/duplicate) |
| `blocked` | (ban) | Заблокирован (dependency) |
| `invalid` | (warning) | Невалидный ввод |

### Batch Summary

```
Processed: 45/100  |  Success: 40  |  Failed: 3  |  Skipped: 2
ETA: ~2 min
```

**ETA calculation:** moving average по последним N завершённым задачам (N=30); при <10 завершённых — среднее по доступным.

### Resume после перезапуска

При перезапуске браузера/расширения с незавершённым batch:
- Показывается диалог "Found incomplete batch. Resume?"
- Resume продолжает с последнего checkpoint
- Нет повторов уже выполненных шагов

### Popup Views (quick actions)

```
┌─────────────────────┐
│   CF Tools          │
├─────────────────────┤
│ Quick Actions       │
│ [Purge All Cache]   │
│ [Export Zones]      │
│                     │
│ ─────────────────── │
│ [Open Full Panel →] │
└─────────────────────┘
```

### Дизайн

- CSS из 301-ui (dark theme по умолчанию)
- Side Panel использует полную высоту окна
- Popup — компактный (300px width)
- Те же компоненты: buttons, inputs, cards, panels
- Sticky header с navigation tabs

### Content Script (опционально)

Интеграция с dash.cloudflare.com:
- Кнопка "Bulk Add" на странице Websites
- Кнопка "Export Zones" в toolbar
- Quick actions в контекстном меню

**Feature flag:** "Enable Dashboard buttons" в Settings (default: **off**).
Контент-скрипт остаётся в manifest, но инъекция контролируется флагом — упрощает ревью CWS/AMO.

## Deployment

### Privacy Policy (обязательно для stores)

```
Cloudflare Tools Privacy Policy:
- No data collection — we don't collect any user data
- No external servers — all requests go directly to Cloudflare API
- Local encryption — credentials encrypted on device with user's master password
- No tracking — no analytics, no external scripts
- Open source — code available for audit
```

**Deployment checklist:**
- [ ] `/privacy.html` включён в сборку расширения
- [ ] Ссылка на Privacy Policy в Settings UI
- [ ] GitHub Pages хостинг для CWS/AMO review
- [ ] Текст Privacy Policy в описании CWS/AMO

### Chrome Web Store
```bash
npm run build
# Upload dist/chrome.zip to Chrome Web Store Developer Dashboard
# https://chrome.google.com/webstore/devconsole
```

### Firefox Add-ons
```bash
npm run build
# Upload dist/firefox.zip to Firefox Add-ons
# https://addons.mozilla.org/developers/
```

### Manual Install (для тестирования)
```bash
npm run build
# Chrome: chrome://extensions → Load unpacked → dist/chrome
# Firefox: about:debugging → Load Temporary Add-on → dist/firefox/manifest.json
```

### Browser Compatibility Matrix

| Browser | Version | UI | Notes |
|---------|---------|-----|-------|
| **Chrome** | ≥114 | Side Panel | Primary target |
| **Edge** | ≥114 | Side Panel | Chromium-based, same as Chrome |
| **Firefox** | ≥120 | Sidebar | `browser.sidebarAction` API |

**Smoke-test checklist:**
- [ ] Auth (login, auto-lock, lock now)
- [ ] Preflight (счётчики will-create/exists/invalid/duplicate)
- [ ] Create (batch, progress, retry)
- [ ] Delete (pagination, filter by account)
- [ ] Purge (batch, progress)
- [ ] Resume (после перезапуска браузера)

## Roadmap

| Phase | Scope | Приоритет |
|-------|-------|-----------|
| 1 | Auth + Bulk Create + Bulk Delete + **Purge Cache** | MVP |
| 1.5 | Export/Import (CSV/JSON) | Nice to have |
| 2 | DNS Management (bulk records) | Extended |
| 3 | Zone Settings (SSL, security) | Extended |
| 4 | CF Dashboard Integration (content script) | Bonus |

## Связь с 301.st

Приложение должно приводить трафик к основному проекту:

### Обязательные ссылки
- **Header/Footer:** "Powered by 301.st" с ссылкой
- **После операций:** "Manage your domains in 301.st Dashboard"
- **About page:** Описание 301.st с CTA

### Messaging
```
"Cloudflare Tools — free bulk operations for CF zones.
For advanced domain management, redirects and TDS — try 301.st"
```

### Будущая интеграция (Phase 2+)
- OAuth login через 301.st
- Sync созданных зон в 301.st
- Import/export между приложениями

---

## Решения (зафиксировано)

| Вопрос | Решение |
|--------|---------|
| Название | Cloudflare Tools |
| Тип | Browser Extension |
| Репозиторий | Отдельный |
| Auth метод | Global API Key (Phase 1), API Token (Phase 2) |
| Шифрование | Обязательное (Argon2id + AES-GCM) |
| Основной UI | Side Panel (Chrome) / Sidebar (Firefox) |
| Fallback UI | Popup с quick actions |
| Preflight | Автоматический перед batch + "Check first" |
| Persistence | IndexedDB (Task Ledger) |
| Rate limiting | Очереди per-operation + backoff |
| 301.st интеграция | Ссылки, без API |

---

## Следующие шаги

1. [x] ~~Определиться с архитектурой~~ — Global API Key, отдельный repo
2. [x] ~~Добавить Side Panel / Sidebar~~ — Hybrid стратегия
3. [ ] Создать репозиторий `cloudflare-tools`
4. [ ] Скопировать переиспользуемый код из 301-ui
5. [ ] Реализовать CF API client (Global API Key auth)
6. [ ] MVP: Auth + Bulk Zone Create + Delete + Purge Cache
