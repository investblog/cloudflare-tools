/**
 * Background Service Worker
 *
 * Responsibilities:
 * - CF API client (all API calls go through here)
 * - Encrypted vault (credentials storage)
 * - Rate-limited request queues
 * - Task ledger (IndexedDB persistence)
 * - Message routing to panel
 */

import {
  cfClient,
  clearAllPools,
  createPool,
  deletePool,
  isCFClientError,
  isProfileNotFoundError,
  isVaultLockedError,
  ledger,
  pauseAllPools,
  preflightPool,
  purgePool,
  resumeAllPools,
  updatePoolConcurrency,
  vault,
} from '../background';
import { setupNews } from '../background/news';
import { encodeDomain } from '../shared/domains';
import type {
  BackgroundEvent,
  BatchCompletedEvent,
  BatchProgressEvent,
  CheckPreflightResponse,
  GetAccountsResponse,
  GetBatchProgressResponse,
  GetFailedTasksResponse,
  GetIncompleteBatchesResponse,
  GetSettingsResponse,
  GetZonesResponse,
  MessageResponse,
  PreflightResult,
  ProfileAddResponse,
  ProfileChangedEvent,
  ProfileRemoveResponse,
  ProfileSwitchResponse,
  RequestMessage,
  RetryFailedResponse,
  Settings,
  SettingsChangedEvent,
  StartBatchResponse,
  VaultStatusResponse,
} from '../shared/messaging/protocol';
import type { CFAccount } from '../shared/types/api';
import {
  type CFCredential,
  type CredentialKind,
  defaultProfileLabel,
  detectCredentialKind,
  type ProfileMeta,
} from '../shared/types/credentials';
import { type PreflightStatus, resolveBatchProfileId, type TaskStatus } from '../shared/types/tasks';

// ============================================================================
// Settings Storage
// ============================================================================

const SETTINGS_KEY = 'cf_settings';

const DEFAULT_SETTINGS: Settings = {
  maxConcurrency: 4,
  enableDashboardButtons: false,
};

async function loadSettings(): Promise<Settings> {
  const stored = (await chrome.storage.local.get(SETTINGS_KEY)) || {};
  return { ...DEFAULT_SETTINGS, ...stored[SETTINGS_KEY] };
}

async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

// ============================================================================
// Batch Processing
// ============================================================================

interface ActiveBatch {
  batchId: string;
  profileId?: string; // vault profile the batch runs under (guards PROFILE_REMOVE)
  cancelled: boolean;
}

const activeBatches = new Map<string, ActiveBatch>();

