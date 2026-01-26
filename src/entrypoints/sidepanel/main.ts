/**
 * Side Panel UI Entry Point
 *
 * Main application interface for bulk operations.
 */

import { sendMessage } from '../../shared/messaging/protocol';
import type {
  PreflightResult,
  BatchProgressEvent,
  BatchCompletedEvent,
  Settings,
} from '../../shared/messaging/protocol';
import type { CFAccount, CFZone } from '../../shared/types/api';
import type { BatchSummary } from '../../shared/types/tasks';
import { parseDomains } from '../../shared/domains';
import {
  initTheme,
  getThemePreference,
  setThemePreference,
  toggleTheme,
  type ThemePreference,
} from '../../shared/theme';

// ============================================================================
// Dialog System
// ============================================================================

interface DialogOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
  inputType?: string;
  inputValue?: string;
}

function showAlertDialog(message: string, title = 'Notice'): Promise<void> {
  return new Promise((resolve) => {
    const dialog = document.querySelector('[data-dialog="alert"]') as HTMLElement;
    if (!dialog) {
      // Fallback to native alert
      alert(message);
      resolve();
      return;
    }

    const titleEl = dialog.querySelector('[data-dialog-title]');
    const messageEl = dialog.querySelector('[data-dialog-message]');

    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.textContent = message;

    dialog.hidden = false;

    const handleClose = () => {
      dialog.hidden = true;
      cleanup();
      resolve();
    };

    const cleanup = () => {
      dialog.querySelectorAll('[data-dialog-close]').forEach((btn) => {
        btn.removeEventListener('click', handleClose);
      });
    };

    dialog.querySelectorAll('[data-dialog-close]').forEach((btn) => {
      btn.addEventListener('click', handleClose);
    });
  });
}

function showConfirmDialog(options: DialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = document.querySelector('[data-dialog="confirm"]') as HTMLElement;
    if (!dialog) {
      // Fallback to native confirm
      resolve(confirm(options.message));
      return;
    }

    const titleEl = dialog.querySelector('[data-dialog-title]');
    const messageEl = dialog.querySelector('[data-dialog-message]');
    const confirmBtn = dialog.querySelector('[data-dialog-confirm]') as HTMLButtonElement;
    const panel = dialog.querySelector('.dialog__panel') as HTMLElement;

    if (titleEl) titleEl.textContent = options.title || 'Confirm';
    if (messageEl) messageEl.textContent = options.message;
    if (confirmBtn) confirmBtn.textContent = options.confirmText || 'Confirm';

    // Update dialog type
    dialog.className = `dialog dialog--${options.type || 'danger'}`;

    // Update confirm button style
    if (confirmBtn) {
      confirmBtn.className = options.type === 'danger'
        ? 'btn btn--danger'
        : 'btn btn--primary';
    }

    dialog.hidden = false;

    const handleConfirm = () => {
      dialog.hidden = true;
      cleanup();
      resolve(true);
    };

    const handleCancel = () => {
      dialog.hidden = true;
      cleanup();
      resolve(false);
    };

    const cleanup = () => {
      confirmBtn?.removeEventListener('click', handleConfirm);
      dialog.querySelectorAll('[data-dialog-close]').forEach((btn) => {
        btn.removeEventListener('click', handleCancel);
      });
    };

    confirmBtn?.addEventListener('click', handleConfirm);
    dialog.querySelectorAll('[data-dialog-close]').forEach((btn) => {
      btn.addEventListener('click', handleCancel);
    });
  });
}

function showPromptDialog(options: DialogOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const dialog = document.querySelector('[data-dialog="prompt"]') as HTMLElement;
    if (!dialog) {
      // Fallback to native prompt
      resolve(prompt(options.message, options.inputValue));
      return;
    }

    const titleEl = dialog.querySelector('[data-dialog-title]');
    const messageEl = dialog.querySelector('[data-dialog-message]');
    const input = dialog.querySelector('[data-dialog-input]') as HTMLInputElement;
    const confirmBtn = dialog.querySelector('[data-dialog-confirm]') as HTMLButtonElement;

    if (titleEl) titleEl.textContent = options.title || 'Input';
    if (messageEl) messageEl.textContent = options.message;
    if (input) {
      input.type = options.inputType || 'text';
      input.value = options.inputValue || '';
    }

    dialog.hidden = false;
    input?.focus();

    const handleConfirm = () => {
      dialog.hidden = true;
      cleanup();
      resolve(input?.value || null);
    };

    const handleCancel = () => {
      dialog.hidden = true;
      cleanup();
      resolve(null);
    };

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') handleConfirm();
      if (e.key === 'Escape') handleCancel();
    };

    const cleanup = () => {
      confirmBtn?.removeEventListener('click', handleConfirm);
      input?.removeEventListener('keydown', handleKeydown);
      dialog.querySelectorAll('[data-dialog-close]').forEach((btn) => {
        btn.removeEventListener('click', handleCancel);
      });
    };

    confirmBtn?.addEventListener('click', handleConfirm);
    input?.addEventListener('keydown', handleKeydown);
    dialog.querySelectorAll('[data-dialog-close]').forEach((btn) => {
      btn.addEventListener('click', handleCancel);
    });
  });
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Check if error indicates vault is locked and handle it.
 * Returns true if the error was a vault locked error.
 */
function handleVaultLockedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('VAULT_LOCKED') || message.includes('Vault is locked')) {
    console.log('[CF Tools] Vault locked, showing auth view');
    resetPanelState();
    showView('auth');
    updateStatus(false);
    return true;
  }
  return false;
}

// ============================================================================
// State
// ============================================================================

let currentAccounts: CFAccount[] = [];
let isUnlocked = false;
let currentBatchId: string | null = null;
let batchStartTime: number | null = null;
let preflightResults: PreflightResult[] = [];

// Account selection (shared across tabs)
let selectedAccountId: string | null = null;

// Delete/Purge view state
let deleteZones: CFZone[] = [];
let purgeZones: CFZone[] = [];
let selectedDeleteZones = new Set<string>();
let selectedPurgeZones = new Set<string>();
let deleteCurrentPage = 1;
let purgeCurrentPage = 1;
const ZONES_PER_PAGE = 50;

/**
 * Sync all account selectors to the same value.
 */
function syncAccountSelectors(accountId: string | null): void {
  selectedAccountId = accountId;

  const selectors = document.querySelectorAll('select[name="account"]');
  selectors.forEach((select) => {
    (select as HTMLSelectElement).value = accountId ?? '';
  });
}

/**
 * Reset all panel state on disconnect/logout.
 * Clears accounts, zones, selections, and UI elements.
 */
function resetPanelState(): void {
  // Reset state variables
  isUnlocked = false;
  currentAccounts = [];
  selectedAccountId = null;
  deleteZones = [];
  purgeZones = [];
  selectedDeleteZones.clear();
  selectedPurgeZones.clear();
  preflightResults = [];
  deleteCurrentPage = 1;
  purgeCurrentPage = 1;

  // Clear account selectors
  const selectors = document.querySelectorAll('select[name="account"]');
  selectors.forEach((select) => {
    while (select.children.length > 1) {
      select.removeChild(select.lastChild!);
    }
    (select as HTMLSelectElement).value = '';
  });

  // Clear zone lists
  document.querySelectorAll('.zone-item').forEach((el) => el.remove());

  // Reset selection counts
  document.querySelectorAll('[data-selected-count]').forEach((el) => {
    el.textContent = '0';
  });

  // Hide loading and empty states
  document.querySelectorAll('[data-loading]').forEach((el) => {
    (el as HTMLElement).hidden = true;
  });
  document.querySelectorAll('[data-empty]').forEach((el) => {
    (el as HTMLElement).hidden = true;
  });

  // Clear domain input and preflight
  const domainInput = document.getElementById('domains-input') as HTMLTextAreaElement;
  if (domainInput) domainInput.value = '';

  const domainCount = document.querySelector('[data-domain-count]');
  if (domainCount) domainCount.textContent = '0';

  const preflightEl = document.querySelector('[data-preflight]') as HTMLElement;
  if (preflightEl) preflightEl.hidden = true;

  // Reset action buttons
  const startCreateBtn = document.querySelector('[data-action="start-create"]') as HTMLButtonElement;
  if (startCreateBtn) startCreateBtn.disabled = true;

  const startDeleteBtn = document.querySelector('[data-action="start-delete"]') as HTMLButtonElement;
  if (startDeleteBtn) startDeleteBtn.disabled = true;

  const startPurgeBtn = document.querySelector('[data-action="start-purge"]') as HTMLButtonElement;
  if (startPurgeBtn) startPurgeBtn.disabled = true;

  // Reset navigation to first tab
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach((tab, i) => {
    tab.classList.toggle('is-active', i === 0);
  });

  // Update auth toggle button to show login icon
  updateAuthToggleButton();

  console.log('[CF Tools] Panel state reset');
}

// ============================================================================
// View Management
// ============================================================================

type ViewName = 'auth' | 'create' | 'delete' | 'purge' | 'progress' | 'results' | 'settings';

function showView(viewName: ViewName): void {
  // Hide all views
  document.querySelectorAll('[data-view-content]').forEach((el) => {
    (el as HTMLElement).hidden = true;
  });

  // Show target view
  const targetView = document.querySelector(`[data-view-content="${viewName}"]`);
  if (targetView) {
    (targetView as HTMLElement).hidden = false;
  }

  // Update panel data-view attribute
  const panel = document.querySelector('.panel');
  if (panel) {
    panel.setAttribute('data-view', viewName);
  }

  // Show/hide navigation (hide for auth, progress, results)
  const nav = document.querySelector('.panel__nav');
  if (nav) {
    (nav as HTMLElement).hidden = ['auth', 'progress', 'results'].includes(viewName);
  }

  // Update auth toggle button (login/lock icon)
  updateAuthToggleButton();
}

let currentEmail: string | undefined;

function updateStatus(connected: boolean, email?: string): void {
  currentEmail = email;

  const statusBadge = document.querySelector('.status-badge');
  if (statusBadge) {
    statusBadge.setAttribute('data-status', connected ? 'connected' : 'disconnected');
    statusBadge.textContent = connected ? (email || 'Connected') : 'Disconnected';
  }

  // Update current account in settings
  const emailEl = document.querySelector('[data-current-email]');
  if (emailEl) {
    emailEl.textContent = connected && email ? email : 'Not connected';
  }
}

/**
 * Update auth toggle button - shows login icon when not authenticated,
 * lock icon when authenticated.
 */
