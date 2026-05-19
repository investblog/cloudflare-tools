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
npm run zip:all      # Create zips for store submission
npm run typecheck    # TypeScript check
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Browser Extension                      │
├─────────────────────────────────────────────────────────┤
│  Side Panel (main UI)  │  Background Worker  │  Popup  │
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
| Side Panel / Popup | ❌ No (via messaging) |
| Content Script | ❌ No (strictly isolated) |

## Project Structure

```
src/
├── entrypoints/           # WXT entry points
│   ├── background.ts      # Service Worker (API, vault, queues)
│   ├── popup/             # Quick actions popup
│   │   ├── index.html
│   │   └── main.ts
│   └── sidepanel/         # Main UI
│       ├── index.html
│       └── main.ts
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
    ├── theme.css          # Design tokens
    ├── panel.css          # Side Panel styles
    └── popup.css          # Popup styles
```

## Current Status

**Version:** 0.1.0 (MVP Complete)

All core features implemented:
- Session-only encrypted vault (AES-256-GCM)
- Bulk zone creation with preflight
- Bulk zone deletion
- Bulk cache purge
- Dashboard integration (optional, feature flag)

### Planned Enhancements

**Phase 2:**
- API Token support
- DNS bulk operations
- Zone settings bulk changes

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
const headers = {
  'X-Auth-Email': email,
  'X-Auth-Key': globalApiKey,
  'Content-Type': 'application/json',
};
```

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

1. **Global API Key only** (Phase 1) — API Token support in Phase 2
2. **Content Script disabled by default** — Feature flag for store compliance
3. **No i18n yet** — English only in MVP

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

**Before changing the release/CI flow:** confirm the reusable-workflow ref still
resolves and the secrets exist (`gh secret list`). Store publishing here depends
on the external `investblog/geo-tier-builder` workflow — it is a cross-repo
contract, not visible from this repo's code alone.
