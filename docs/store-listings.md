# Store Listings — Cloudflare Tools v0.2.0

Copy-paste source for the store consoles. The SHORT description ships inside the
build (`_locales/*/messages.json`, `__MSG_extDescription__`, ≤132 chars — Chrome's
manifest limit); everything below is pasted manually per store.

| Store | Field | Limit | Source |
|---|---|---|---|
| Chrome Web Store | Name / Short description | 45 / 132 | from manifest (`_locales`) |
| Chrome Web Store | Detailed description | ~16 000, plain text | **EN / RU below** (per-locale in the console) |
| Chrome Web Store | Category | — | Developer Tools |
| Firefox Add-ons (AMO) | Summary | 250 | **AMO summary below** |
| Firefox Add-ons (AMO) | Description | HTML subset | **EN / RU below** |
| Firefox Add-ons (AMO) | Release notes (per version) | — | **Release notes below** |
| Edge Add-ons | Short / Full description | 132 / 10 000 | same texts as CWS |

Full detailed descriptions for ALL 17 manifest locales live in:
- `store-descriptions-chrome.md` — plain text (Chrome Web Store / Edge Add-ons)
- `store-descriptions-firefox.md` — Markdown (AMO)
One translation source, two renders; the EN/RU texts below predate them and match.

---

## Detailed description — EN (CWS / AMO / Edge)

```
Bulk operations for Cloudflare zones — right in your browser's side panel.

Cloudflare Tools talks directly to the Cloudflare API (no middleman servers) and turns repetitive dashboard work into batch jobs: paste a list of domains and create dozens of zones at once, purge cache for a whole account, or clean up unused zones in one pass.

WHAT IT DOES
• Bulk Create — paste domains, URLs or any text: the parser extracts valid domains (IDN supported). Preflight shows what will be created, what already exists, duplicates and invalid entries. Batches run with progress, ETA, pause/resume and retry of failed items.
• Check — zone list per account with statuses; CSV export for one account or for ALL accounts at once (full pagination).
• Bulk Delete — multi-select zones, confirm, done.
• Bulk Purge — "Purge Everything" for selected zones or a whole account in one click.
• Profiles — keep several credentials and switch instantly: user API tokens (cfut_), account-owned tokens (cfat_) or the classic Global API Key. The credential type is auto-detected from the pasted secret.

BUILT FOR SAFETY
• Credentials are encrypted with AES-256-GCM; the encryption key lives only in the browser session — after the browser closes there is nothing left to steal.
• Only the extension's background worker touches secrets; every request goes straight to api.cloudflare.com.
• Rate-limit aware: automatic backoff, Retry-After support, resumable batches (IndexedDB).
• Zero analytics, zero tracking. The optional publisher-news feed is strictly opt-in and sends no identifiers.

WHO IT IS FOR
Media buyers, SEO specialists, agencies and developers who manage tens or hundreds of domains on Cloudflare and are tired of adding them one by one.

TIP: for zone creation an API token needs the "Zone → Zone → Edit" permission on your account resources — no Global API Key required.

Open source: https://github.com/investblog/cloudflare-tools
By the makers of 301.st — redirects, TDS & domain management: https://301.st
```

## Развёрнутое описание — RU (CWS / AMO / Edge)

```
Массовые операции с зонами Cloudflare — прямо в боковой панели браузера.

Cloudflare Tools работает с API Cloudflare напрямую (без посредников) и превращает рутину дашборда в пакетные задачи: вставьте список доменов — и создайте десятки зон за раз, очистите кэш целого аккаунта или удалите ненужные зоны одним проходом.

ЧТО УМЕЕТ
• Массовое создание — вставьте домены, URL или любой текст: парсер извлечёт валидные домены (включая IDN). Предпроверка покажет, что будет создано, что уже существует, дубли и невалидные записи. Батчи идут с прогрессом, ETA, паузой/продолжением и повтором неудачных.
• Проверка — список зон по аккаунту со статусами; экспорт CSV по одному аккаунту или сразу по ВСЕМ (с полной пагинацией).
• Массовое удаление — мультивыбор зон, подтверждение, готово.
• Массовая очистка кэша — «Purge Everything» для выбранных зон или всего аккаунта одним кликом.
• Профили — храните несколько учётных данных и мгновенно переключайтесь: пользовательские API-токены (cfut_), токены аккаунта (cfat_) или классический Global API Key. Тип определяется автоматически по вставленному секрету.

БЕЗОПАСНОСТЬ ПО УМОЛЧАНИЮ
• Учётные данные шифруются AES-256-GCM; ключ шифрования живёт только в сессии браузера — после закрытия браузера красть нечего.
• Секреты доступны только фоновому воркеру расширения; каждый запрос идёт напрямую в api.cloudflare.com.
• Уважает лимиты API: автоматический backoff, поддержка Retry-After, возобновляемые батчи (IndexedDB).
• Ноль аналитики и трекинга. Опциональная лента новостей издателя включается только вручную и не передаёт идентификаторов.

ДЛЯ КОГО
Медиабайеры, SEO-специалисты, агентства и разработчики, у которых на Cloudflare десятки и сотни доменов — и нет желания добавлять их по одному.

СОВЕТ: для создания зон API-токену достаточно права «Zone → Zone → Edit» на ресурсы аккаунта — Global API Key не обязателен.

Открытый код: https://github.com/investblog/cloudflare-tools
От создателей 301.st — редиректы, TDS и управление доменами: https://301.st
```