async function processBatch(batchId: string): Promise<void> {
  const batch = await ledger.getBatch(batchId);
  if (!batch) {
    activeBatches.delete(batchId); // drop a possible pre-registered entry
    return;
  }

  // Resolve once: the stamped profile, or the active one for pre-v0.2.0
  // batches. A profile switch mid-batch cannot re-route a running batch.
  const profileId = resolveBatchProfileId(batch.profileId, vault.getState().activeProfileId);

  // Reuse a pre-registered entry: a PAUSE/CANCEL that landed while the ledger
  // read above was in flight already set `cancelled` on it — keep that flag.
  const activeBatch: ActiveBatch = activeBatches.get(batchId) ?? { batchId, profileId, cancelled: false };
  activeBatch.profileId = profileId;
  activeBatches.set(batchId, activeBatch);

  // Cancelled/paused before we even started: the handler already wrote the
  // ledger status — do not overwrite it with 'running'.
  if (activeBatch.cancelled) {
    activeBatches.delete(batchId);
    return;
  }

  await ledger.updateBatch(batchId, { status: 'running' });

  const tasks = await ledger.getQueuedTasks(batchId);
  const pool = batch.operation === 'create' ? createPool : batch.operation === 'delete' ? deletePool : purgePool;

  for (const task of tasks) {
    if (activeBatch.cancelled) break;

    const startTime = Date.now();

    try {
      await ledger.updateTask(task.id, { status: 'running' });

      const result: { zoneId?: string } = {};

      await pool.add(async () => {
        if (batch.operation === 'create') {
          const zone = await cfClient.createZone(encodeDomain(task.domain), batch.accountId, batch.options, profileId);
          result.zoneId = zone.id;
        } else if (batch.operation === 'delete') {
          await cfClient.deleteZone(task.domain, profileId); // task.domain is zoneId for delete
        } else if (batch.operation === 'purge') {
          await cfClient.purgeCacheEverything(task.domain, profileId); // task.domain is zoneId for purge
        }
      });

      await ledger.updateTask(task.id, {
        status: 'success',
        zoneId: result.zoneId,
        latencyMs: Date.now() - startTime,
      });
    } catch (error) {
      let status: TaskStatus = 'failed';
      let errorCode: number | undefined;
      let errorMessage: string | undefined;

      if (isCFClientError(error)) {
        errorCode = error.normalized.code;
        errorMessage = error.normalized.message;

        // Mark as skipped if zone already exists (for create)
        if (error.normalized.category === 'validation' && batch.operation === 'create') {
          status = 'skipped';
        }
        // Mark as blocked if has dependencies
        if (error.normalized.category === 'dependency') {
          status = 'blocked';
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      await ledger.updateTask(task.id, {
        status,
        errorCode,
        errorMessage,
        latencyMs: Date.now() - startTime,
      });
    }

    // Send progress update (wrapped in try/catch to not interrupt loop)
    try {
      const summary = await ledger.getBatchSummary(batchId);
      const progressEvent: BatchProgressEvent = {
        type: 'BATCH_PROGRESS',
        payload: { batchId, summary },
      };
      broadcastEvent(progressEvent);

      // Update batch counters
      await updateBatchCounters(batchId);
    } catch (progressError) {
      console.error('[CF Tools] Progress update error:', progressError);
      // Continue processing - don't let progress errors stop the batch
    }
  }

  // Paused/cancelled: the handler already set the ledger status — do NOT
  // overwrite it with 'completed' (a paused batch must stay resumable).
  if (activeBatch.cancelled) {
    activeBatches.delete(batchId);
    return;
  }

  // Batch completed
  activeBatches.delete(batchId);

  const finalSummary = await ledger.getBatchSummary(batchId);
  await ledger.updateBatch(batchId, { status: 'completed' });

  const completedEvent: BatchCompletedEvent = {
    type: 'BATCH_COMPLETED',
    payload: { batchId, summary: finalSummary },
  };
  broadcastEvent(completedEvent);
}

async function updateBatchCounters(batchId: string): Promise<void> {
  const summary = await ledger.getBatchSummary(batchId);
  await ledger.updateBatch(batchId, {
    processedCount: summary.processed,
    successCount: summary.success,
    failedCount: summary.failed,
    skippedCount: summary.skipped,
    blockedCount: summary.blocked,
  });
}

function broadcastEvent(event: BackgroundEvent): void {
  try {
    // Use Promise.resolve to ensure we handle both MV2 and MV3 behavior
    Promise.resolve(chrome.runtime.sendMessage(event)).catch(() => {
      // Panel might not be open, ignore error
    });
  } catch {
    // Synchronous error (Firefox MV2 edge case), ignore
  }
}

function broadcastProfileChanged(): void {
  const state = vault.getState();
  const event: ProfileChangedEvent = {
    type: 'PROFILE_CHANGED',
    payload: { activeProfileId: state.activeProfileId, profiles: state.profiles },
  };
  broadcastEvent(event);
}

function broadcastSettingsChanged(settings: Settings): void {
  const event: SettingsChangedEvent = { type: 'SETTINGS_CHANGED', payload: settings };
  // Broadcast to all tabs (content scripts)
  chrome.tabs.query({ url: 'https://dash.cloudflare.com/*' }).then((tabs) => {
    tabs.forEach((tab) => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, event).catch(() => {
          // Tab might not have content script, ignore
        });
      }
    });
  });
}

// ============================================================================
// Profile Helpers
// ============================================================================

function synthesizeAccount(id: string, name: string): CFAccount {
  return { id, name, type: 'standard', created_on: '' };
}

function accountForTokenProfile(accountId: string, accountName?: string): CFAccount {
  return synthesizeAccount(accountId, accountName ?? `Account ${accountId.slice(0, 8)}`);
}

/**
 * Verify a credential and discover its accounts.
 * - account-token: the account list is synthesized from the token's own
 *   account (GET /accounts is only tried to enrich the display name).
 * - global-key / user-token: discovery failure is tolerated (empty list).
 */
