# Permission justifications & single purpose

Тексты для форм в дашбордах сторов. Английский — ревьюеры читают его во всех
трёх сторах. Держать в актуальном состоянии при любом изменении набора
разрешений в `wxt.config.ts` (CWS требует обоснование для ВСЕХ разрешений
манифеста, включая опциональные и host-permissions; публикация с пустой
Privacy practices падает с 400 — так упал авто-сабмит v0.2.0).

Актуальный набор (v0.2.0):

| | Chrome / Edge | Firefox |
|---|---|---|
| required | `storage`, `sidePanel` | `storage`, `alarms` |
| required hosts | `https://api.cloudflare.com/*`, `https://dash.cloudflare.com/*` | те же |
| optional | `notifications`, `alarms` | `notifications` |
| optional hosts | `https://301.sh/*` | `https://301.sh/*` (в optional_permissions — MV2) |

`alarms` обязателен на Firefox, потому что AMO не принимает его как опциональный
(MANIFEST_OPTIONAL_PERMISSIONS) — он тихий, промпта пользователю не даёт.

---

## Single purpose (CWS: «Единственное назначение»)

Bulk operations on the user's own Cloudflare zones: create, check, delete and
purge the cache of many domains at once. The user supplies their own Cloudflare
API credentials; the extension talks directly to the official Cloudflare API
from a browser side panel, with no intermediary servers.

---

## Per-permission (CWS: отдельное поле на каждое разрешение)

### storage
Stores the user's Cloudflare credentials encrypted with AES-256-GCM (the
encryption key lives only in session storage), extension settings, and batch
history (IndexedDB) so interrupted bulk operations can be resumed. Nothing
leaves the browser.

### sidePanel
The extension's entire UI is a browser side panel: the user pastes domain
lists, runs bulk operations and watches progress next to the page they are
working on.

### Host permission `https://api.cloudflare.com/*`
The core purpose of the extension. Every zone operation (create, list, delete,
purge cache, credential verification) is a direct call to the official
Cloudflare API, authenticated with credentials the user provides. There is no
proxy or middleman server.

### Host permission `https://dash.cloudflare.com/*`
Used only by an optional dashboard integration (feature flag, OFF by default)
that adds "Bulk Add" and "Export" convenience buttons to the user's own
Cloudflare dashboard pages. The content script reads nothing from the page
except the account id present in the URL; it can be left disabled and the
extension is fully functional.

### notifications
Optional, runtime-only. Used solely for the opt-in "publisher news" feature:
shows a system notification when the publisher (301.sh) posts an update, at
most 3 per check. Requested only when the user enables the feature; disabling
it removes the permission.

### alarms
Optional, runtime-only (required on Firefox, where it cannot be optional — it
is silent and shows no prompt there). Used solely for the opt-in "publisher
news" feature: after the user explicitly enables it, an alarm checks the
publisher's news feed every 6 hours. Turning the feature off clears the alarm.

### Host permission `https://301.sh/*`
Optional, runtime-only. The only network request the extension can make
besides the Cloudflare API: a plain GET of the publisher's static news feed
(301.sh/posts.json) for the opt-in news feature. No user data, credentials,
or identifiers are sent. Off by default until the user enables the feature.

### Remote code (CWS: «Are you using remote code?»)
No. All code ships in the package; the only fetched content is JSON data
(Cloudflare API responses and, if enabled, the static news feed), never
executable code.

---

## Edge (Partner Center: одно поле «Permissions justification»)

Cloudflare Tools performs bulk operations on the user's own Cloudflare zones
(create, check, delete, purge cache) from a browser side panel, talking
directly to the official Cloudflare API with credentials the user provides.

Required permissions:
- storage — keeps the user's credentials encrypted with AES-256-GCM (key lives
  only in the browser session), settings, and resumable batch history. Nothing
  leaves the browser.
- sidePanel — the extension's entire UI is a side panel.
- https://api.cloudflare.com/* — the extension's core purpose: direct calls to
  the official Cloudflare API, no intermediary servers.
- https://dash.cloudflare.com/* — an optional dashboard integration (OFF by
  default) adding convenience buttons to the user's own Cloudflare dashboard;
  it reads nothing from the page except the account id in the URL.

Optional permissions, requested at runtime and off by default; they serve only
the opt-in "publisher news" feature and are revoked when it is turned off:
- notifications — a system notification when the publisher posts an update, at
  most 3 per check.
- alarms — schedules the feed check every 6 hours.
- https://301.sh/* — a plain GET of the publisher's static news feed
  (301.sh/posts.json); no user data or identifiers are sent.

The extension collects no user data, has no telemetry or analytics, loads no
remote code, and outside the Cloudflare API makes no network requests until
the news feature is explicitly enabled.

---

## Data collection

- **CWS** (Privacy practices → Data usage): не собираем ничего — ни один
  пункт не отмечается; сертификации отмечаем все три («не продаём третьим
  лицам», «не используем не по назначению», «не используем для
  кредитоспособности/кредитования»). Примечание для ревью: учётные данные
  Cloudflare пользователь вводит сам, они шифруются локально и уходят ТОЛЬКО
  на api.cloudflare.com — это не сбор данных расширением.
- **AMO**: `data_collection_permissions: { required: ['none'] }` уже в
  манифесте — в дашборде «не собирает данные».
- **Edge**: то же — расширение не собирает пользовательские данные.

---

## Где что заполнено

- **CWS** — ⚠️ ЗАПОЛНИТЬ: авто-publish v0.2.0 упал с 400 «Publish condition
  not met: privacy information» (2026-09-01); драфт пакета в консоли, после
  заполнения этой вкладки — «Submit for review» кнопкой (workflow не
  перезапускать: повторная загрузка той же версии отклоняется).
- **Edge** — пакет 0.2.0 засабмичен автоматически; поле Permissions
  justification обновить текстом выше при первом заходе в Partner Center
  (в 0.2.0 добавились optional-разрешения новостей).
- **AMO** — отдельного поля обоснований нет; разрешения показываются
  автоматически, полное описание — из `store-descriptions-firefox.md`,
  сборочная инструкция для ревьюера — `AMO_README.md` (раздел Permissions
  Rationale там же).
