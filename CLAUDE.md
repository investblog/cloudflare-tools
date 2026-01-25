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
├── background/            # Background worker modules (to create)
│   ├── vault.ts           # Argon2id + AES-GCM encryption
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

## Implementation Roadmap

### Phase 1: Core Infrastructure (Current)

1. **`src/background/vault.ts`** — Encrypted storage
   - Argon2id KDF (per-device salt)
   - AES-256-GCM encryption
   - Master password flow
   - Auto-lock on timeout / SW unload

2. **`src/background/cf-client.ts`** — API client
   - Global API Key headers
   - Response typing
   - Error normalization

3. **`src/background/queue.ts`** — Rate limiting
   - Per-operation pools: `createPool`, `deletePool`, `purgePool`, `preflightPool`
   - Config: `maxConcurrency=4`, `maxRetries=3`, `baseDelay=500ms`
   - Backoff: `min(cap, base * 2^attempt) + jitter`
   - Respect `Retry-After` header

4. **`src/background/ledger.ts`** — Task persistence
   - IndexedDB schema for `TaskEntry`
   - Checkpoints after each step
   - Resume after restart
   - "Retry failed only"

5. **`src/shared/messaging/protocol.ts`** — Message passing
   - Type-safe request/response
   - Panel ↔ Background communication

### Phase 2: UI Implementation

1. **Auth View** — Email + API Key + Master Password
2. **Create View** — Textarea → Preview → Preflight → Progress
3. **Delete View** — Account selector → Zone list (paginated) → Multi-select
4. **Purge View** — Same as Delete + "Purge Everything"
5. **Progress View** — Summary, ETA, Pause/Resume/Cancel
6. **Results View** — Success/Failed lists, Export

### Phase 3: Polish

1. Settings (auto-lock, rate limits, feature flags)
2. Content Script (Dashboard buttons, behind feature flag)
3. Store submission (icons, descriptions, screenshots)

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

## Security Requirements

1. **Encryption is mandatory** — No plaintext credentials in storage
2. **Master password required** on first launch
3. **Auto-lock** after 15 min inactivity (configurable 1-60)
4. **Immediate lock** on Service Worker unload
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

- [ ] Auth: login, auto-lock, lock now, unlock
- [ ] Preflight: correct counts for will-create/exists/invalid/duplicate
- [ ] Create: batch progress, retry, idempotent (no duplicates)
- [ ] Delete: pagination, account filter, confirmation
- [ ] Purge: batch progress, success/failed tracking
- [ ] Resume: after browser restart
- [ ] Export: CSV/JSON with all fields

### Browser Matrix

| Browser | Version | UI |
|---------|---------|-----|
| Chrome | ≥114 | Side Panel |
| Edge | ≥114 | Side Panel |
| Firefox | ≥120 | Sidebar |

## Common Patterns

### Sending Messages to Background

```typescript
// From panel/popup
const response = await chrome.runtime.sendMessage({
  type: 'AUTH_LOGIN',
  payload: { email, apiKey, masterPassword }
});
```

### Handling in Background

```typescript
// In background.ts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'AUTH_LOGIN') {
    handleLogin(message.payload).then(sendResponse);
    return true; // Keep channel open for async response
  }
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