async function verifyAndDescribe(credential: CFCredential): Promise<{ meta: ProfileMeta; accounts: CFAccount[] }> {
  const { meta } = await cfClient.verifyCredential(credential);

  if (credential.kind === 'account-token') {
    try {
      const discovered = await cfClient.getAccounts(credential);
      const match = discovered.find((a) => a.id === credential.accountId);
      if (match) meta.accountName = match.name;
    } catch {
      // Token may lack Account Settings:Read — the synthesized name is fine
    }
    return { meta, accounts: [accountForTokenProfile(credential.accountId, meta.accountName)] };
  }

  let accounts: CFAccount[] = [];
  try {
    accounts = await cfClient.getAccounts(credential);
  } catch (e) {
    console.log('[CF Tools] Account discovery failed:', e);
  }
  return { meta, accounts };
}

/**
 * Guard for resuming/retrying a stored batch: its stamped profile must still
 * exist and be decryptable. Returns an error response, or null when OK.
 */
function batchProfileGuard(batchProfileId: string | undefined): MessageResponse<never> | null {
  const state = vault.getState();
  if (batchProfileId && !state.profiles.some((p) => p.id === batchProfileId)) {
    return {
      success: false,
      error: { code: 'PROFILE_NOT_FOUND', message: 'The profile this batch was started under has been removed' },
    };
  }
  const profileId = resolveBatchProfileId(batchProfileId, state.activeProfileId);
  if (!profileId || !vault.credentialsAvailable(profileId)) {
    return {
      success: false,
      error: {
        code: 'PROFILE_NEEDS_SECRET',
        message: 'The profile this batch runs under needs its secret re-entered',
      },
    };
  }
  return null;
}

// ============================================================================
// Message Handler
// ============================================================================

const CONTENT_SCRIPT_ALLOWED = new Set<RequestMessage['type']>(['OPEN_SIDE_PANEL', 'GET_SETTINGS', 'GET_ZONES']);

function isExtensionPageSender(sender: chrome.runtime.MessageSender): boolean {
  if (sender.id !== chrome.runtime.id) {
    return false;
  }
  const origin = chrome.runtime.getURL('');
  return Boolean(sender.url?.startsWith(origin));
}

function isContentScriptSender(sender: chrome.runtime.MessageSender): boolean {
  if (sender.id !== chrome.runtime.id) {
    return false;
  }
  const url = sender.origin ?? sender.url;
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.origin === 'https://dash.cloudflare.com';
  } catch {
    return false;
  }
}