function updateAuthToggleButton(): void {
  const btn = document.querySelector('[data-action="auth-toggle"]') as HTMLButtonElement;
  if (!btn) return;

  const loginIcon = btn.querySelector('[data-icon="login"]') as HTMLElement | null;
  const lockIcon = btn.querySelector('[data-icon="lock"]') as HTMLElement | null;

  if (isUnlocked) {
    // Show lock icon
    if (loginIcon) loginIcon.style.display = 'none';
    if (lockIcon) lockIcon.style.display = '';
    btn.title = 'Disconnect';
  } else {
    // Show login icon
    if (loginIcon) loginIcon.style.display = '';
    if (lockIcon) lockIcon.style.display = 'none';
    btn.title = 'Login';
  }
}

function populateAccountSelectors(accounts: CFAccount[]): void {
  const selectors = document.querySelectorAll('select[name="account"]');

  selectors.forEach((select) => {
    // Clear existing options except first
    while (select.children.length > 1) {
      select.removeChild(select.lastChild!);
    }

    // Add account options
    accounts.forEach((account) => {
      const option = document.createElement('option');
      option.value = account.id;
      option.textContent = account.name;
      select.appendChild(option);
    });
  });

  // Auto-select if only one account, or restore previous selection
  if (accounts.length === 1) {
    syncAccountSelectors(accounts[0].id);
  } else if (selectedAccountId && accounts.some(a => a.id === selectedAccountId)) {
    syncAccountSelectors(selectedAccountId);
  }
}

function showError(container: string, message: string): void {
  const errorEl = document.querySelector(`[data-${container}-error]`) as HTMLElement;
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }
}

function hideError(container: string): void {
  const errorEl = document.querySelector(`[data-${container}-error]`) as HTMLElement;
  if (errorEl) {
    errorEl.hidden = true;
  }
}

function setButtonLoading(button: HTMLButtonElement, loading: boolean): void {
  button.disabled = loading;
  if (loading) {
    button.dataset.originalText = button.textContent || '';
    button.textContent = 'Loading...';
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
  }
}

// ============================================================================
// Create View
// ============================================================================

function updatePreflightDisplay(results: PreflightResult[]): void {
  const preflightEl = document.querySelector('[data-preflight]') as HTMLElement;
  if (!preflightEl) return;

  const counts = {
    'will-create': 0,
    'exists': 0,
    'invalid': 0,
    'duplicate': 0,
  };

  results.forEach((r) => {
    if (r.status in counts) {
      counts[r.status as keyof typeof counts]++;
    }
  });

  // Update badges
  Object.entries(counts).forEach(([status, count]) => {
    const badge = preflightEl.querySelector(`[data-count="${status}"]`);
    if (badge) {
      badge.textContent = String(count);
    }
  });

  preflightEl.hidden = false;

  // Enable start button if there are domains to create
  const startBtn = document.querySelector('[data-action="start-create"]') as HTMLButtonElement;
  if (startBtn) {
    startBtn.disabled = counts['will-create'] === 0;
  }
}

function initCreateView(): void {
  const checkBtn = document.querySelector('[data-action="check-first"]') as HTMLButtonElement;
  const startBtn = document.querySelector('[data-action="start-create"]') as HTMLButtonElement;
  const textarea = document.getElementById('domains-input') as HTMLTextAreaElement;
  const accountSelect = document.getElementById('account-select') as HTMLSelectElement;

  if (!checkBtn || !startBtn || !textarea || !accountSelect) return;

  // Sync account selection across all tabs
  accountSelect.addEventListener('change', () => {
    syncAccountSelectors(accountSelect.value || null);
  });

  // Check First button
  checkBtn.addEventListener('click', async () => {
    const accountId = accountSelect.value;
    if (!accountId) {
      await showAlertDialog('Please select an account', 'Account Required');
      return;
    }

    const { domains, duplicates, invalid } = parseDomains(textarea.value);
    if (domains.length === 0 && duplicates.length === 0 && invalid.length === 0) {
      await showAlertDialog('No domains found in the input', 'No Domains');
      return;
    }

    setButtonLoading(checkBtn, true);

    try {
      const { results } = await sendMessage({
        type: 'CHECK_PREFLIGHT',
        payload: { domains, accountId },
      });

      // Add local duplicates and invalid
      const allResults: PreflightResult[] = [
        ...results,
        ...duplicates.map((d) => ({ domain: d, status: 'duplicate' as const })),
        ...invalid.map((d) => ({ domain: d, status: 'invalid' as const })),
      ];

      preflightResults = allResults;
      updatePreflightDisplay(allResults);
    } catch (error) {
      if (!handleVaultLockedError(error)) {
        const msg = error instanceof Error ? error.message : 'Check failed';
        await showAlertDialog(msg, 'Preflight Error');
      }
    } finally {
      setButtonLoading(checkBtn, false);
    }
  });

  // Start button
  startBtn.addEventListener('click', async () => {
    const accountId = accountSelect.value;
    if (!accountId) {
      await showAlertDialog('Please select an account', 'Account Required');
      return;
    }

    // Get domains to create (from preflight or parse fresh)
    let domainsToCreate: string[];
    if (preflightResults.length > 0) {
      domainsToCreate = preflightResults
        .filter((r) => r.status === 'will-create')
        .map((r) => r.domain);
    } else {
      const { domains } = parseDomains(textarea.value);
      domainsToCreate = domains;
    }

    if (domainsToCreate.length === 0) {
      await showAlertDialog('No domains to create. Run preflight check first.', 'No Domains');
      return;
    }

    // Get zone settings
    const jumpStart = (document.querySelector('input[name="jumpStart"]') as HTMLInputElement)?.checked ?? true;
    const zoneType = (document.getElementById('zone-type') as HTMLSelectElement)?.value || 'full';

    setButtonLoading(startBtn, true);

    try {
      const { batchId } = await sendMessage({
        type: 'START_BATCH',
        payload: {
          operation: 'create',
          accountId,
          domains: domainsToCreate,
          options: {
            type: zoneType as 'full' | 'partial',
            jumpStart,
          },
        },
      });

      currentBatchId = batchId;
      batchStartTime = Date.now();
      setButtonLoading(startBtn, false);
      showProgressView('Creating zones...', domainsToCreate.length);
    } catch (error) {
      setButtonLoading(startBtn, false);
      if (!handleVaultLockedError(error)) {
        const msg = error instanceof Error ? error.message : 'Failed to start batch';
        await showAlertDialog(msg, 'Error');
      }
    }
  });
}

