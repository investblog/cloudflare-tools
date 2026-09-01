# CLAUDE.md

This file provides guidance to Claude Code when working with the Cloudflare Tools browser extension.

## Project Overview

**Cloudflare Tools** is a browser extension for bulk operations with Cloudflare zones. It works directly with the CF API using Global API Key, bypassing CORS restrictions.

**Type:** Browser Extension (Chrome Side Panel / Firefox Sidebar)
**Stack:** TypeScript + WXT + Vanilla DOM
**Related:** 301.st project (UI design system source)

## Key Documents

| File | Purpose |
|------|---------|
| `SPEC.md` | **Primary reference** — Complete technical specification |
| `README.md` | User-facing documentation |
| `public/privacy.html` | Privacy policy for store submission |

**Always consult `SPEC.md` before implementing features.** It contains:
- Architecture decisions
- API contracts
- Security requirements
- UI/UX specifications
- Acceptance criteria

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Dev server (Chrome)
npm run dev:firefox  # Dev server (Firefox)
npm run build        # Production build (Chrome)
npm run build:firefox # Production build (Firefox)
npm run build:edge   # Production build (Edge)
npm run zip:all      # Create zips for store submission (chrome+firefox+edge)
npm run typecheck    # TypeScript check
npm run lint         # Biome lint (npm run lint:fix to autofix)
npm run test         # Vitest unit tests (test/)
npm run check        # Gate: typecheck + lint + tests
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Browser Extension                      │
├─────────────────────────────────────────────────────────┤
│  Side Panel (main UI)  │  Background Worker  │ Welcome │
│         ↓              │         ↓           │    ↓    │
│  - Auth form           │  - CF API client    │  Quick  │
│  - Bulk Create         │  - Encrypted vault  │  actions│
│  - Bulk Delete         │  - Request queues   │         │
│  - Bulk Purge          │  - Task ledger      │         │
│  - Progress/Results    │  - Message routing  │         │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
              Cloudflare API (direct, no proxy)
```

### Key Principle: Isolation

| Component | Access to Secrets |
|-----------|-------------------|
| Background Worker | ✅ Yes (only here) |
| Side Panel / Welcome | ❌ No (via messaging) |
| Content Script | ❌ No (strictly isolated) |

## Project Structure

```
src/
├── entrypoints/           # WXT entry points
│   ├── background.ts      # Service Worker (API, vault, queues)
│   ├── sidepanel/         # Main UI
│   │   ├── index.html
│   │   └── main.ts
│   └── welcome/           # Welcome page (once per install)
├── background/            # Background worker modules
│   ├── vault.ts           # Session-only AES-256-GCM encryption
│   ├── cf-client.ts       # Cloudflare API client
│   ├── queue.ts           # Rate-limited request pools
│   └── ledger.ts          # IndexedDB task persistence
├── shared/
│   ├── types/             # TypeScript interfaces
│   │   ├── api.ts         # CFUser, CFAccount, CFZone
│   │   ├── tasks.ts       # TaskEntry, BatchInfo
│   │   └── errors.ts      # ErrorKind, normalizeError()
│   ├── domains/           # Domain utilities
│   │   ├── parser.ts      # parseDomains()
│   │   └── idn.ts         # encodeDomain(), decodeDomain()
│   └── messaging/         # Message protocol (to create)
│       └── protocol.ts    # Type-safe message passing
└── assets/css/            # Styles (from 301.st)
    ├── theme.css          # Design tokens + shared primitives
    └── panel.css          # Side Panel styles
```

## Current Status

**Version:** 0.2.0 (Tokens & News)

All core features implemented:
- Multi-profile session-only encrypted vault (v3): Global API Key, user tokens (`cfut_`), account-owned tokens (`cfat_`), auto-detect by prefix
- Bulk zone creation with preflight
- Bulk zone deletion; bulk cache purge incl. whole-account Select all
- Cross-account CSV export with full pagination
- Direct panel opening (popup removed); welcome page once per install
- Opt-in publisher news (301.sh feed, optional permissions, off by default)
- i18n: en + ru (`public/_locales`, `t()` from `src/shared/i18n.ts`)
- Dashboard integration (optional, feature flag)

### Planned Enhancements

**v0.3.0:**
- Domain distribution across accounts/profiles (free-plan zone limit spill-over)
- DNS bulk operations
- Zone settings bulk changes (SSL mode, Always Use HTTPS, min TLS)

**Phase 3:**
- Firefox for Android support
- Responsive mobile UI

## Cloudflare API

### Base URL
```
https://api.cloudflare.com/client/v4
```

### Auth Headers
```typescript
// Global API Key                          // API tokens (cfut_/cfat_)
{ 'X-Auth-Email': email,                   { Authorization: `Bearer ${token}` }
  'X-Auth-Key': globalApiKey }