async function handleMessage(
  message: RequestMessage,
  _sender: chrome.runtime.MessageSender,
): Promise<MessageResponse<unknown>> {
  try {
    const isExtensionPage = isExtensionPageSender(_sender);
    const isContentScript = isContentScriptSender(_sender);

    if (!isExtensionPage && !isContentScript) {
      return {
        success: false,
        error: {
          code: 'UNAUTHORIZED_SENDER',
          message: 'Message sender is not authorized',
        },
      };
    }

    if (isContentScript && !CONTENT_SCRIPT_ALLOWED.has(message.type)) {
      return {
        success: false,
        error: {
          code: 'UNAUTHORIZED_MESSAGE',
          message: `Message type ${message.type} not allowed from content scripts`,
        },
      };
    }

    switch (message.type) {
      // ====== Vault ======
      case 'VAULT_STATUS': {
        const state = vault.getState();
        const response: VaultStatusResponse = {
          isInitialized: state.isInitialized,
          isUnlocked: state.isUnlocked,
          email: state.email,
          profiles: state.profiles,
          activeProfileId: state.activeProfileId,
        };
        return { success: true, data: response };
      }

      case 'VAULT_LOCK': {
        await vault.lock();
        return { success: true, data: { success: true } };
      }

      case 'VAULT_CLEAR': {
        await vault.clearAll();
        broadcastProfileChanged();
        return { success: true, data: { success: true } };
      }

      // ====== Profiles ======
      case 'PROFILE_ADD': {
        const secret = message.payload.secret.trim();
        const { kind: kindOverride, email, accountId: manualAccountId, label } = message.payload;

        const detected = detectCredentialKind(secret);
        if (kindOverride && detected !== 'unknown' && kindOverride !== detected) {
          return {
            success: false,
            error: {
              code: 'KIND_MISMATCH',
              message: `This secret looks like a ${detected}, not a ${kindOverride}`,
            },
          };
        }
        const kind: CredentialKind | 'unknown' = kindOverride ?? detected;
        if (kind === 'unknown') {
          return {
            success: false,
            error: { code: 'KIND_REQUIRED', message: 'Cannot detect the credential type — choose it manually' },
          };
        }

        let credential: CFCredential;
        if (kind === 'global-key') {
          if (!email) {
            return {
              success: false,
              error: { code: 'EMAIL_REQUIRED', message: 'A Global API Key needs the Cloudflare account email' },
            };
          }
          credential = { kind, email, secret };
        } else if (kind === 'user-token') {
          credential = { kind, secret };
        } else {
          let accountId = manualAccountId?.trim();
          if (!accountId) {
            // Discovery: GET /accounts may or may not work for account-owned
            // tokens (depends on scopes) — fall back to manual entry.
            try {
              const probe = await cfClient.getAccounts({ kind: 'account-token', secret, accountId: '' });
              accountId = probe[0]?.id;
            } catch {
              // fall through to ACCOUNT_ID_REQUIRED
            }
            if (!accountId) {
              return {
                success: false,
                error: {
                  code: 'ACCOUNT_ID_REQUIRED',
                  message: 'Enter the Account ID this token belongs to (Cloudflare dashboard → account home)',
                },
              };
            }
          }
          credential = { kind, secret, accountId };
        }

        // Verify BEFORE storing — bad secrets are never persisted.
        const { meta, accounts } = await verifyAndDescribe(credential);

        const profile = await vault.addProfile({
          kind: credential.kind,
          secret,
          email: credential.kind === 'global-key' ? credential.email : undefined,
          accountId: credential.kind === 'account-token' ? credential.accountId : undefined,
          label: label?.trim() || defaultProfileLabel(credential.kind, meta, email),
          meta,
        });

        broadcastProfileChanged();
        const response: ProfileAddResponse = { profile, accounts };
        return { success: true, data: response };
      }

      case 'PROFILE_REAUTH': {
        const { profileId } = message.payload;
        const secret = message.payload.secret.trim();

        const stored = vault.getState().profiles.find((p) => p.id === profileId);
        if (!stored) {
          return { success: false, error: { code: 'PROFILE_NOT_FOUND', message: 'Profile not found' } };
        }

        const detected = detectCredentialKind(secret);
        if (detected !== 'unknown' && detected !== stored.kind) {
          return {
            success: false,
            error: {
              code: 'KIND_MISMATCH',
              message: `This secret looks like a ${detected}, but the profile is a ${stored.kind}`,
            },
          };
        }

        const credential: CFCredential =
          stored.kind === 'global-key'
            ? { kind: 'global-key', email: stored.email ?? '', secret }
            : stored.kind === 'user-token'
              ? { kind: 'user-token', secret }
              : { kind: 'account-token', secret, accountId: stored.accountId ?? '' };

        const { meta, accounts } = await verifyAndDescribe(credential);
        await vault.reauthProfile(profileId, secret);
        await vault.updateProfile(profileId, { meta });
        // The user just entered this profile's secret to USE it — activate it,
        // matching PROFILE_ADD semantics (the panel treats the response as active).
        await vault.setActiveProfile(profileId);

        broadcastProfileChanged();
        const profile = vault.getState().profiles.find((p) => p.id === profileId);
        const response: ProfileAddResponse = { profile: profile as NonNullable<typeof profile>, accounts };
        return { success: true, data: response };
      }

      case 'PROFILE_SWITCH': {
        const { profileId } = message.payload;
        const target = vault.getState().profiles.find((p) => p.id === profileId);
        if (!target) {
          return { success: false, error: { code: 'PROFILE_NOT_FOUND', message: 'Profile not found' } };
        }
        if (!vault.credentialsAvailable(profileId)) {
          return {
            success: false,
            error: {
              code: 'PROFILE_NEEDS_SECRET',
              message: `Profile "${target.label}" needs its secret re-entered`,
            },
          };
        }

        await vault.setActiveProfile(profileId);

        let accounts: CFAccount[];
        if (target.kind === 'account-token' && target.accountId) {
          accounts = [accountForTokenProfile(target.accountId, target.meta?.accountName)];
        } else {
          try {
            accounts = await cfClient.getAccounts();
          } catch {
            accounts = [];
          }
        }

        broadcastProfileChanged();
        const response: ProfileSwitchResponse = { activeProfileId: profileId, accounts };
        return { success: true, data: response };
      }

      case 'PROFILE_REMOVE': {
        const { profileId } = message.payload;
        for (const active of activeBatches.values()) {
          // Cancelled entries are inert leftovers — they must not block removal
          if (active.profileId === profileId && !active.cancelled) {
            return {
              success: false,
              error: {
                code: 'PROFILE_IN_USE',
                message: 'A running batch uses this profile — wait for it to finish or cancel it',
              },
            };
          }
        }

        await vault.removeProfile(profileId);
        const state = vault.getState();
        broadcastProfileChanged();
        const response: ProfileRemoveResponse = { profiles: state.profiles, activeProfileId: state.activeProfileId };
        return { success: true, data: response };
      }

      // ====== Accounts & Zones ======
      case 'GET_ACCOUNTS': {
        // An account-owned token is scoped to one account — synthesize the
        // list from the stored accountId instead of relying on GET /accounts.
        const state = vault.getState();
        const active = state.profiles.find((p) => p.id === state.activeProfileId);
        if (active?.kind === 'account-token' && active.accountId) {
          const response: GetAccountsResponse = {
            accounts: [accountForTokenProfile(active.accountId, active.meta?.accountName)],
          };
          return { success: true, data: response };
        }

        const accounts = await cfClient.getAccounts();
        const response: GetAccountsResponse = { accounts };
        return { success: true, data: response };
      }

      case 'GET_ZONES': {
        const { accountId, page, perPage } = message.payload;
        const result = await cfClient.listZones({ accountId, page, perPage });
        const response: GetZonesResponse = {
          zones: result.items,
          pagination: result.pagination,
        };
        return { success: true, data: response };
      }

      // ====== Preflight ======
      case 'CHECK_PREFLIGHT': {
        const { domains } = message.payload;
        const results: PreflightResult[] = [];

        // Check for duplicates first
        const seen = new Set<string>();
        const duplicates = new Set<string>();

        for (const domain of domains) {
          const normalized = domain.toLowerCase();
          if (seen.has(normalized)) {
            duplicates.add(normalized);
          }
          seen.add(normalized);
        }

        // Check each domain
        for (const domain of domains) {
          const normalized = domain.toLowerCase();

          if (duplicates.has(normalized) && results.some((r) => r.domain === normalized)) {
            results.push({ domain, status: 'duplicate' as PreflightStatus });
            continue;
          }

          try {
            console.log('[CF Tools] Checking domain:', domain);
            const check = await preflightPool.add(() => cfClient.checkZoneExists(encodeDomain(domain)));
            console.log('[CF Tools] Check result:', domain, check);

            if (check.exists) {
              results.push({
                domain,
                status: 'exists' as PreflightStatus,
                existingZoneId: check.zoneId,
              });
            } else {
              results.push({ domain, status: 'will-create' as PreflightStatus });
            }
          } catch (error) {
            console.error('[CF Tools] Preflight error for', domain, ':', error);
            results.push({ domain, status: 'invalid' as PreflightStatus });
          }
        }

        const response: CheckPreflightResponse = { results };
        return { success: true, data: response };
      }

      // ====== Batch Operations ======
      case 'START_BATCH': {
        const { operation, accountId, domains, zones, zoneIds, options } = message.payload;
        // For create: use domains array
        // For delete/purge: prefer zones (with names) over legacy zoneIds
        const items = operation === 'create' ? domains! : (zones ?? zoneIds!);

        // Stamp the batch with the active profile so a later profile switch
        // can never re-route it (see processBatch).
        const profileId = vault.getState().activeProfileId ?? undefined;
        if (!profileId || !vault.credentialsAvailable(profileId)) {
          return {
            success: false,
            error: {
              code: 'PROFILE_NEEDS_SECRET',
              message: 'The active profile has no usable secret — re-enter it first',
            },
          };
        }

        const batchId = await ledger.createBatch(operation, accountId, items, options, profileId);

        // Pre-register so PROFILE_REMOVE sees the batch even before
        // processBatch() populates the map (it overwrites this entry).
        activeBatches.set(batchId, { batchId, profileId, cancelled: false });

        // Start processing in background
        processBatch(batchId);

        const response: StartBatchResponse = { batchId };
        return { success: true, data: response };
      }

      case 'PAUSE_BATCH': {
        const { batchId } = message.payload;
        const activeBatch = activeBatches.get(batchId);
        if (activeBatch) {
          activeBatch.cancelled = true;
        }
        pauseAllPools();
        await ledger.updateBatch(batchId, { status: 'paused' });
        return { success: true, data: { success: true } };
      }

      case 'RESUME_BATCH': {
        const { batchId } = message.payload;

        const batch = await ledger.getBatch(batchId);
        if (!batch) {
          return { success: false, error: { code: 'NOT_FOUND', message: 'Batch not found' } };
        }

        // The batch's profile must still exist and be usable
        const guard = batchProfileGuard(batch.profileId);
        if (guard) return guard;

        // Pre-register before processBatch's own ledger await (PROFILE_REMOVE guard)
        activeBatches.set(batchId, {
          batchId,
          profileId: resolveBatchProfileId(batch.profileId, vault.getState().activeProfileId),
          cancelled: false,
        });

        resumeAllPools();
        processBatch(batchId);
        return { success: true, data: { success: true } };
      }

      case 'CANCEL_BATCH': {
        const { batchId } = message.payload;
        const activeBatch = activeBatches.get(batchId);
        if (activeBatch) {
          // Keep the flagged entry in the map: processBatch() may still be in
          // its initial ledger read and must find `cancelled: true` there
          // (it deletes the entry itself). Cancelled entries never block
          // PROFILE_REMOVE (see its guard).
          activeBatch.cancelled = true;
        }
        clearAllPools();
        await ledger.updateBatch(batchId, { status: 'cancelled' });
        return { success: true, data: { success: true } };
      }

      case 'GET_BATCH_PROGRESS': {
        const { batchId } = message.payload;
        const batch = await ledger.getBatch(batchId);
        if (!batch) {
          return {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Batch not found' },
          };
        }
        const summary = await ledger.getBatchSummary(batchId);
        const response: GetBatchProgressResponse = { batch, summary };
        return { success: true, data: response };
      }

      case 'RETRY_FAILED': {
        const { batchId } = message.payload;
        const failedTasks = await ledger.getFailedTasks(batchId);

        if (failedTasks.length === 0) {
          return {
            success: false,
            error: { code: 'NO_FAILED_TASKS', message: 'No failed tasks to retry' },
          };
        }

        const batch = await ledger.getBatch(batchId);
        if (!batch) {
          return {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Batch not found' },
          };
        }

        // The inherited profile must still exist and be usable (parity with RESUME_BATCH)
        const guard = batchProfileGuard(batch.profileId);
        if (guard) return guard;

        // Create new batch with failed items, inheriting the original profile
        const items = failedTasks.map((t) => t.domain);
        const retryProfileId = resolveBatchProfileId(batch.profileId, vault.getState().activeProfileId);
        const newBatchId = await ledger.createBatch(batch.operation, batch.accountId, items, undefined, retryProfileId);

        activeBatches.set(newBatchId, { batchId: newBatchId, profileId: retryProfileId, cancelled: false });
        processBatch(newBatchId);

        const response: RetryFailedResponse = { newBatchId, count: items.length };
        return { success: true, data: response };
      }

      case 'GET_FAILED_TASKS': {
        const { batchId } = message.payload;
        const tasks = await ledger.getFailedTasks(batchId);
        const response: GetFailedTasksResponse = { tasks };
        return { success: true, data: response };
      }

      case 'GET_INCOMPLETE_BATCHES': {
        const batches = await ledger.getIncompleteBatches();
        const response: GetIncompleteBatchesResponse = { batches };
        return { success: true, data: response };
      }

      // ====== Settings ======
      case 'GET_SETTINGS': {
        const settings = await loadSettings();
        const response: GetSettingsResponse = { settings };
        return { success: true, data: response };
      }

      case 'UPDATE_SETTINGS': {
        const currentSettings = await loadSettings();
        const newSettings = { ...currentSettings, ...message.payload };
        await saveSettings(newSettings);

        // Apply settings
        updatePoolConcurrency(newSettings.maxConcurrency);

        // Broadcast settings change to content scripts
        broadcastSettingsChanged(newSettings);

        const response: GetSettingsResponse = { settings: newSettings };
        return { success: true, data: response };
      }

      case 'OPEN_SIDE_PANEL': {
        // Open side panel for the sender tab
        // Firefox uses sidebarAction API, Chrome uses sidePanel
        if (typeof browser !== 'undefined' && browser.sidebarAction?.open) {
          await browser.sidebarAction.open();
        } else if (chrome.sidePanel?.open && _sender.tab?.id) {
          await chrome.sidePanel.open({ tabId: _sender.tab.id });
        }
        return { success: true, data: { opened: true } };
      }

      default:
        return {
          success: false,
          error: { code: 'UNKNOWN_MESSAGE', message: `Unknown message type` },
        };
    }
  } catch (error) {
    // Handle specific errors
    if (isVaultLockedError(error)) {
      return {
        success: false,
        error: { code: 'VAULT_LOCKED', message: error.message },
      };
    }

    if (isProfileNotFoundError(error)) {
      return {
        success: false,
        error: { code: 'PROFILE_NOT_FOUND', message: error.message },
      };
    }

    if (isCFClientError(error)) {
      return {
        success: false,
        error: {
          code: error.normalized.category.toUpperCase(),
          message: error.normalized.message,
          details: { recommendation: error.normalized.recommendation },
        },
      };
    }

    // Generic error
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: { code: 'INTERNAL_ERROR', message },
    };
  }
}

