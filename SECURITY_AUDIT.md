# Security & Bug Audit — Cloudflare Tools (MV3 Extension)

## 1. Executive Summary

**Overall risk rating:** **High**

**Top 5 issues by severity**
1. **CFEXT-001 (High)** — Background message handler lacked sender/origin validation, enabling message spoofing from untrusted pages or extensions. (Fixed in patch.)
2. **CFEXT-002 (High)** — DOM XSS in sidepanel results/zone list rendering via `innerHTML` with API-sourced data. (Fixed in patch.)
3. **CFEXT-003 (High)** — Vault unlock state persisted by storing derived key + plaintext API key in session storage. (Fixed in patch.)
4. **CFEXT-004 (Medium)** — Cloudflare API requests lack timeout/retry/backoff and request-hardening headers (referrerPolicy/credentials/cache). 
5. **CFEXT-005 (Medium)** — Domain parser misses Unicode/IDN input + normalization gaps (trailing dot/root-only heuristics), risking incorrect batch operations.

**Quick wins (<1 day)**
- Enforce strict message sender validation in background service worker. (Included in patch.)
- Remove DOM `innerHTML` usage for API/domain rendering. (Included in patch.)
- Stop persisting derived key/API key in `chrome.storage.session`; require re-unlock after SW restart. (Included in patch.)
- Add abortable fetch + retry/backoff for 429/5xx (small, localized change).
- Normalize domains (trim, strip trailing dot, IDN → punycode, reject URLs) before enqueue.

---

## 2. Findings Table

| ID | Severity | Category | Impact | Exploitability | Affected files + lines | Repro / PoC | Recommended fix | Patch snippet |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **CFEXT-001** | High | Message Validation | Untrusted pages/extensions can invoke privileged background actions (vault ops, batch ops, CF API calls). | High if any web page can post a crafted message. | `src/entrypoints/background.ts:L220-L277` (message handler). | Before fix: open any page → `chrome.runtime.sendMessage({type:"VAULT_STATUS"})` → receive vault state without origin checks. | Validate `sender.id`, require `chrome-extension://<id>` for UI pages, allow `https://dash.cloudflare.com/*` only for content-script message types. | **Applied:** sender validation + allowlist in `handleMessage`. |
| **CFEXT-002** | High | XSS | Zone names or error strings from API/ledger can inject HTML into sidepanel UI, potentially exfiltrating vault data via extension APIs. | Medium–High if attacker controls zone names/errors. | `src/entrypoints/sidepanel/main.ts:L501-L545` and `L886-L913` (zone list + failed tasks). | Create a zone named `<img src=x onerror=alert(1)>` → view delete list → HTML executes. | Build DOM nodes with `textContent`, never `innerHTML` for user/API data. | **Applied:** DOM creation with `textContent` for zone list + failed task list. |
| **CFEXT-003** | High | Crypto / Storage | Derived key + plaintext API key persisted in session storage; attacker with extension storage access can recover secrets and perform Cloudflare operations. | Medium (requires local compromise/extension access). | `src/background/vault.ts:L71-L185` (unlock/init) and historical session restore. | Inspect `chrome.storage.session` after unlock; observe API key + derived key stored. | Do not persist derived key or plaintext API key; require re-unlock after SW restart; keep key only in memory. | **Applied:** removed session persistence for derived key/API key. |
| **CFEXT-004** | Medium | Network | API requests can hang indefinitely, leak referrer, or hammer API without respecting `Retry-After`. | Medium | `src/background/cf-client.ts:L149-L215` (fetch + fetchWithPagination). | Simulate 429 or network stall; queue hangs and may retry without backoff. | Use `AbortController` with timeout, `credentials:'omit'`, `referrerPolicy:'no-referrer'`, `cache:'no-store'`; implement retry/backoff only on 429/5xx respecting `Retry-After`. | Not patched. |
| **CFEXT-005** | Medium | Logic Bug | Unicode/IDN domains not parsed; trailing dots and root-only heuristics can drop valid domains or mis-dedupe batches. | Medium | `src/shared/domains/parser.ts:L12-L90`. | Paste `müller.de` or `example.com.` → parser returns none or inconsistent outputs. | Normalize by trimming/stripping trailing dots, using `encodeDomain` for IDN, and validating with URL/ASCII-LDH; avoid brittle SLD list. | Not patched. |
| **CFEXT-006** | Low | Crypto | AES-GCM used without additional authenticated data (AAD), so vault version/params are not bound into ciphertext. | Low | `src/background/vault.ts:L102-L178` (encrypt/decrypt). | Tamper with stored vault metadata; decryption still occurs without context binding. | Add AAD of version/salt/Argon2 params and include in stored vault schema; add migration/versioning. | Not patched. |

