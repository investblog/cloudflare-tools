# Cloudflare Tools

Browser extension for bulk operations with Cloudflare zones. Add hundreds of domains, delete or purge cache in bulk — all from a convenient side panel.

## Features

### Core Operations
- **Bulk Zone Creation** — Paste domains, URLs or any text — parser extracts valid domains
- **Bulk Zone Deletion** — Select zones from paginated list and delete in one click
- **Bulk Cache Purge** — Purge "everything" for multiple zones at once
- **Preflight Check** — See which domains will be created, skipped, or are invalid before starting

### Security
- **Encrypted Vault** — Argon2id KDF + AES-256-GCM encryption
- **Master Password** — Your credentials never stored in plaintext
- **Auto-lock** — Configurable timeout (1-60 minutes)
- **Session Persistence** — Stays unlocked during browser session, locks on browser close

### UX
- **Side Panel UI** — Full interface in browser sidebar
- **Quick Actions Popup** — Purge all cache, export zones with one click
- **Dashboard Integration** — Optional buttons on Cloudflare Dashboard (feature flag)
- **Progress Tracking** — Real-time progress, ETA, pause/resume/cancel
- **Resume After Restart** — Operations persist in IndexedDB
- **Rate Limit Handling** — Automatic backoff and retry with Retry-After support

## Installation

### Chrome Web Store
Coming soon...

### Firefox Add-ons
Coming soon...

### Manual Installation (Development)

```bash
git clone https://github.com/investblog/cloudflare-tools.git
cd cloudflare-tools
npm install
npm run dev
```

Load the extension:
- **Chrome**: `chrome://extensions` → Developer Mode → Load unpacked → select `dist/chrome-mv3`
- **Firefox**: `about:debugging` → Load Temporary Add-on → select `dist/firefox-mv3/manifest.json`

## Usage

1. Click the extension icon to open Side Panel
2. Enter your Cloudflare email and Global API Key
3. Set a master password (encrypts credentials locally)
4. Select operation: Create, Delete, or Purge
5. For Create: paste domains → Check first → Start
6. For Delete/Purge: select account → select zones → confirm

### Getting Your Global API Key

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Profile → API Tokens → View Global API Key

## Tech Stack

- **Framework**: [WXT](https://wxt.dev/) (Manifest V3)
- **Language**: TypeScript
- **Encryption**: [hash-wasm](https://github.com/nickreese/hash-wasm) (Argon2id) + Web Crypto API
- **Storage**: IndexedDB (tasks), chrome.storage.local (vault), chrome.storage.session (unlock state)
- **UI**: Vanilla DOM + CSS (based on 301.st design system)

## Project Structure

```
src/
├── entrypoints/
│   ├── background.ts           # Service Worker: API, vault, queues
│   ├── popup/                   # Quick actions popup
│   ├── sidepanel/               # Main UI (create, delete, purge, settings)
│   └── cf-dashboard.content.ts  # Dashboard integration (optional)
├── background/
│   ├── vault.ts                 # Encrypted credential storage
│   ├── cf-client.ts             # Cloudflare API client
│   ├── queue.ts                 # Rate-limited request pools
│   └── ledger.ts                # IndexedDB task persistence
├── shared/
│   ├── types/                   # TypeScript interfaces
│   ├── domains/                 # Domain parser, IDN encoding
│   └── messaging/               # Type-safe message protocol
└── assets/css/                  # Styles (theme, panel, popup)
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
│  • Bulk Delete   │  • Request queues │                  │
│  • Bulk Purge    │  • Task ledger    │                  │
│  • Settings      │  • Message router │                  │
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
```

## Privacy

- **No data collection** — Zero analytics, zero tracking
- **Direct API calls** — Requests go straight to api.cloudflare.com
- **Local encryption** — Credentials encrypted with your master password
- **Open source** — Full code available for audit

[Full Privacy Policy](public/privacy.html)

## Related

- [301.st](https://301.st) — Advanced domain management with redirects, TDS, and multi-account orchestration
- [Cloudflare API Docs](https://developers.cloudflare.com/api/)

## License

MIT

## Issues

[Report bugs or request features](https://github.com/investblog/cloudflare-tools/issues)