// built by buildAuthHeaders() in src/shared/types/credentials.ts
```

Verification endpoints: Global Key → `GET /user`; user token → `GET /user/tokens/verify`;
account-owned token → `GET /accounts/{id}/tokens/verify`.

### Key Endpoints

```
GET  /user                      # Verify credentials
GET  /accounts                  # List accounts
GET  /zones?account.id=X        # List zones (paginated)
GET  /zones?name=domain.com     # Check if zone exists (preflight)
POST /zones                     # Create zone
DELETE /zones/:id               # Delete zone
POST /zones/:id/purge_cache     # Purge cache
```

### POST /zones Body
```typescript
{
  name: string;              // Required
  account: { id: string };   // Required
  type?: 'full' | 'partial'; // Default: 'full'
  jump_start?: boolean;      // Default: true
}
```

## Security Model

1. **Session-only encryption** — AES-256-GCM with random key in session storage
2. **No master password** — Credentials re-entered after browser restart
3. **Credentials isolated** — Only background worker has access
4. **Message validation** — Sender origin checked for all messages
5. **No external servers** — All requests direct to CF API
6. **Minimal permissions** — Only `storage`, `sidePanel`, `host_permissions`

## Error Handling

Use `normalizeError()` from `src/shared/types/errors.ts`:

| Category | Strategy | UI Action |
|----------|----------|-----------|
| `auth` | No retry | "Check credentials" |
| `rate_limit` | Retry with Retry-After | Badge "waiting" |
| `validation` | Skip | "skipped (exists)" |
| `dependency` | No retry | "blocked → go to Dashboard" |
| `network` | Retry with backoff | Badge "retrying" |

## UI/UX Guidelines

### From 301.st Design System

- **No fixed heights** — Use `padding + line-height` formula
- **Border radius**: Buttons → `--r-pill`, Inputs → `--r-field`
- **Spacing tokens**: `--space-1` through `--space-6`
- **Dark theme** by default

### Preflight Status Badges

| Status | Color | Description |
|--------|-------|-------------|
| `will-create` | Green | Zone doesn't exist, will be created |
| `exists` | Gray | Zone already exists → skip |
| `invalid` | Red | Invalid domain |
| `duplicate` | Yellow | Duplicate in input |

### Task Status Icons

| Status | Icon | Retryable |
|--------|------|-----------|
| `queued` | hourglass | — |
| `running` | spinner | — |
| `success` | check | No |
| `failed` | cross | Yes |
| `skipped` | skip | No |
| `blocked` | ban | No |

## Testing Checklist

Before any release, verify:

- [ ] Auth: login, disconnect, session restore
- [ ] Preflight: correct counts for will-create/exists/invalid/duplicate
- [ ] Create: batch progress, retry, idempotent (no duplicates)
- [ ] Delete: pagination, account filter, confirmation
- [ ] Purge: batch progress, success/failed tracking
- [ ] Export: CSV with all fields

### Browser Matrix

| Browser | Version | UI |
|---------|---------|-----|
| Chrome | ≥114 | Side Panel |
| Edge | ≥114 | Side Panel |
| Firefox | ≥142 | Sidebar |

## Common Patterns

### Sending Messages to Background

```typescript
// From panel/popup
const response = await sendMessage({
  type: 'VAULT_SETUP',
  payload: { email, apiKey }
});
```

### Handling in Background

```typescript
// In background.ts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true; // Keep channel open for async response
});
```

### Rate-Limited API Call

```typescript
// Using queue
const result = await createPool.add(async () => {
  return cfClient.createZone(domain, accountId);
});
```

### Task Ledger Update

```typescript
// After each operation
await ledger.updateTask(taskId, {
  status: 'success',
  zoneId: result.id,
  latencyMs: Date.now() - startTime,
});
```

## Known Limitations

1. **Content Script disabled by default** — Feature flag for store compliance
2. **`cfat_` + `GET /accounts`** — account discovery for account-owned tokens is probed with a manual Account-ID fallback (unverified whether CF allows it without extra scopes)
3. **One profile active at a time** — running batches are stamped with their profile and are safe across switches; parallel multi-profile batches come with v0.3.0

## Related Resources

- [WXT Documentation](https://wxt.dev/)
- [Cloudflare API Docs](https://developers.cloudflare.com/api/)
- [Chrome Side Panel API](https://developer.chrome.com/docs/extensions/reference/sidePanel/)
- [301.st Design System](../301-ui/docs/StyleGuide.md) — UI patterns reference

## Releasing / store deploy

Version lives **only** in `wxt.config.ts` (`manifest.version`); `package.json` is not
used by the build. To release: bump it, then `git tag vX.Y.Z && git push origin vX.Y.Z`.

A `v*` tag drives two workflows:
- `release.yml` — typecheck/lint/test + a GitHub release with the built ZIPs.
- `submit.yml` — a thin caller of the **shared reusable workflow**
  `investblog/geo-tier-builder/.github/workflows/store-submit.yml@main`.

**Chrome + Edge auto-submit on the tag; Firefox is manual** (Actions → *Submit to
stores* → `stores=firefox`; AMO burns version numbers forever, so it never
auto-runs). The manual dispatch has a `dry_run` toggle that validates
credentials without publishing.

Store credentials are this repo's **GitHub Actions secrets** (`CHROME_*`,
`FIREFOX_*`, `EDGE_*`). API creds are account-level and shared across all
investblog extensions; only the per-extension IDs (`CHROME_EXTENSION_ID`,
`FIREFOX_EXTENSION_ID`, `EDGE_PRODUCT_ID`) differ.

**When a release changes the permission set** (as v0.2.0 did with the optional
news permissions): the Chrome auto-submit will UPLOAD the package but FAIL the
publish step with "Publish condition not met: ... privacy information" — the
Privacy practices tab in the CWS Dev Console must be updated (per-permission
justifications + data-usage declarations) BEFORE publishing. The uploaded draft
survives; finish the submit by clicking "Submit for review" in the console —
do NOT re-run the workflow (re-uploading the same version is rejected).

**Before changing the release/CI flow:** confirm the reusable-workflow ref still
resolves and the secrets exist (`gh secret list`). Store publishing here depends
on the external `investblog/geo-tier-builder` workflow — it is a cross-repo
contract, not visible from this repo's code alone.
