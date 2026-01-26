/**
 * Background Service Worker
 *
 * Responsibilities:
 * - CF API client (all API calls go through here)
 * - Encrypted vault (credentials storage)
 * - Rate-limited request queues
 * - Task ledger (IndexedDB persistence)
 * - Message routing to panel/popup
 */

import {
  vault,
  cfClient,
  ledger,
  preflightPool,
  createPool,
  deletePool,
  purgePool,
  pauseAllPools,
  resumeAllPools,
  clearAllPools,
  updatePoolConcurrency,
  isVaultLockedError,
  isCFClientError,
} from '../background';

import type {
  RequestMessage,
  MessageResponse,
  VaultStatusResponse,
  VaultSetupResponse,
  GetAccountsResponse,
  GetZonesResponse,
  CheckPreflightResponse,
  PreflightResult,
  StartBatchResponse,
  GetBatchProgressResponse,
  RetryFailedResponse,
  GetFailedTasksResponse,
  GetIncompleteBatchesResponse,
  GetSettingsResponse,
  Settings,
  BatchProgressEvent,
  BatchCompletedEvent,
} from '../shared/messaging/protocol';

import type { PreflightStatus, TaskStatus } from '../shared/types/tasks';
import { encodeDomain } from '../shared/domains';

// ============================================================================
// Settings Storage
// ============================================================================

const SETTINGS_KEY = 'cf_settings';

const DEFAULT_SETTINGS: Settings = {
  maxConcurrency: 4,
  enableDashboardButtons: false,
};

async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
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
  cancelled: boolean;
}

const activeBatches = new Map<string, ActiveBatch>();

async function processBatch(batchId: string): Promise<void> {
  const batch = await ledger.getBatch(batchId);
  if (!batch) return;

  const activeBatch: ActiveBatch = { batchId, cancelled: false };
  activeBatches.set(batchId, activeBatch);

  await ledger.updateBatch(batchId, { status: 'running' });

  const tasks = await ledger.getQueuedTasks(batchId);
  const pool = batch.operation === 'create' ? createPool
    : batch.operation === 'delete' ? deletePool
    : purgePool;

  for (const task of tasks) {
    if (activeBatch.cancelled) break;

    const startTime = Date.now();

    try {
      await ledger.updateTask(task.id, { status: 'running' });

      let result: { zoneId?: string } = {};

      await pool.add(async () => {
        if (batch.operation === 'create') {
          const zone = await cfClient.createZone(
            encodeDomain(task.domain),
            batch.accountId,
            batch.options
          );
          result.zoneId = zone.id;
        } else if (batch.operation === 'delete') {
          await cfClient.deleteZone(task.domain); // task.domain is zoneId for delete
        } else if (batch.operation === 'purge') {
          await cfClient.purgeCacheEverything(task.domain); // task.domain is zoneId for purge
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

    // Send progress update
    const summary = await ledger.getBatchSummary(batchId);
    const progressEvent: BatchProgressEvent = {
      type: 'BATCH_PROGRESS',
      payload: { batchId, summary },
    };
    broadcastEvent(progressEvent);

    // Update batch counters
    await updateBatchCounters(batchId);
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

function broadcastEvent(event: BatchProgressEvent | BatchCompletedEvent): void {
  chrome.runtime.sendMessage(event).catch(() => {
    // Panel might not be open, ignore error
  });
}

function broadcastSettingsChanged(settings: Settings): void {
  // Broadcast to all tabs (content scripts)
  chrome.tabs.query({ url: 'https://dash.cloudflare.com/*' }).then((tabs) => {
    tabs.forEach((tab) => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'SETTINGS_CHANGED',
          payload: settings,
        }).catch(() => {
          // Tab might not have content script, ignore
        });
      }
    });
  });
}

// ============================================================================
// Message Handler
// ============================================================================

const CONTENT_SCRIPT_ALLOWED = new Set<RequestMessage['type']>([
  'OPEN_SIDE_PANEL',
  'GET_SETTINGS',
  'GET_ZONES',
]);

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
  _sender: chrome.runtime.MessageSender
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
        };
        return { success: true, data: response };
      }

      case 'VAULT_SETUP': {
        const { email, apiKey } = message.payload;
        await vault.setup({ email, apiKey });

        // Verify credentials
        const user = await cfClient.verifyCredentials();
        const accounts = await cfClient.getAccounts();

        const response: VaultSetupResponse = { user, accounts };
        return { success: true, data: response };
      }

      case 'VAULT_LOCK': {
        await vault.lock();
        return { success: true, data: { success: true } };
      }

      case 'VAULT_CLEAR': {
        await vault.clearAll();
        return { success: true, data: { success: true } };
      }

      // ====== Accounts & Zones ======
      case 'GET_ACCOUNTS': {
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
        const { domains, accountId } = message.payload;
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

          if (duplicates.has(normalized) && results.some(r => r.domain === normalized)) {
            results.push({ domain, status: 'duplicate' as PreflightStatus });
            continue;
          }

          try {
            console.log('[CF Tools] Checking domain:', domain);
            const check = await preflightPool.add(() =>
              cfClient.checkZoneExists(encodeDomain(domain))
            );
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
        const { operation, accountId, domains, zoneIds, options } = message.payload;
        const items = operation === 'create' ? domains! : zoneIds!;

        const batchId = await ledger.createBatch(operation, accountId, items, options);

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
        resumeAllPools();
        processBatch(batchId);
        return { success: true, data: { success: true } };
      }

      case 'CANCEL_BATCH': {
        const { batchId } = message.payload;
        const activeBatch = activeBatches.get(batchId);
        if (activeBatch) {
          activeBatch.cancelled = true;
        }
        clearAllPools();
        await ledger.updateBatch(batchId, { status: 'cancelled' });
        activeBatches.delete(batchId);
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

        // Create new batch with failed items
        const items = failedTasks.map(t => t.domain);
        const newBatchId = await ledger.createBatch(batch.operation, batch.accountId, items);

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
        if (_sender.tab?.id) {
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
        error: { code: 'VAULT_LOCKED', message: 'Vault is locked. Please unlock first.' },
      };
    }

    if (isCFClientError(error)) {
      return {
        success: false,
        error: {
          code: error.normalized.category.toUpperCase(),
          message: error.normalized.message,
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
      chrome.runtime.sendMessage({
        type: 'INCOMPLETE_BATCHES',
        payload: { batches: incomplete },
      }).catch(() => {
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

export default defineBackground(() => {
  console.log('[CF Tools] Background service worker started');

  // Start initialization immediately
  initPromise = initializeModules();

  // Set up message handler - waits for initialization before processing
  chrome.runtime.onMessage.addListener(
    (message: RequestMessage, sender, sendResponse) => {
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
    }
  );

  // Note: beforeunload doesn't work in Service Workers (MV3)
  // Vault remains locked on service worker restart
});