---

## 3. Deep Dive Sections

### 3.1 Vault & Cryptography Review

**Current design**
- Argon2id KDF parameters: `t=3`, `m=64MB`, `p=4`, `hashLen=32`. (Good baseline for interactive unlock.)
- AES-256-GCM with random 12-byte IV. Salt per vault stored in `chrome.storage.local`.
- Derived key remains in memory and auto-lock timer clears key after idle.

**Strengths**
- Nonce is random 96-bit (appropriate for AES-GCM).
- Per-device salt generated on vault initialization.
- Auto-locking is implemented and configurable.

**Gaps**
- Vault does **not** bind ciphertext to vault version/params via AAD → metadata tampering not detected. (`vault.ts` encryption/decryption). 
- Historically, the derived key + API key were stored in `chrome.storage.session` to survive SW restarts; this is now removed in the patch. 

**Recommendations**
- Add AAD (e.g., `version|argonParams|salt`) to `encrypt/decrypt` and bump vault schema version.
- Consider memory-hardness tuning for slower devices (make params adjustable) and record Argon2 params in vault metadata.

### 3.2 Trust Boundary Diagram & Message Routes (Textual)

```
[User UI: sidepanel/popup]  <-->  [Background Service Worker]
          ^                                   ^
          |                                   |
   (chrome.runtime.sendMessage)         (chrome.tabs.sendMessage)
          |                                   |
[Content Script @ dash.cloudflare.com] -----> |
```

**Key boundaries**
- Extension pages (`chrome-extension://<id>/...`) are trusted.
- Content scripts run in `https://dash.cloudflare.com/*` pages; they should only send a small subset of messages.
- Any other origin must be rejected.

**Patch included**
- Enforced sender validation and message allowlisting in `handleMessage` (background worker).

### 3.3 Storage Review

**Storage locations**
- `chrome.storage.local`: vault record (email + encrypted API key), vault config, settings.
- `IndexedDB` (`cf-tools-ledger`): batch/task metadata (domains, status, errors, timestamps).

**Secrets exposure**
- No secrets stored in IndexedDB or task ledger (only domains, status, and error messages). 
- Vault secrets are encrypted at rest; key only in memory.

**Risk**
- If a host has local access to extension storage, they can tamper with vault metadata. Without AAD, tampering may not be detected.

### 3.4 Network Hardening Review

**Current behavior**
- API requests use fetch with no timeout, retries, or `Retry-After` compliance.
- No explicit `credentials`, `referrerPolicy`, or `cache` directives.

**Recommendations**
- Wrap fetch with `AbortController` and 15–30s timeout.
- Retry only on 429/5xx with exponential backoff + jitter and respect `Retry-After`.
- Use `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, and `cache: 'no-store'` for API calls.

### 3.5 Manifest / Permissions Review

**Current permissions**
- `permissions`: `storage`, `sidePanel`
- `host_permissions`: `https://api.cloudflare.com/*`, `https://dash.cloudflare.com/*`

**Assessment**
- Permissions are relatively scoped. No `<all_urls>` and no `externally_connectable` declarations.
- CSP allows `wasm-unsafe-eval` (required for Argon2 WASM). No remote scripts declared.

**Recommendations**
- Keep host permissions scoped (already good).
- Consider moving `dash.cloudflare.com` to `optional_permissions` if dashboard integration is off by default.

### 3.6 Domain Parser Correctness & Abuse Cases

**Current behavior**
- Regex matches ASCII-LDH only; Unicode domains are ignored unless already punycode.
- Root-only logic uses a small, hard-coded list of “special SLDs,” risking false negatives.
- Does not normalize trailing dots or handle pasted URLs with path/port via robust parsing.

**Recommendations**
- Normalize input: trim, strip trailing dots, lowercase.
- Use `encodeDomain` to convert Unicode → punycode before validation.
- Validate using a `URL`-based parser or a robust ASCII-LDH validator; avoid a brittle SLD list.

---

## 4. Hardening Checklist (Ready for PR)

- [x] Add sender validation/allowlist in background message handler.
- [x] Remove `innerHTML` rendering for zone names and error strings.
- [x] Do not persist derived key or plaintext API key in `chrome.storage.session`.
- [ ] Add abortable fetch with timeout + retry/backoff for 429/5xx.
- [ ] Set `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, `cache: 'no-store'` on API requests.
- [ ] Bind AES-GCM with AAD and store Argon2 params + version in vault record.
- [ ] Normalize domains (IDN → punycode, trailing dot removal) before preflight/batch.
- [ ] Expand root-domain detection via public suffix list or a vetted library.
- [ ] Log redaction: ensure errors never include Authorization headers.
