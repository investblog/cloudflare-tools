# Plan: v0.2.0 "Tokens & News" (+ v0.3.0 outline)

Status: **released 2026-09-01** — tag v0.2.0, GitHub release + Edge auto-submitted;
CWS package uploaded, publish blocked on the Privacy practices tab (see CLAUDE.md);
Firefox submit is manual. Post-review UI polish + 2 Codex gate sessions (5 rounds,
all findings fixed) landed before the tag. Store console texts: docs/store-listings.md,
store-descriptions-{chrome,firefox}.md, store-permissions.md; assets: store-assets/
(gitignored). v0.3.0 outline below remains open.

Still unverified (owner): live-token checks (`cfat_` + `GET /accounts` discovery),
manual browser matrix run (incl. v0.1.2→0.2.0 migration), Edge review URL
(wxt.config.ts TODO — falls back to the CWS listing until the Edge product URL is set).
Reference donor: `W:\Projects\geo-tier-builder` @ v0.4.2 (2cbaac3) — Firefox sidebar entry,
opt-in publisher news, welcome page, i18n, biome/vitest infra. Port, don't reinvent.

## Premise correction (recorded)

Global API Key is **not** required for bulk zone creation. `POST /zones` works with a
Bearer token that has `Zone → Zone → Edit` on account resources (CF docs confirm).
Tokens are a full replacement for every operation we do (create / list / delete / purge).

New CF secret formats allow auto-detecting the credential kind by prefix:

| Prefix | Kind | Auth | Verify endpoint |
|---|---|---|---|
| `cfk_` (or legacy 37-hex) | Global API Key | `X-Auth-Email` + `X-Auth-Key` | `GET /user` |
| `cfut_` | User API token | `Authorization: Bearer` | `GET /user/tokens/verify` |
| `cfat_` | Account-owned token | `Authorization: Bearer` | `GET /accounts/{id}/tokens/verify` |

Open question (verify empirically on a live `cfat_` token): whether `GET /accounts`
works for account-owned tokens without extra permissions; needed to discover the
account id before verification. Fallback: ask the user for the account ID in the form.

## v0.2.0 scope

### 1. Credential profiles (multi-account vault)

- `shared/types/credentials.ts` — discriminated union `CFCredential`
  (`global-key` | `user-token` | `account-token`), prefix-based auto-detect.
- `vault.ts` → schema `version: 3`: `profiles: StoredProfile[]` + `activeProfileId`;
  each secret encrypted separately (same AES-256-GCM session-key model).
  Migration v2 → v3: existing entry becomes profile "Global".
- `cf-client.ts` — single `buildHeaders(credential)`; merge the duplicated
  `fetch` / `fetchWithPagination` bodies while touching this.
- Messaging: profile CRUD + `SWITCH_PROFILE`; panel header shows active profile.
- Permission diagnostics after connect: probe what the token can do and disable
  unavailable tabs instead of failing mid-batch with 403.
- Auth form: one secret field, kind detected by prefix (manual override select for
  legacy hex keys); email field only shown for Global Key.

### 2. Publisher news (ported from geo-tier-builder)

- Port verbatim: `engine/news.ts` (pure logic + its vitest suite),
  `shared/news.ts` (constants, opt-in toggle, optional-permission flow),
  `background/news.ts` (alarm, fetch, notifications, serialized state).
  Rename storage keys to `cfTools:*`. Feed stays `https://301.sh/posts.json`.
- Manifest: optional `notifications` (+ `alarms` on Chromium; on Firefox `alarms`
  goes into **required** — AMO rejects it as optional) and optional host
  `https://301.sh/*` (folded into `optional_permissions` on Firefox MV2).
- Bell toggle on the welcome page and in Settings.
- Bundled "What's new" note (from a small JSON in the build) shown in About/welcome —
  no network, complements the feed.
- Docs: privacy.html / AMO_README mention the opt-in fetch; `data_collection_permissions`
  stays `['none']` (same stance geo-tier-builder shipped with).

### 3. Entry UX (ported)

- **Drop the popup.** Firefox: `browser_action` with no popup, `sidebarAction.open()`
  directly in the click handler (user gesture required), `_execute_sidebar_action`
  command. Chromium: `sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`
  on every worker start. Popup quick actions already exist as panel tabs.
- Welcome page, opened once per profile (storage flag, fires on `install` and
  `update` so temporary-addon reloads don't skip it).

### 4. i18n RU/EN

- `_locales/{en,ru}/messages.json`, `__MSG_extName__` in manifest, `t()` wrapper
  from the reference. Panel strings move to messages; other locales can fall back later.

### 5. Infra

- biome + vitest + `check` script (copy configs from the reference), path aliases.
- Tests: vault migration v2→v3, credential detect, news engine (ported suite).

## v0.3.0 outline (agreed, next release)

- **Domain distribution across accounts/profiles** — split a bulk-create batch over
  several profiles; detect the free-plan zone limit error and spill to the next profile.
- **Bulk zone settings** — SSL mode, Always Use HTTPS, min TLS, Auto HTTPS Rewrites.
- **DNS bulk (A/CNAME)** — records onto freshly created zones.

## Release notes

- Version lives only in `wxt.config.ts`; tag `v0.2.0` drives release.yml + submit.yml
  (Chrome/Edge auto, Firefox manual — AMO burns version numbers).
- Permission set changes (new optional permissions) → expect a slower store review;
  keep the required set unchanged.