// ============================================================================
// Delete View
// ============================================================================

async function loadZonesForDelete(accountId: string, page = 1): Promise<void> {
  const zoneList = document.querySelector('[data-view-content="delete"] [data-zone-list]') as HTMLElement;
  const loadingEl = zoneList?.querySelector('[data-loading]') as HTMLElement;
  const emptyEl = zoneList?.querySelector('[data-empty]') as HTMLElement;

  if (!zoneList) return;

  if (loadingEl) loadingEl.hidden = false;
  if (emptyEl) emptyEl.hidden = true;

  try {
    const { zones, pagination } = await sendMessage({
      type: 'GET_ZONES',
      payload: { accountId, page, perPage: ZONES_PER_PAGE },
    });

    deleteZones = zones;
    deleteCurrentPage = page;
    selectedDeleteZones.clear();

    renderZoneList(zoneList, zones, selectedDeleteZones, 'delete');
    updateDeleteSelectionCount();

    if (loadingEl) loadingEl.hidden = true;
    if (emptyEl) emptyEl.hidden = zones.length > 0;
  } catch (error) {
    if (loadingEl) loadingEl.hidden = true;
    if (!handleVaultLockedError(error)) {
      console.error('[CF Tools] Failed to load zones:', error);
    }
  }
}

function renderZoneList(
  container: HTMLElement,
  zones: CFZone[],
  selected: Set<string>,
  prefix: string
): void {
  // Remove existing zone items
  container.querySelectorAll('.zone-item').forEach((el) => el.remove());

  zones.forEach((zone) => {
    const item = document.createElement('label');
    item.className = 'zone-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'zone-checkbox';
    checkbox.dataset.zoneId = zone.id;
    checkbox.checked = selected.has(zone.id);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'zone-name';
    nameSpan.textContent = zone.name;

    const statusSpan = document.createElement('span');
    statusSpan.className = 'zone-status';
    statusSpan.dataset.status = zone.status;
    statusSpan.textContent = zone.status;

    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        selected.add(zone.id);
      } else {
        selected.delete(zone.id);
      }
      if (prefix === 'delete') {
        updateDeleteSelectionCount();
      } else {
        updatePurgeSelectionCount();
      }
    });

    item.appendChild(checkbox);
    item.appendChild(nameSpan);
    item.appendChild(statusSpan);
    container.appendChild(item);
  });
}

function updateDeleteSelectionCount(): void {
  const countEl = document.querySelector('[data-view-content="delete"] [data-selected-count]');
  const deleteBtn = document.querySelector('[data-action="start-delete"]') as HTMLButtonElement;

  if (countEl) {
    countEl.textContent = String(selectedDeleteZones.size);
  }
  if (deleteBtn) {
    deleteBtn.disabled = selectedDeleteZones.size === 0;
  }
}

function initDeleteView(): void {
  const accountSelect = document.getElementById('delete-account-select') as HTMLSelectElement;
  const deleteBtn = document.querySelector('[data-action="start-delete"]') as HTMLButtonElement;

  if (!accountSelect) return;

  accountSelect.addEventListener('change', () => {
    const accountId = accountSelect.value;
    syncAccountSelectors(accountId || null);
    if (accountId) {
      loadZonesForDelete(accountId);
    }
  });

  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      if (selectedDeleteZones.size === 0) return;

      const confirmed = await showConfirmDialog({
        title: 'Delete Zones',
        message: `Are you sure you want to delete ${selectedDeleteZones.size} zone(s)? This action cannot be undone.`,
        confirmText: 'Delete',
        type: 'danger',
      });
      if (!confirmed) return;

      const accountId = accountSelect.value;
      setButtonLoading(deleteBtn, true);

      try {
        const { batchId } = await sendMessage({
          type: 'START_BATCH',
          payload: {
            operation: 'delete',
            accountId,
            zoneIds: Array.from(selectedDeleteZones),
          },
        });

        currentBatchId = batchId;
        batchStartTime = Date.now();
        setButtonLoading(deleteBtn, false);
        showProgressView('Deleting zones...', selectedDeleteZones.size);
      } catch (error) {
        setButtonLoading(deleteBtn, false);
        if (!handleVaultLockedError(error)) {
          const msg = error instanceof Error ? error.message : 'Failed to start delete';
          await showAlertDialog(msg, 'Error');
        }
      }
    });
  }
}