// ============================================================================
// Initialization
// ============================================================================

let initPromise: Promise<void> | null = null;

async function initializeModules(): Promise<void> {
  try {
    await vault.init();
    await ledger.open();

    // Load and apply settings
    const settings = await loadSettings();
    updatePoolConcurrency(settings.maxConcurrency);

    // Check for incomplete batches
    const incomplete = await ledger.getIncompleteBatches();
    if (incomplete.length > 0) {
      chrome.runtime
        .sendMessage({
          type: 'INCOMPLETE_BATCHES',
          payload: { batches: incomplete },
        })
        .catch(() => {
          // Panel might not be open
        });
    }

    console.log('[CF Tools] Background initialized');
  } catch (error) {
    console.error('[CF Tools] Initialization error:', error);
    throw error;
  }
}

async function ensureInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = initializeModules();
  }
  await initPromise;
}

const WELCOME_SEEN_KEY = 'cfTools:welcomeSeen';

/**
 * Show the welcome tab once per profile. Keyed on a storage flag rather than
 * `reason === 'install'` alone: reloading a temporary add-on (and some
 * reinstall paths) reports `update`, which would silently skip the page.
 */
async function openWelcomeOnce(reason: string): Promise<void> {
  try {
    const stored = await chrome.storage.local.get(WELCOME_SEEN_KEY);
    if (stored[WELCOME_SEEN_KEY]) return;
    if (reason !== 'install' && reason !== 'update') return;
    await chrome.storage.local.set({ [WELCOME_SEEN_KEY]: true });
    await chrome.tabs.create({ url: chrome.runtime.getURL('/welcome.html') });
  } catch (e) {
    console.warn('[CF Tools] Welcome page failed to open', e);
  }
}

