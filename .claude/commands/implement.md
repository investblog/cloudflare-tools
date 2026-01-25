# Implement Feature

Implement a specific feature from the SPEC.

## Usage

```
/implement vault
/implement cf-client
/implement queue
/implement ledger
/implement auth-ui
/implement create-ui
/implement preflight
```

## Instructions

1. Read SPEC.md section relevant to the feature
2. Check existing types in src/shared/types/
3. Implement following the patterns in CLAUDE.md
4. Add proper TypeScript types
5. Handle errors using normalizeError()
6. Test manually with `npm run dev`

## Feature Map

| Command | File(s) | SPEC Section |
|---------|---------|--------------|
| vault | src/background/vault.ts | Security > Encrypted Vault |
| cf-client | src/background/cf-client.ts | Cloudflare API |
| queue | src/background/queue.ts | Rate Limiting & Backoff |
| ledger | src/background/ledger.ts | Task Ledger (IndexedDB) |
| messaging | src/shared/messaging/protocol.ts | Architecture |
| auth-ui | src/entrypoints/sidepanel/ | UI/UX > Auth |
| create-ui | src/entrypoints/sidepanel/ | MVP > Bulk Zone Creation |
| preflight | src/background/preflight.ts | Preflight / Dry-run |

## Code Quality

- Use existing types from src/shared/types/
- Follow CSS patterns from src/assets/css/theme.css
- No external dependencies unless absolutely necessary
- Keep functions small and focused
- Add JSDoc comments for public APIs
