# Cloudflare Tools — Technical Specification

## Overview

**Cloudflare Tools** is a browser extension for bulk operations with Cloudflare zones. Works directly with the CF API using API tokens or the Global API Key, bypassing CORS restrictions.

| | |
|---|---|
| **Type** | Browser Extension |
| **Platforms** | Chrome/Edge (Side Panel), Firefox (Sidebar) |
| **Stack** | TypeScript + WXT + Vanilla DOM |
| **Quality gate** | `npm run check` = tsc + Biome + Vitest |
| **Homepage** | https://301.st |
| **Repository** | https://github.com/investblog/cloudflare-tools |

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                   Browser Extension                       │
├──────────────────────────────────────────────────────────┤
│  Side Panel (UI)    │  Background Worker   │  Welcome    │
│        ↓            │         ↓            │  page       │
│  - Profile manager  │  - CF API client     │  (once per  │
│  - Bulk Create      │  - Multi-profile     │   install)  │
│  - Check / Export   │    encrypted vault   │             │
│  - Bulk Delete      │  - Request queues    │             │
│  - Bulk Purge       │  - Task ledger       │             │
│  - Progress         │  - Publisher news    │             │
│  - Settings + News  │  - Message routing   │             │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
              Cloudflare API (direct, no proxy)
```

The toolbar button opens the panel directly: Chromium via `sidePanel.setPanelBehavior({openPanelOnActionClick})`, Firefox via `sidebarAction.open()` inside the `browser_action.onClicked` gesture (plus the `_execute_sidebar_action` command). There is no popup.

### Security Isolation

| Component | Access to Secrets |
|-----------|-------------------|
| Background Worker | Yes (only here) |
| Side Panel / Welcome | No (via messaging) |
| Content Script | No (strictly isolated) |

## Project Structure

```
src/
├── entrypoints/
│   ├── background.ts           # Service Worker entry (messages, batches, welcome, news setup)
│   ├── cf-dashboard.content.ts # Dashboard integration (optional)
│   ├── sidepanel/              # Main UI (index.html + main.ts)
│   └── welcome/                # Welcome page, opened once per install
├── background/
│   ├── index.ts                # Module exports
│   ├── vault.ts                # Multi-profile session-only encryption (v3)
│   ├── cf-client.ts            # Cloudflare API client (tokens + Global Key)
│   ├── news.ts                 # Opt-in publisher news (alarm, fetch, notifications)
│   ├── queue.ts                # Rate-limited request pools
│   └── ledger.ts               # IndexedDB task persistence
├── engine/
│   └── news.ts                 # Pure news-feed logic (parse/diff/cap) — unit-tested
├── shared/
│   ├── types/
│   │   ├── api.ts              # CFUser, CFAccount, CFZone, CFTokenVerifyResult
│   │   ├── credentials.ts      # CFCredential union, detect/buildAuthHeaders/verifyPathFor
│   │   ├── tasks.ts            # TaskEntry, BatchInfo(+profileId), resolveBatchProfileId
│   │   └── errors.ts           # normalizeError (incl. permission category)
│   ├── domains/                # parseDomains(), IDN encode/decode
│   ├── messaging/protocol.ts   # Type-safe message passing
│   ├── i18n.ts                 # t() wrapper over chrome.i18n
│   ├── news.ts                 # News opt-in flow (optional permissions)
│   ├── dom.ts                  # createSvgIcon, trustedHTML (no innerHTML)
│   ├── whats-new.ts            # Bundled release notes
│   └── theme.ts                # Theme utilities
├── public/
│   ├── _locales/{en,ru}/       # UI translations (default_locale: en)
│   └── privacy.html            # Privacy policy (bundled)
└── assets/css/                 # theme.css (tokens + primitives), panel.css
test/                           # Vitest unit tests (pure modules only)
```

## Credentials & Vault (v3)

### Credential kinds

| Kind | Secret prefix | Auth headers | Verify endpoint | Accounts |
|---|---|---|---|---|
| Global API Key | `cfk_` or legacy 37-hex | `X-Auth-Email` + `X-Auth-Key` | `GET /user` | `GET /accounts` |
| User API token | `cfut_` | `Authorization: Bearer` | `GET /user/tokens/verify` | `GET /accounts` |
| Account-owned token | `cfat_` | `Authorization: Bearer` | `GET /accounts/{id}/tokens/verify` | fixed single account |

- The kind is auto-detected from the secret (`detectCredentialKind`); unprefixed legacy tokens get a manual "credential type" selector.
- Account-owned tokens: the account id is discovered via `GET /accounts` when possible, with a manual Account-ID input fallback (`ACCOUNT_ID_REQUIRED`).
- Recommended token permission for zone creation: **Zone → Zone → Edit** on account resources (a Global API Key is NOT required).

### Vault model

- `StoredVaultV3 = { version: 3, profiles: StoredProfile[], activeProfileId }` in `chrome.storage.local`.
- One random AES-256-GCM **session key** encrypts every profile secret (unique IV each); the key + its `keyId` live in `chrome.storage.session` (Firefox MV2: in-memory fallback).
- Each profile stores the `keyId` that encrypted it → after a browser restart profiles report `needsSecret` and are re-entered via `PROFILE_REAUTH` (metadata survives, secrets do not).
- Lossless migration v2 → v3: the old single entry becomes an active `global-key` profile with ciphertext/IV carried byte-identical.
- Credentials are verified **before** they are stored.

### Batch/profile correctness

`BatchInfo.profileId` stamps every batch with the profile it started under; `processBatch`, `RETRY_FAILED` and `RESUME_BATCH` resolve credentials from the stamp. Switching the active profile mid-batch is safe and never re-routes a running batch. `PROFILE_REMOVE` refuses (`PROFILE_IN_USE`) while a running batch uses the profile.

## Features (v0.2.0)

- **Profiles** — add/switch/remove/re-enter; header switcher (≥2 profiles) + Settings manager.
- **Bulk Zone Creation** — parser (IDN aware), preflight (will-create/exists/invalid/duplicate), batch with retry.
- **Check Zones** — per-account list, CSV export, cross-account "Export all accounts" with full pagination.
- **Bulk Delete** — multi-select + confirmation.
- **Bulk Purge** — multi-select or "Select all" (loads every page of the account's zones).
- **Publisher news (opt-in)** — see below.
- **Welcome page** — once per install (storage flag; fires on install and update reasons).
- **i18n** — en (default) + ru; `t()` + static-markup localization pass.
- **Dashboard Integration** — optional buttons on dash.cloudflare.com (feature flag, default off).

## Publisher News (opt-in)

- Feed: `https://301.sh/posts.json` (shared across 301.st extensions), checked every 6h via `alarms`.
- **Off by default; zero network until enabled.** Toggles: welcome-page bell, Settings → Publisher News.
- Gated behind optional permissions: Chromium `optional_permissions: [notifications, alarms]` + `optional_host_permissions: [https://301.sh/*]`; Firefox folds the origin into `optional_permissions` and carries `alarms` in the **required** set (AMO rejects it as optional).
- Enabling seeds the seen-list (no backlog notification dump); disabling clears the alarm **before** dropping permissions; permission revocation from browser settings turns the feature off.
- The fetch carries no identifiers, credentials, or query parameters.
- `data_collection_permissions.required = ['none']` stays intact on Firefox.