export default defineBackground(() => {
  console.log('[CF Tools] Background service worker started');

  // Registered FIRST: a throw anywhere below must not cost the welcome page.
  chrome.runtime.onInstalled.addListener(({ reason }) => {
    void openWelcomeOnce(reason);
  });

  // Publisher news: alarm/notification listeners + alarm restore (opt-in, off by default)
  setupNews();

  // Start initialization immediately
  initPromise = initializeModules();

  // Toolbar button: Chromium opens the side panel; Firefox opens the sidebar
  // directly from the click gesture (sidebarAction.open requires a user action).
  // setPanelBehavior runs on every worker start, not only on install.
  const b = chrome as typeof chrome & {
    sidePanel?: { setPanelBehavior?: (opts: { openPanelOnActionClick: boolean }) => Promise<void> };
    sidebarAction?: { open: () => Promise<void> };
    browserAction?: typeof chrome.action;
  };
  b.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true })?.catch?.(() => {});
  if (b.sidebarAction && b.browserAction) {
    b.browserAction.onClicked.addListener(() => {
      b.sidebarAction?.open().catch(() => {});
    });
  }

  // Set up message handler - waits for initialization before processing
  chrome.runtime.onMessage.addListener((message: RequestMessage, sender, sendResponse) => {
    ensureInitialized()
      .then(() => handleMessage(message, sender))
      .then(sendResponse)
      .catch((error) => {
        console.error('[CF Tools] Message handler error:', error);
        sendResponse({
          success: false,
          error: { code: 'INIT_ERROR', message: error.message },
        });
      });
    return true; // Keep channel open for async response
  });

  // Note: beforeunload doesn't work in Service Workers (MV3)
  // Vault remains locked on service worker restart
});
