# Cloudflare Tools — Technical Specification

## Overview

**Cloudflare Tools** is a browser extension for bulk operations with Cloudflare zones. Works directly with CF API using Global API Key, bypassing CORS restrictions.

| | |
|---|---|
| **Type** | Browser Extension |
| **Platforms** | Chrome (Side Panel), Firefox (Sidebar) |
| **Stack** | TypeScript + WXT + Vanilla DOM |
| **Homepage** | https://301.st |
| **Repository** | https://github.com/investblog/cloudflare-tools |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Browser Extension                       │
├─────────────────────────────────────────────────────────┤
│  Side Panel (UI)  │  Background Worker  │    Popup      │
│        ↓          │         ↓           │      ↓        │
│  - Auth form      │  - CF API client    │  Quick actions│
│  - Bulk Create    │  - Encrypted vault  │  Open Panel   │
│  - Bulk Delete    │  - Request queues   │               │
│  - Bulk Purge     │  - Task ledger      │               │
│  - Progress       │  - Message routing  │               │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
             Cloudflare API (direct, no proxy)
```

### Security Isolation

| Component | Access to Secrets |
|-----------|-------------------|
| Background Worker | Yes (only here) |
| Side Panel / Popup | No (via messaging) |
| Content Script | No (strictly isolated) |

## Project Structure

```
src/
├── entrypoints/
│   ├── background.ts          # Service Worker entry
│   ├── cf-dashboard.content.ts # Dashboard integration (optional)
│   ├── popup/
│   │   ├── index.html
│   │   └── main.ts
│   └── sidepanel/
│       ├── index.html
│       └── main.ts
├── background/
│   ├── index.ts               # Module exports
│   ├── vault.ts               # Session-only AES-256 encryption
│   ├── cf-client.ts           # Cloudflare API client
│   ├── queue.ts               # Rate-limited request pools
│   └── ledger.ts              # IndexedDB task persistence
├── shared/
│   ├── types/
│   │   ├── api.ts             # CFUser, CFAccount, CFZone
│   │   ├── tasks.ts           # TaskEntry, BatchInfo
│   │   └── errors.ts          # Error normalization
│   ├── domains/
│   │   ├── parser.ts          # parseDomains()
│   │   └── idn.ts             # encodeDomain(), decodeDomain()
│   ├── messaging/
│   │   └── protocol.ts        # Type-safe message passing
│   └── theme.ts               # Theme utilities
├── public/
│   └── privacy.html           # Privacy policy (bundled)
└── assets/css/
    ├── theme.css
    ├── panel.css
    └── popup.css
```

## Security Model

### Session-Only Encryption

Credentials are encrypted at rest using session-based encryption:

| Component | Storage | Lifetime |
|-----------|---------|----------|
| **Encrypted API key** | `chrome.storage.local` | Persistent |
| **AES-256 encryption key** | `chrome.storage.session` | Browser session |

**Flow:**
1. User enters Email + API Key
2. Random AES-256 key generated
3. API Key encrypted with AES-256-GCM
4. Encryption key stored in session storage
5. On browser close → session cleared → credentials locked
6. On next browser start → user re-enters credentials

**No master password required** — simpler UX while maintaining security isolation.

### Message Validation

Background worker validates all incoming messages:
- Extension pages: full access
- Content scripts (dash.cloudflare.com): limited allowlist
- Other origins: rejected

## Features

### Implemented (v0.1.0)

#### Authentication
- Email + Global API Key input
- Credential validation via `GET /user`
- Account list via `GET /accounts`
- Session-only encrypted storage
- Lock/Disconnect functionality

#### Bulk Zone Creation
- Textarea for domain input (paste any text)
- Domain parser with IDN/punycode support
- Preflight check (will-create/exists/invalid/duplicate)
- Account and zone type selection
- Jump start option
- Batch processing with progress
- Retry failed domains

#### Bulk Zone Deletion
- Account selector with zone filtering
- Paginated zone list with search
- Multi-select for batch deletion
- Confirmation dialog
- Progress tracking

#### Bulk Cache Purge
- Account selector with zone filtering
- Paginated zone list with search
- Multi-select zones
- "Purge Everything" for selected zones
- Progress tracking

#### Export
- Export zones to CSV
- Export failed tasks

#### Dashboard Integration (Optional)
- "Bulk Add" button on CF Dashboard
- "Export Zones" button
- Feature flag controlled (default: off)

### Planned

#### Phase 2: Enhancements
- API Token support (scoped permissions)
- DNS record bulk operations
- Zone settings bulk changes
- Import domains from CSV

#### Phase 3: Mobile
- Firefox for Android support
- Responsive UI for narrow screens
- Touch-optimized controls

## Cloudflare API

### Base URL
```
https://api.cloudflare.com/client/v4
```

### Auth Headers
```typescript
{
  'X-Auth-Email': email,
  'X-Auth-Key': globalApiKey,
  'Content-Type': 'application/json',
}
```

### Endpoints Used

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/user` | Verify credentials |
| GET | `/accounts` | List accounts |
| GET | `/zones` | List zones (paginated) |
| GET | `/zones?name=domain` | Check zone exists |
| POST | `/zones` | Create zone |
| DELETE | `/zones/:id` | Delete zone |
| POST | `/zones/:id/purge_cache` | Purge cache |

### Rate Limiting

Request queues with exponential backoff:

| Parameter | Value |
|-----------|-------|
| Max concurrency | 4 (configurable) |
| Max retries | 3 |
| Base delay | 500ms |
| Jitter | 30% |

Respects `Retry-After` header on 429 responses.

## Browser Compatibility

| Browser | Version | UI | Notes |
|---------|---------|-----|-------|
| Chrome | ≥114 | Side Panel | Primary target |
| Edge | ≥114 | Side Panel | Chromium-based |
| Firefox | ≥142 | Sidebar | MV2, sidebarAction API |
| Firefox Android | ≥142 | Sidebar | Planned (Phase 3) |

## Build & Deploy

### Commands
```bash
npm install           # Install dependencies
npm run dev           # Dev server (Chrome)
npm run dev:firefox   # Dev server (Firefox)
npm run build         # Production build (Chrome)
npm run build:firefox # Production build (Firefox)
npm run zip:all       # Create store submission zips
npm run typecheck     # TypeScript check
```

### Store Submission

**Chrome Web Store:**
- Upload `dist/cloudflare-tools-X.X.X-chrome.zip`
- Privacy policy: link to GitHub `docs/privacy.md`

**Firefox Add-ons:**
- Upload `dist/cloudflare-tools-X.X.X-firefox.zip`
- Add-on ID: `cf-tools@301.st`
- Minimum version: Firefox 142

## Error Handling

| Category | Strategy | UI |
|----------|----------|-----|
| Auth error | No retry | "Check credentials" |
| Rate limit (429) | Retry with backoff | "Waiting..." |
| Zone exists | Skip | "Skipped (exists)" |
| Dependency error | No retry | "Blocked" |
| Network error | Retry with backoff | "Retrying..." |

## Privacy

- **No data collection** — zero analytics, zero tracking
- **Direct API calls** — requests go straight to api.cloudflare.com
- **Local encryption** — credentials encrypted on device
- **Open source** — full code available for audit

See [Privacy Policy](docs/privacy.md) for details.

## Links

- [301.st](https://301.st) — Advanced domain management
- [Cloudflare API Docs](https://developers.cloudflare.com/api/)
- [WXT Documentation](https://wxt.dev/)