---

## AMO summary (≤250)

**EN** (203 chars):

```
Bulk operations for Cloudflare zones from the sidebar: create, check, delete and purge many domains at once. API tokens or Global API Key, multiple profiles, session-encrypted credentials, zero tracking.
```

**RU** (195 chars):

```
Массовые операции с зонами Cloudflare из сайдбара: создание, проверка, удаление, очистка кэша пачками. API-токены или Global API Key, несколько профилей, шифрование на время сессии, без трекинга.
```

---

## Release notes v0.2.0

**EN**

```
• API token support: user tokens (cfut_) and account-owned tokens (cfat_) alongside the Global API Key
• Multiple credential profiles with quick switching
• Toolbar button opens the panel directly (popup removed); quick actions moved into the panel
• "Select all" purge for a whole account and cross-account CSV export
• Opt-in publisher news (off by default, no identifiers sent)
• UI in English and Russian; localized store cards for 15 more languages
```

**RU**

```
• Поддержка API-токенов: пользовательские (cfut_) и токены аккаунта (cfat_) наряду с Global API Key
• Несколько профилей учётных данных с быстрым переключением
• Кнопка на панели инструментов открывает панель напрямую (попап удалён); быстрые действия переехали в панель
• «Выбрать все» для очистки кэша целого аккаунта и экспорт CSV по всем аккаунтам
• Новости издателя по явному включению (по умолчанию выключены, без идентификаторов)
• Интерфейс на английском и русском; карточки сторов локализованы ещё для 15 языков
```

---

## Keywords / tags (CWS search terms, AMO tags)

`cloudflare, bulk, zones, dns, domains, purge cache, api token, batch, seo, domain management`

---

## Short descriptions per locale (shipped in the build)

| Locale | Chars | Text |
|---|---|---|
| `de` | 127 | Massenoperationen für Cloudflare-Zonen: Domains im Paket anlegen, prüfen, löschen, Cache leeren. API-Tokens und Global API Key. |
| `en` | 122 | Bulk operations for Cloudflare zones: create, check, delete and purge many domains at once. API tokens and Global API Key. |
| `es` | 129 | Operaciones masivas con zonas de Cloudflare: crear, comprobar, borrar y purgar caché de muchos dominios. Tokens y Global API Key. |
| `fr` | 121 | Opérations en masse sur les zones Cloudflare : créer, vérifier, supprimer, purger le cache. Jetons API et Global API Key. |
| `hi` | 117 | Cloudflare ज़ोन के लिए बल्क ऑपरेशन: कई डोमेन एक साथ बनाएँ, जाँचें, हटाएँ और कैश साफ़ करें। API टोकन व Global API Key। |
| `id` | 126 | Operasi massal zona Cloudflare: buat, periksa, hapus, dan bersihkan cache banyak domain sekaligus. Token API & Global API Key. |
| `it` | 130 | Operazioni in blocco sulle zone Cloudflare: crea, verifica, elimina e svuota la cache di molti domini. Token API e Global API Key. |
| `ja` | 73 | Cloudflareゾーンの一括操作：多数のドメインをまとめて作成・確認・削除・キャッシュ削除。APIトークンとGlobal API Key対応。 |
| `ko` | 76 | Cloudflare 존 일괄 작업: 여러 도메인을 한 번에 생성·확인·삭제·캐시 퍼지. API 토큰 및 Global API Key 지원. |
| `pl` | 126 | Masowe operacje na strefach Cloudflare: twórz, sprawdzaj, usuwaj i czyść cache wielu domen naraz. Tokeny API i Global API Key. |
| `pt_BR` | 132 | Operações em massa com zonas Cloudflare: crie, verifique, exclua e limpe o cache de vários domínios. Tokens de API e Global API Key. |
| `ru` | 119 | Массовые операции с зонами Cloudflare: создание, проверка, удаление, очистка кэша пачками. API-токены и Global API Key. |
| `th` | 111 | จัดการโซน Cloudflare แบบกลุ่ม: สร้าง ตรวจสอบ ลบ และล้างแคชหลายโดเมนพร้อมกัน รองรับ API Token และ Global API Key |
| `tr` | 129 | Cloudflare bölgelerinde toplu işlem: alan adlarını topluca oluştur, denetle, sil, önbelleği temizle. API token ve Global API Key. |
| `vi` | 125 | Thao tác hàng loạt với zone Cloudflare: tạo, kiểm tra, xóa và xóa cache nhiều tên miền cùng lúc. API token và Global API Key. |
| `zh_CN` | 62 | Cloudflare 区域批量操作：批量创建、检查、删除域名并清除缓存。支持 API 令牌与 Global API Key。 |
| `zh_TW` | 62 | Cloudflare 區域批次操作：批次建立、檢查、刪除網域並清除快取。支援 API 權杖與 Global API Key。 |