// ============================================================================
// Purge View
// ============================================================================

async function loadZonesForPurge(accountId: string, page = 1): Promise<void> {
  const zoneList = document.querySelector('[data-view-content="purge"] [data-zone-list]') as HTMLElement;
  const loadingEl = zoneList?.querySelector('[data-loading]') as HTMLElement;
  const emptyEl = zoneList?.querySelector('[data-empty]') as HTMLElement;

  if (!zoneList) return;

  if (loadingEl) loadingEl.hidden = false;
  if (emptyEl) emptyEl.hidden = true;

  try {
    const { zones, pagination } = await sendMessage({
      type: 'GET_ZONES',
      payload: { accountId, page, perPage: ZONES_PER_PAGE },
    });

    purgeZones = zones;
    purgeCurrentPage = page;
    selectedPurgeZones.clear();

    renderZoneList(zoneList, zones, selectedPurgeZones, 'purge');
    updatePurgeSelectionCount();

    if (loadingEl) loadingEl.hidden = true;
    if (emptyEl) emptyEl.hidden = zones.length > 0;
  } catch (error) {
    if (loadingEl) loadingEl.hidden = true;
    if (!handleVaultLockedError(error)) {
      console.error('[CF Tools] Failed to load zones:', error);
    }
  }
}

function updatePurgeSelectionCount(): void {
  const countEl = document.querySelector('[data-view-content="purge"] [data-selected-count]');
  const purgeBtn = document.querySelector('[data-action="start-purge"]') as HTMLButtonElement;

  if (countEl) {
    countEl.textContent = String(selectedPurgeZones.size);
  }
  if (purgeBtn) {
    purgeBtn.disabled = selectedPurgeZones.size === 0;
  }
}

function initPurgeView(): void {
  const accountSelect = document.getElementById('purge-account-select') as HTMLSelectElement;
  const purgeBtn = document.querySelector('[data-action="start-purge"]') as HTMLButtonElement;

  if (!accountSelect) return;

  accountSelect.addEventListener('change', () => {
    const accountId = accountSelect.value;
    syncAccountSelectors(accountId || null);
    if (accountId) {
      loadZonesForPurge(accountId);
    }
  });

  if (purgeBtn) {
    purgeBtn.addEventListener('click', async () => {
      if (selectedPurgeZones.size === 0) return;

      const confirmed = await showConfirmDialog({
        title: 'Purge Cache',
        message: `Are you sure you want to purge cache for ${selectedPurgeZones.size} zone(s)?`,
        confirmText: 'Purge',
        type: 'warning',
      });
      if (!confirmed) return;

      const accountId = accountSelect.value;
      setButtonLoading(purgeBtn, true);

      try {
        const { batchId } = await sendMessage({
          type: 'START_BATCH',
          payload: {
            operation: 'purge',
            accountId,
            zoneIds: Array.from(selectedPurgeZones),
          },
        });

        currentBatchId = batchId;
        batchStartTime = Date.now();
        setButtonLoading(purgeBtn, false);
        showProgressView('Purging cache...', selectedPurgeZones.size);
      } catch (error) {
        setButtonLoading(purgeBtn, false);
        if (!handleVaultLockedError(error)) {
          const msg = error instanceof Error ? error.message : 'Failed to start purge';
          await showAlertDialog(msg, 'Error');
        }
      }
    });
  }
}

// ============================================================================
// Progress View
// ============================================================================

function showProgressView(title: string, total: number): void {
  showView('progress');

  const titleEl = document.querySelector('[data-progress-title]');
  if (titleEl) titleEl.textContent = title;

  updateProgressDisplay({
    total,
    processed: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    blocked: 0,
    etaMs: null,
  });
}

function updateProgressDisplay(summary: BatchSummary): void {
  // Update stats
  const statEls = {
    total: document.querySelector('[data-stat="total"]'),
    processed: document.querySelector('[data-stat="processed"]'),
    success: document.querySelector('[data-stat="success"]'),
    failed: document.querySelector('[data-stat="failed"]'),
    skipped: document.querySelector('[data-stat="skipped"]'),
  };

  if (statEls.total) statEls.total.textContent = String(summary.total);
  if (statEls.processed) statEls.processed.textContent = String(summary.processed);
  if (statEls.success) statEls.success.textContent = String(summary.success);
  if (statEls.failed) statEls.failed.textContent = String(summary.failed);
  if (statEls.skipped) statEls.skipped.textContent = String(summary.skipped);

  // Update progress bar
  const progressFill = document.querySelector('[data-progress-fill]') as HTMLElement;
  if (progressFill) {
    const percent = summary.total > 0 ? (summary.processed / summary.total) * 100 : 0;
    progressFill.style.width = `${percent}%`;
  }

  // Update ETA
  const etaEl = document.querySelector('[data-eta]');
  if (etaEl && batchStartTime && summary.processed > 0) {
    const elapsed = Date.now() - batchStartTime;
    const avgTime = elapsed / summary.processed;
    const remaining = summary.total - summary.processed;
    const etaMs = remaining * avgTime;

    if (etaMs > 0) {
      const etaSec = Math.ceil(etaMs / 1000);
      if (etaSec < 60) {
        etaEl.textContent = `${etaSec}s`;
      } else {
        const min = Math.floor(etaSec / 60);
        const sec = etaSec % 60;
        etaEl.textContent = `${min}m ${sec}s`;
      }
    } else {
      etaEl.textContent = 'completing...';
    }
  }
}

