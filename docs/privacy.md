# Cloudflare Tools Privacy Policy

*Last updated: September 2026*

## Data Collection

Cloudflare Tools does not collect any user data. We have no servers, no analytics, and no tracking.

## Data Storage

The following data is stored locally on your device:

- **Cloudflare credentials** (API tokens or email + Global API Key, one entry per profile) — encrypted with AES-256-GCM using a random 256-bit key
- **Settings** (preferences) — stored in browser's local storage
- **Operation logs** (batch history) — stored in IndexedDB for resume functionality

All data remains on your device and is never transmitted to any external servers.

## External Connections

The extension only connects to:

- **api.cloudflare.com** — to perform zone operations using your credentials
- **301.sh** — *only if you explicitly enable publisher news* (see below)

No other external connections are made.

## Publisher News (Opt-in)

The extension can notify you about 301.st tool updates. This feature is **disabled by default**:

- Nothing is fetched until you turn it on (welcome page bell or Settings → Publisher News)
- Enabling it asks the browser for extra permissions (notifications and access to 301.sh)
- When enabled, the extension fetches a public JSON feed from `https://301.sh/posts.json` a few times a day
- The request carries **no identifiers, no credentials, and no query parameters** — it is a plain read of a public file
- Disabling the toggle removes the granted permissions and stops all fetches immediately

## Encryption

Your Cloudflare API key is encrypted using:

- **AES-256-GCM** — authenticated encryption with random 256-bit key
- **Session storage** — encryption key stored in browser session, cleared on browser close

No passwords are required. The encryption key is automatically generated and stored in session storage, which means credentials are available during your browser session but require re-entry after closing the browser.

## Session Security

For security, credentials are automatically cleared when:

- You close the browser
- You click "Disconnect" in the extension
- You clear browser data

You will need to re-enter your API token or Global API Key to continue using the extension. Profile names and settings survive; secrets do not.

## Data Deletion

You can delete all stored data at any time from Settings → "Clear All Data". This will:

- Remove encrypted credentials
- Clear all settings
- Delete operation history

## Open Source

Cloudflare Tools is open source. You can review the code at [GitHub](https://github.com/investblog/cloudflare-tools).

## Contact

For questions about this privacy policy, please open an issue on [GitHub](https://github.com/investblog/cloudflare-tools/issues).