## Cloudflare API

Base URL: `https://api.cloudflare.com/client/v4`

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/user` | Verify Global API Key |
| GET | `/user/tokens/verify` | Verify user token |
| GET | `/accounts/{id}/tokens/verify` | Verify account-owned token |
| GET | `/accounts` | List accounts |
| GET | `/zones` | List zones (paginated, per_page ≤ 50) |
| GET | `/zones?name=domain` | Check zone exists |
| POST | `/zones` | Create zone |
| DELETE | `/zones/:id` | Delete zone |
| POST | `/zones/:id/purge_cache` | Purge cache |

### Rate Limiting

| Parameter | Value |
|-----------|-------|
| Max concurrency | 4 (configurable, ≤8) |
| Max retries | 3 |
| Base delay | 500ms |
| Jitter | 30% |

Respects `Retry-After` on 429.

## Error Handling

`normalizeError(code, message, retryAfter?, httpStatus?, operation?)`:

| Category | Trigger | Strategy | UI |
|----------|---------|----------|-----|
| Auth | known credential codes (10000/9103/6100..) | No retry | "Check your API credentials" |
| Permission | code 9109, or HTTP 403 without key-material codes | No retry | per-operation scope hint (`PERMISSION_RECOMMENDATIONS`) |
| Rate limit (429) | | Retry with Retry-After | "Waiting..." |
| Validation (1061) | zone exists | Skip | "Skipped (exists)" |
| Dependency (1099) | | No retry | "Blocked" |
| Network / 5xx / timeout | | Retry with backoff | "Retrying..." |

## Browser Compatibility

| Browser | Version | UI |
|---------|---------|-----|
| Chrome | ≥116 | Side Panel |
| Edge | ≥116 | Side Panel |
| Firefox | ≥142 | Sidebar (MV2) |

## Build & Deploy

```bash
npm run dev / dev:firefox      # Dev server
npm run build / build:firefox / build:edge
npm run zip:all                # Store submission zips (chrome + firefox + edge)
npm run check                  # tsc + biome + vitest
```

Version lives **only** in `wxt.config.ts`. A `v*` tag drives `release.yml` (GitHub release) and `submit.yml` (Chrome/Edge auto-submit; Firefox manual — see CLAUDE.md).

## Privacy

- **No data collection** — zero analytics, zero tracking.
- **Publisher news is opt-in** — off by default; a public-feed read with no identifiers when enabled.
- **Direct API calls** — requests go straight to api.cloudflare.com.
- **Local encryption** — secrets encrypted on device, session-only key.
- **Open source** — full code available for audit.

See [Privacy Policy](docs/privacy.md).

## Links

- [301.st](https://301.st) — Advanced domain management
- [Cloudflare API Docs](https://developers.cloudflare.com/api/)
- [WXT Documentation](https://wxt.dev/)
