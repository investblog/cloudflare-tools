# Cloudflare Tools

Browser extension for bulk operations with Cloudflare zones. Add hundreds of domains, delete or purge cache in bulk — all from a convenient side panel.

## Features

### Core Operations
- **Bulk Zone Creation** — Paste domains, URLs or any text — parser extracts valid domains
- **Bulk Zone Deletion** — Select zones from paginated list and delete in one click
- **Bulk Cache Purge** — Purge "everything" for selected zones, or **a whole account** via Select all
- **Check Zones** — View all zones in account, refresh, export to CSV — including **all accounts at once**
- **Preflight Check** — See which domains will be created, skipped, or are invalid before starting

### Credentials
- **API Tokens & Global API Key** — user tokens (`cfut_`), account-owned tokens (`cfat_`) or the classic Global API Key; the kind is auto-detected from the pasted secret
- **Multiple profiles** — keep several accounts/credentials and switch between them from the header

### Security
- **Encrypted Vault** — AES-256-GCM with random 256-bit key
- **Session-only** — Encryption key stored in session storage, cleared on browser close
- **No passwords** — Credentials auto-available during session, re-enter on browser restart
- **Isolated storage** — Extension storage not accessible by websites or other extensions

### UX
- **Side Panel UI** — Full interface in browser sidebar; the toolbar button opens it directly
- **English & Russian UI** — follows the browser language
- **Opt-in publisher news** — off by default, no identifiers sent
- **Dashboard Integration** — Optional buttons on Cloudflare Dashboard (feature flag)
- **Progress Tracking** — Real-time progress, ETA, pause/resume/cancel
- **Resume After Restart** — Operations persist in IndexedDB
- **Rate Limit Handling** — Automatic backoff and retry with Retry-After support

## Installation

### Chrome Web Store
→ [Cloudflare Tools](https://chromewebstore.google.com/detail/gncbekdjakchefiiahjbjlbhhfijoikp?utm_source=github-readme)

### Firefox Add-ons
→ [Cloudflare Tools](https://addons.mozilla.org/en-US/firefox/addon/cloudflare-tools/)

### Manual Installation (Development)

```bash
git clone https://github.com/investblog/cloudflare-tools.git
cd cloudflare-tools
npm install
npm run dev
```

Load the extension:
- **Chrome**: `chrome://extensions` → Developer Mode → Load unpacked → select `dist/chrome-mv3`
- **Firefox**: `about:debugging` → Load Temporary Add-on → select `dist/firefox-mv2/manifest.json`

## Usage

1. Click the extension icon to open the Side Panel (sidebar on Firefox)
2. Paste an API token (`cfut_` / `cfat_`) or your Global API Key (email required for the key)
3. Select operation: Create, Check, Delete, or Purge
4. For Create: paste domains → Check first → Start
5. For Check: select account → view zones → Refresh or Export CSV
6. For Delete/Purge: select account → select zones → confirm

> **Note**: Credentials are encrypted and stored locally. You'll need to re-enter them after closing the browser.

### Getting Credentials

1. Go to [Cloudflare Dashboard → API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Either create an API token (recommended; `Zone → Zone → Edit` on your account covers create/delete, add `Cache Purge` for purging), or view the Global API Key
3. Account-owned tokens are created under Account → Manage Account → API Tokens

## Tech Stack

- **Framework**: [WXT](https://wxt.dev/) (Manifest V3)
- **Language**: TypeScript
- **Encryption**: Web Crypto API (AES-256-GCM)
- **Storage**: IndexedDB (tasks), chrome.storage.local (encrypted vault), chrome.storage.session (key)
- **UI**: Vanilla DOM + CSS (based on 301.st design system)

## Project Structure

```
src/
├── entrypoints/
│   ├── background.ts           # Service Worker: API, vault, queues, news
│   ├── sidepanel/               # Main UI (create, check, delete, purge, settings)
│   ├── welcome/                 # Welcome page (once per install)
│   └── cf-dashboard.content.ts  # Dashboard integration (optional)
├── background/
│   ├── vault.ts                 # Multi-profile encrypted credential storage
│   ├── cf-client.ts             # Cloudflare API client (tokens + Global Key)
│   ├── news.ts                  # Opt-in publisher news (alarm + notifications)
│   ├── queue.ts                 # Rate-limited request pools
│   └── ledger.ts                # IndexedDB task persistence
├── engine/                      # Pure logic (news feed parsing)
├── shared/
│   ├── types/                   # TypeScript interfaces (credentials, api, tasks)
│   ├── domains/                 # Domain parser, IDN encoding
│   ├── messaging/               # Type-safe message protocol
│   └── i18n.ts / news.ts / …    # Shared utilities
├── public/_locales/{en,ru}/     # UI translations
└── assets/css/                  # Styles (theme, panel)
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Browser Extension                      │
├─────────────────────────────────────────────────────────┤
│  Side Panel      │  Background SW    │  Content Script  │
│  (main UI)       │  (has secrets)    │  (Dashboard)     │
│                  │                   │                  │
│  • Auth form     │  • Vault          │  • Bulk Add btn  │
│  • Bulk Create   │  • CF API client  │  • Export btn    │
│  • Check Zones   │  • Request queues │                  │
│  • Bulk Delete   │  • Task ledger    │                  │
│  • Bulk Purge    │  • Message router │                  │
│  • Settings      │                   │                  │
└─────────────────────────────────────────────────────────┘
         ↓                   ↓
    chrome.runtime      Cloudflare API
      .sendMessage      (direct, no proxy)
```

**Security principle**: Only Background Service Worker has access to credentials. Panel and Content Script communicate via messages.

## Development

```bash
npm run dev          # Dev server (Chrome)
npm run dev:firefox  # Dev server (Firefox)
npm run build        # Production build
npm run build:firefox
npm run zip:all      # Create zips for store submission
npm run typecheck    # TypeScript check
npm run lint         # Biome lint
npm run test         # Vitest unit tests
npm run check        # typecheck + lint + tests
```

## Privacy

- **No data collection** — Zero analytics, zero tracking
- **Publisher news is opt-in** — off by default; when enabled it fetches a public feed from 301.sh without any identifiers
- **Direct API calls** — Requests go straight to api.cloudflare.com
- **Local encryption** — Credentials encrypted with AES-256-GCM, key in session storage
- **Open source** — Full code available for audit

[Full Privacy Policy](docs/privacy.md)

## Related

- [301.st](https://301.st) — Advanced domain management with redirects, TDS, and multi-account orchestration
- [Cloudflare API Docs](https://developers.cloudflare.com/api/)

## License

MIT

## Issues

[Report bugs or request features](https://github.com/investblog/cloudflare-tools/issues)
