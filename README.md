# Cloudflare Tools

Browser extension for bulk operations with Cloudflare zones.

## Features

- **Bulk Zone Creation** — Add hundreds of domains at once
- **Bulk Zone Deletion** — Remove multiple zones with one click
- **Bulk Purge Cache** — Clear cache for selected zones
- **Encrypted Storage** — Credentials encrypted with master password
- **Resume Operations** — Continue after browser restart
- **Rate Limit Handling** — Automatic backoff and retry

## Installation

### Chrome Web Store
Coming soon...

### Firefox Add-ons
Coming soon...

### Manual Installation (Development)

```bash
# Clone the repository
git clone https://github.com/admin310st/cloudflare-tools.git
cd cloudflare-tools

# Install dependencies
npm install

# Start development server
npm run dev

# Or for Firefox
npm run dev:firefox
```

Load the extension:
- **Chrome**: Navigate to `chrome://extensions`, enable Developer Mode, click "Load unpacked" and select `dist/chrome`
- **Firefox**: Navigate to `about:debugging`, click "Load Temporary Add-on" and select `dist/firefox/manifest.json`

## Usage

1. Click the extension icon or open the Side Panel
2. Enter your Cloudflare email and Global API Key
3. Set a master password to encrypt your credentials
4. Select an operation (Create, Delete, or Purge)
5. Follow the on-screen instructions

### Getting Your Global API Key

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Go to Profile → API Tokens
3. View your Global API Key

## Security

- **Local-only storage** — Credentials never leave your device
- **Encrypted vault** — Argon2id + AES-256-GCM encryption
- **Auto-lock** — Automatic lock after inactivity
- **No tracking** — No analytics or external requests
- **Open source** — Code available for audit

## Development

```bash
# Development with hot reload
npm run dev

# Build for production
npm run build

# Build for Firefox
npm run build:firefox

# Create zip for store submission
npm run zip:all

# Type check
npm run typecheck
```

## Project Structure

```
cloudflare-tools/
├── src/
│   ├── entrypoints/       # WXT entry points
│   │   ├── background.ts  # Service worker
│   │   ├── popup/         # Quick actions popup
│   │   └── sidepanel/     # Main UI
│   ├── shared/
│   │   ├── types/         # TypeScript types
│   │   ├── domains/       # Domain parser, IDN utils
│   │   └── messaging/     # Message protocol
│   ├── background/        # Background worker modules
│   └── assets/css/        # Styles
├── public/icons/          # Extension icons
├── wxt.config.ts          # WXT configuration
└── package.json
```

## Privacy Policy

- We don't collect any user data
- All requests go directly to Cloudflare API
- Credentials are encrypted locally with your master password
- No analytics, no external scripts
- [Full Privacy Policy](./privacy.html)

## License

MIT

## Links

- [301.st](https://301.st) — Advanced domain management
- [Cloudflare API Docs](https://developers.cloudflare.com/api/)
- [Report Issues](https://github.com/admin310st/cloudflare-tools/issues)
