# Firefox Add-ons Review — Build Instructions

This document provides step-by-step instructions for building the Cloudflare Tools extension from source.

## Quick Build (TL;DR)

```bash
npm install
npm run build:firefox
```

Output: `dist/firefox-mv2/` directory

---

## System Requirements

| Requirement | Version | Notes |
|-------------|---------|-------|
| **OS** | Windows, macOS, or Linux | Any modern OS |
| **Node.js** | 18.x or 20.x+ | LTS recommended |
| **npm** | 9.x or 10.x+ | Included with Node.js |

### Tested Environment

- Node.js: v22.11.0
- npm: 11.4.2
- OS: Windows 11, macOS 14, Ubuntu 22.04

---

## Step-by-Step Build Instructions

### 1. Install Node.js

Download and install Node.js LTS from https://nodejs.org/

Verify installation:
```bash
node --version   # Should output v18.x, v20.x, or v22.x
npm --version    # Should output 9.x, 10.x, or 11.x
```

### 2. Extract Source Code

Extract the source archive to any directory:
```bash
unzip cloudflare-tools-source.zip
cd cloudflare-tools
```

### 3. Install Dependencies

```bash
npm install
```

This installs:
- `wxt` (v0.19.x) — Extension build tool
- `typescript` (v5.7.x) — TypeScript compiler

All dependencies are from npm registry. No private packages.

### 4. Build for Firefox

```bash
npm run build:firefox
```

This command:
1. Compiles TypeScript to JavaScript
2. Bundles the extension using Vite
3. Generates Firefox MV2 manifest
4. Outputs to `dist/firefox-mv2/`

### 5. Verify Build Output

The `dist/firefox-mv2/` directory should contain:

```
dist/firefox-mv2/
├── manifest.json
├── background.js
├── popup.html
├── sidepanel.html
├── privacy.html
├── chunks/
│   ├── popup-*.js
│   ├── sidepanel-*.js
│   └── theme-*.js
├── content-scripts/
│   └── cf-dashboard.js
├── assets/
│   ├── popup-*.css
│   ├── sidepanel-*.css
│   └── theme-*.css
└── icons/
    ├── icon-16.png
    ├── icon-48.png
    └── icon-128.png
```

### 6. Create ZIP for Comparison (Optional)

```bash
npm run zip:firefox
```

Output: `.output/cloudflare-tools-0.1.0-firefox.zip`

---

## Build Script Details

The build process uses [WXT](https://wxt.dev/), an open-source extension framework.

**Build command:** `wxt build -b firefox`

**What it does:**
1. Reads `wxt.config.ts` for manifest configuration
2. Processes TypeScript files in `src/entrypoints/`
3. Bundles shared modules from `src/background/` and `src/shared/`
4. Copies static assets from `src/public/` and `src/assets/`
5. Generates Firefox MV2-compatible manifest.json
6. Outputs to `dist/firefox-mv2/`

**No code obfuscation or minification** — output is readable JavaScript.

---

## Source Code Structure

```
src/
├── entrypoints/           # Extension entry points
│   ├── background.ts      # Service worker
│   ├── cf-dashboard.content.ts  # Content script
│   ├── popup/             # Popup UI
│   └── sidepanel/         # Sidebar UI
├── background/            # Background modules
│   ├── vault.ts           # Credential encryption
│   ├── cf-client.ts       # Cloudflare API client
│   ├── queue.ts           # Rate limiting
│   └── ledger.ts          # Task storage
├── shared/                # Shared utilities
│   ├── types/             # TypeScript types
│   ├── domains/           # Domain parsing
│   ├── messaging/         # Message protocol
│   └── theme.ts           # Theme utilities
├── public/                # Static files (copied as-is)
│   └── privacy.html
└── assets/                # CSS stylesheets
```

---

## Third-Party Libraries

This extension has **no runtime dependencies**. All code is original.

**Build-time only:**
- `wxt` — Extension bundler (MIT license)
- `typescript` — Type checker (Apache 2.0 license)

---

## Troubleshooting

### "npm install" fails
- Ensure Node.js 18+ is installed
- Try: `npm cache clean --force && npm install`

### Build output differs from submitted ZIP
- Chunk hashes may vary between builds (Vite generates content-based hashes)
- The actual code content should be identical
- Compare `manifest.json` and main entry files for verification

### TypeScript errors
- Run `npm run typecheck` to see any type issues
- Ensure you're using the correct Node.js version

---

## Contact

- **Repository:** https://github.com/investblog/cloudflare-tools
- **Issues:** https://github.com/investblog/cloudflare-tools/issues
- **Homepage:** https://301.st