function initProgressView(): void {
  const pauseBtn = document.querySelector('[data-action="pause"]') as HTMLButtonElement;
  const resumeBtn = document.querySelector('[data-action="resume"]') as HTMLButtonElement;
  const cancelBtn = document.querySelector('[data-action="cancel"]') as HTMLButtonElement;

  pauseBtn?.addEventListener('click', async () => {
    if (!currentBatchId) return;

    try {
      await sendMessage({
        type: 'PAUSE_BATCH',
        payload: { batchId: currentBatchId },
      });
      pauseBtn.hidden = true;
      resumeBtn.hidden = false;
    } catch (error) {
      console.error('[CF Tools] Failed to pause:', error);
    }
  });

  resumeBtn?.addEventListener('click', async () => {
    if (!currentBatchId) return;

    try {
      await sendMessage({
        type: 'RESUME_BATCH',
        payload: { batchId: currentBatchId },
      });
      resumeBtn.hidden = true;
      pauseBtn.hidden = false;
    } catch (error) {
      console.error('[CF Tools] Failed to resume:', error);
    }
  });

  cancelBtn?.addEventListener('click', async () => {
    if (!currentBatchId) return;

    const confirmed = await showConfirmDialog({
      title: 'Cancel Operation',
      message: 'Are you sure you want to cancel? Progress will be lost.',
      confirmText: 'Cancel Operation',
      type: 'warning',
    });
    if (!confirmed) return;

    try {
      await sendMessage({
        type: 'CANCEL_BATCH',
        payload: { batchId: currentBatchId },
      });
      showView('create');
      currentBatchId = null;
    } catch (error) {
      console.error('[CF Tools] Failed to cancel:', error);
    }
  });
}

// ============================================================================
// Results View
// ============================================================================

let lastBatchSummary: BatchSummary | null = null;

function showResultsView(summary: BatchSummary, operation?: string): void {
  lastBatchSummary = summary;
  showView('results');

  // Update summary
  const successEl = document.querySelector('[data-result-success]');
  const failedEl = document.querySelector('[data-result-failed]');
  const skippedEl = document.querySelector('[data-result-skipped]');

  if (successEl) successEl.textContent = String(summary.success);
  if (failedEl) failedEl.textContent = String(summary.failed);
  if (skippedEl) skippedEl.textContent = String(summary.skipped);

  // Show/hide failed section
  const failedSection = document.querySelector('[data-results-failed]') as HTMLElement;
  const retryBtn = document.querySelector('[data-action="retry-failed"]') as HTMLElement;
  const exportBtn = document.querySelector('[data-action="export-failed"]') as HTMLElement;

  if (summary.failed > 0) {
    if (failedSection) failedSection.hidden = false;
    if (retryBtn) retryBtn.hidden = false;
    if (exportBtn) exportBtn.hidden = false;

    // Load failed tasks
    loadFailedTasks();
  } else {
    if (failedSection) failedSection.hidden = true;
    if (retryBtn) retryBtn.hidden = true;
    if (exportBtn) exportBtn.hidden = true;
  }

  // Show 301.st CTA when zones were created successfully
  const ctaEl = document.querySelector('[data-results-cta]') as HTMLElement;
  if (ctaEl) {
    ctaEl.hidden = summary.success === 0;
  }
}

async function loadFailedTasks(): Promise<void> {
  if (!currentBatchId) return;

  const list = document.querySelector('[data-list="failed"]');
  if (!list) return;

  try {
    const { tasks } = await sendMessage({
      type: 'GET_FAILED_TASKS',
      payload: { batchId: currentBatchId },
    });

    list.innerHTML = '';
    tasks.forEach((task) => {
      const li = document.createElement('li');
      li.className = 'results-item results-item--failed';
      const domainSpan = document.createElement('span');
      domainSpan.className = 'results-item__domain';
      domainSpan.textContent = task.domain;

      const errorSpan = document.createElement('span');
      errorSpan.className = 'results-item__error';
      errorSpan.textContent = task.errorMessage || 'Unknown error';

      li.appendChild(domainSpan);
      li.appendChild(errorSpan);
      list.appendChild(li);
    });
  } catch (error) {
    console.error('[CF Tools] Failed to load failed tasks:', error);
  }
}

function initResultsView(): void {
  const retryBtn = document.querySelector('[data-action="retry-failed"]') as HTMLButtonElement;
  const exportBtn = document.querySelector('[data-action="export-failed"]') as HTMLButtonElement;
  const doneBtn = document.querySelector('[data-action="done"]') as HTMLButtonElement;

  retryBtn?.addEventListener('click', async () => {
    if (!currentBatchId) return;

    setButtonLoading(retryBtn, true);

    try {
      const { newBatchId, count } = await sendMessage({
        type: 'RETRY_FAILED',
        payload: { batchId: currentBatchId },
      });

      currentBatchId = newBatchId;
      batchStartTime = Date.now();
      showProgressView('Retrying failed...', count);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Retry failed';
      await showAlertDialog(msg, 'Retry Error');
      setButtonLoading(retryBtn, false);
    }
  });

  exportBtn?.addEventListener('click', async () => {
    if (!currentBatchId) return;

    try {
      const { tasks } = await sendMessage({
        type: 'GET_FAILED_TASKS',
        payload: { batchId: currentBatchId },
      });

      // Create CSV
      const csv = ['domain,error'];
      tasks.forEach((task) => {
        const escapedError = (task.errorMessage || '').replace(/"/g, '""');
        csv.push(`"${task.domain}","${escapedError}"`);
      });

      // Download
      const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `failed-${currentBatchId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('[CF Tools] Failed to export:', error);
    }
  });

  doneBtn?.addEventListener('click', () => {
    currentBatchId = null;
    lastBatchSummary = null;
    preflightResults = [];

    // Reset preflight display
    const preflightEl = document.querySelector('[data-preflight]') as HTMLElement;
    if (preflightEl) preflightEl.hidden = true;

    // Reset buttons
    const startBtn = document.querySelector('[data-action="start-create"]') as HTMLButtonElement;
    if (startBtn) {
      startBtn.disabled = true;
      startBtn.textContent = 'Start';
    }

    showView('create');
  });
}

// ============================================================================
// Settings View
// ============================================================================

async function loadSettings(): Promise<void> {
  try {
    const { settings } = await sendMessage({ type: 'GET_SETTINGS' });

    // Max concurrency
    const concurrencySelect = document.getElementById('max-concurrency') as HTMLSelectElement;
    if (concurrencySelect) {
      concurrencySelect.value = String(settings.maxConcurrency);
    }

    // Dashboard buttons
    const dashboardCheckbox = document.querySelector('input[name="enableDashboardButtons"]') as HTMLInputElement;
    if (dashboardCheckbox) {
      dashboardCheckbox.checked = settings.enableDashboardButtons;
    }

    // Theme (stored locally, not in background)
    const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
    if (themeSelect) {
      themeSelect.value = getThemePreference();
    }
  } catch (error) {
    console.error('[CF Tools] Failed to load settings:', error);
  }
}

function initSettingsView(): void {
  const concurrencySelect = document.getElementById('max-concurrency') as HTMLSelectElement;
  const dashboardCheckbox = document.querySelector('input[name="enableDashboardButtons"]') as HTMLInputElement;
  const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
  const clearDataBtn = document.querySelector('[data-action="clear-all-data"]') as HTMLButtonElement;

  // Theme change (stored locally)
  themeSelect?.addEventListener('change', () => {
    const preference = themeSelect.value as ThemePreference;
    setThemePreference(preference);
  });

  const saveSettings = async () => {
    const settings: Partial<Settings> = {};

    if (concurrencySelect) {
      settings.maxConcurrency = parseInt(concurrencySelect.value, 10);
    }
    if (dashboardCheckbox) {
      settings.enableDashboardButtons = dashboardCheckbox.checked;
    }

    try {
      await sendMessage({
        type: 'UPDATE_SETTINGS',
        payload: settings as Settings,
      });
      console.log('[CF Tools] Settings saved:', settings);
    } catch (error) {
      console.error('[CF Tools] Failed to save settings:', error);
    }
  };

  concurrencySelect?.addEventListener('change', saveSettings);
  dashboardCheckbox?.addEventListener('change', saveSettings);

  clearDataBtn?.addEventListener('click', async () => {
    const confirmed = await showConfirmDialog({
      title: 'Clear All Data',
      message: 'This will remove all stored credentials and settings. Are you sure?',
      confirmText: 'Clear Data',
      type: 'danger',
    });
    if (!confirmed) return;

    try {
      await sendMessage({ type: 'VAULT_CLEAR' });
      resetPanelState();
      showView('auth');
      updateStatus(false);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Clear failed';
      await showAlertDialog(msg, 'Error');
    }
  });

  // Switch Account button
  const switchAccountBtn = document.querySelector('[data-action="switch-account"]');
  switchAccountBtn?.addEventListener('click', async () => {
    const confirmed = await showConfirmDialog({
      title: 'Switch Account',
      message: 'This will clear your current credentials. You can then login with a different Cloudflare account. Continue?',
      confirmText: 'Switch',
      type: 'warning',
    });
    if (!confirmed) return;

    try {
      await sendMessage({ type: 'VAULT_CLEAR' });
      resetPanelState();
      showView('auth');
      updateStatus(false);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to switch account';
      await showAlertDialog(msg, 'Error');
    }
  });

}

// ============================================================================
// Reset Vault
// ============================================================================

function initResetVault(): void {
  const resetLink = document.querySelector('[data-action="reset-vault"]');
  resetLink?.addEventListener('click', async (e) => {
    e.preventDefault();

    const confirmed = await showConfirmDialog({
      title: 'Reset Credentials',
      message: 'This will delete your saved credentials. You will need to re-enter your Cloudflare email and API key. Continue?',
      confirmText: 'Reset',
      type: 'danger',
    });
    if (!confirmed) return;

    try {
      await sendMessage({ type: 'VAULT_CLEAR' });
      resetPanelState();
      showView('auth');
      updateStatus(false);
    } catch (error) {
      console.error('[CF Tools] Failed to reset vault:', error);
    }
  });
}

// ============================================================================
// Initialization
// ============================================================================

async function checkVaultStatus(): Promise<void> {
  try {
    const status = await sendMessage({ type: 'VAULT_STATUS' });

    if (!status.isUnlocked) {
      // Not unlocked - show auth form (session expired or first time)
      showView('auth');
      updateStatus(false, status.email);
    } else {
      // Unlocked - load accounts and show main UI
      isUnlocked = true;
      const { accounts } = await sendMessage({ type: 'GET_ACCOUNTS' });
      currentAccounts = accounts;
      populateAccountSelectors(accounts);
      updateStatus(true, status.email);
      showView('create');
    }
  } catch (error) {
    console.error('[CF Tools] Failed to check vault status:', error);
    showView('auth');
    updateStatus(false);
  }
}

function initNavigation(): void {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const tabName = tab.getAttribute('data-tab') as ViewName;
      if (tabName) {
        tabs.forEach((t) => t.classList.remove('is-active'));
        tab.classList.add('is-active');
        showView(tabName);

        // Load data when switching tabs (if account selected)
        if (selectedAccountId) {
          if (tabName === 'delete' && deleteZones.length === 0) {
            loadZonesForDelete(selectedAccountId);
          } else if (tabName === 'purge' && purgeZones.length === 0) {
            loadZonesForPurge(selectedAccountId);
          }
        }

        // Load settings when switching to settings tab
        if (tabName === 'settings') {
          loadSettings();
        }
      }
    });
  });

  // Auth toggle button - login when not authenticated, lock when authenticated
  const authToggleBtn = document.querySelector('[data-action="auth-toggle"]');
  authToggleBtn?.addEventListener('click', async () => {
    if (isUnlocked) {
      // Lock vault
      try {
        await sendMessage({ type: 'VAULT_LOCK' });
        resetPanelState();
        showView('auth');
        updateStatus(false);
        updateAuthToggleButton();
      } catch (error) {
        console.error('[CF Tools] Failed to lock:', error);
      }
    } else {
      // Navigate to auth view
      showView('auth');
    }
  });
}

// ============================================================================
// Theme
// ============================================================================

function initThemeToggle(): void {
  // Initialize theme system
  initTheme();

  // Theme toggle button in header
  const toggleBtn = document.querySelector('[data-action="toggle-theme"]');
  toggleBtn?.addEventListener('click', () => {
    toggleTheme();
  });
}

function initAuthForm(): void {
  const form = document.querySelector('[data-form="auth"]') as HTMLFormElement;
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('auth');

    const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    setButtonLoading(submitBtn, true);

    const formData = new FormData(form);
    const email = formData.get('email') as string;
    const apiKey = formData.get('apiKey') as string;

    try {
      const { user, accounts } = await sendMessage({
        type: 'VAULT_SETUP',
        payload: { email, apiKey },
      });

      console.log('[CF Tools] Auth success:', user.email);

      isUnlocked = true;
      currentAccounts = accounts;
      populateAccountSelectors(accounts);
      updateStatus(true, user.email);
      showView('create');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentication failed';
      showError('auth', message);
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });
}

function initDomainInput(): void {
  const textarea = document.getElementById('domains-input') as HTMLTextAreaElement;
  const countEl = document.querySelector('[data-domain-count]');

  if (!textarea || !countEl) return;

  let debounceTimer: ReturnType<typeof setTimeout>;

  textarea.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const { domains } = parseDomains(textarea.value);
      countEl.textContent = String(domains.length);

      // Reset preflight when input changes
      preflightResults = [];
      const preflightEl = document.querySelector('[data-preflight]') as HTMLElement;
      if (preflightEl) preflightEl.hidden = true;

      const startBtn = document.querySelector('[data-action="start-create"]') as HTMLButtonElement;
      if (startBtn) startBtn.disabled = true;
    }, 150);
  });
}

// Listen for background events
function initBackgroundEvents(): void {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'VAULT_LOCKED') {
      resetPanelState();
      showView('auth');
      updateStatus(false);
    }

    if (message.type === 'BATCH_PROGRESS') {
      const event = message as BatchProgressEvent;
      updateProgressDisplay(event.payload.summary);
    }

    if (message.type === 'BATCH_COMPLETED') {
      const event = message as BatchCompletedEvent;
      showResultsView(event.payload.summary);
    }

    if (message.type === 'INCOMPLETE_BATCHES') {
      // Could show notification about incomplete batches
      console.log('[CF Tools] Incomplete batches:', message.payload.batches);
    }
  });

  // Check vault status when panel becomes visible again
  // This handles Firefox MV2 where background can restart without notification
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && isUnlocked) {
      try {
        const status = await sendMessage({ type: 'VAULT_STATUS' });
        if (!status.isUnlocked) {
          console.log('[CF Tools] Vault locked (background restarted), showing auth');
          resetPanelState();
          showView('auth');
          updateStatus(false, status.email);
        }
      } catch (error) {
        // Background not responding - likely restarted
        console.log('[CF Tools] Background not responding, showing auth');
        resetPanelState();
        showView('auth');
        updateStatus(false);
      }
    }
  });
}

async function init(): Promise<void> {
  console.log('[CF Tools] Side panel initialized');

  initThemeToggle();
  initNavigation();
  initAuthForm();
  initDomainInput();
  initCreateView();
  initDeleteView();
  initPurgeView();
  initProgressView();
  initResultsView();
  initSettingsView();
  initResetVault();
  initBackgroundEvents();

  // Check vault status and show appropriate view
  await checkVaultStatus();
}

document.addEventListener('DOMContentLoaded', init);
