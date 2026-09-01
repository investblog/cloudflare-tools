/**
 * Side Panel UI Entry Point
 *
 * Main application interface for bulk operations.
 */

import { createSvgIcon } from '../../shared/dom';
import { parseDomains } from '../../shared/domains';
import { t } from '../../shared/i18n';
import { TAB_ICONS } from '../../shared/icons';
import type {
  BatchCompletedEvent,
  BatchProgressEvent,
  PreflightResult,
  ProfileChangedEvent,
  Settings,
} from '../../shared/messaging/protocol';
import { errorCode, errorRecommendation, sendMessage } from '../../shared/messaging/protocol';
import { getNewsEnabled, NEWS_ENABLED_KEY, toggleNews } from '../../shared/news';
import {
  getThemePreference,
  initTheme,
  setThemePreference,
  type ThemePreference,
  toggleTheme,
} from '../../shared/theme';
import type { CFAccount, CFZone } from '../../shared/types/api';
import { type CredentialKind, detectCredentialKind, type ProfileInfo } from '../../shared/types/credentials';
import type { BatchSummary } from '../../shared/types/tasks';
import { releaseNoteItems, WHATS_NEW } from '../../shared/whats-new';

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

function showAlertDialog(message: string, title = t('dialogNotice')): Promise<void> {
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

    if (titleEl) titleEl.textContent = options.title || t('dialogConfirm');
    if (messageEl) messageEl.textContent = options.message;
    if (confirmBtn) confirmBtn.textContent = options.confirmText || t('dialogConfirm');

    // Update dialog type
    dialog.className = `dialog dialog--${options.type || 'danger'}`;

    // Update confirm button style
    if (confirmBtn) {
      confirmBtn.className = options.type === 'danger' ? 'btn btn--danger' : 'btn btn--primary';
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

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Check if error indicates vault is locked / profile needs its secret, and
 * route back to the auth view in the right mode. Returns true when handled.
 */
function handleVaultLockedError(error: unknown): boolean {
  const code = errorCode(error);
  const message = error instanceof Error ? error.message : String(error);
  if (
    code === 'VAULT_LOCKED' ||
    code === 'PROFILE_NEEDS_SECRET' ||
    message.includes('VAULT_LOCKED') ||
    message.includes('Vault is locked')
  ) {
    console.log('[CF Tools] Vault locked, showing auth view');
    resetPanelState();
    void checkVaultStatus(); // decides between re-enter mode and add mode
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

// Profiles (multi-profile vault)
let profiles: ProfileInfo[] = [];
let activeProfileId: string | null = null;
type AuthMode = { mode: 'add' } | { mode: 'reauth'; profileId: string };
let authMode: AuthMode = { mode: 'add' };
// Bumped on every account-scoped reset (profile switch/disconnect):
// in-flight zone/account responses from the previous profile are discarded.
let profileEpoch = 0;

// Account selection (shared across tabs)
let selectedAccountId: string | null = null;

// Check view state
let checkZones: CFZone[] = [];

// Delete/Purge view state
let deleteZones: CFZone[] = [];
let purgeZones: CFZone[] = [];
const selectedDeleteZones = new Set<string>();
const selectedPurgeZones = new Set<string>();
const ZONES_PER_PAGE = 50;
const MAX_ZONE_PAGES = 200; // safety cap: 200 * 50 = 10k zones

/**
 * Fetch every page of zones for an account (CF caps per_page, so we walk total_pages).
 */
async function fetchAllZones(accountId: string): Promise<CFZone[]> {
  const all: CFZone[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const { zones, pagination } = await sendMessage({
      type: 'GET_ZONES',
      payload: { accountId, page, perPage: ZONES_PER_PAGE },
    });
    all.push(...zones);
    totalPages = pagination.total_pages;
    page += 1;
    if (zones.length === 0) break;
  } while (page <= totalPages && page <= MAX_ZONE_PAGES);

  return all;
}

/**
 * Trigger a CSV download in the panel document.
 */
function downloadCSV(lines: string[], filename: string): void {
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================================
// Account Dropdowns (301-ui dropdown pattern; one per view, kept in sync)
// ============================================================================

function closeAccountDropdowns(): void {
  document.querySelectorAll('[data-account-dropdown].is-open').forEach((dropdown) => {
    dropdown.classList.remove('is-open');
    dropdown.querySelector('.dropdown__trigger')?.setAttribute('aria-expanded', 'false');
  });
}

/** Rebuild every account menu: accounts, selected state, "Add profile" action. */
function renderAccountMenus(): void {
  document.querySelectorAll('[data-account-menu]').forEach((menu) => {
    menu.replaceChildren();

    currentAccounts.forEach((account) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = account.id === selectedAccountId ? 'dropdown__item dropdown__item--selected' : 'dropdown__item';
      item.setAttribute('role', 'option');
      item.textContent = account.name;
      item.title = account.name;
      item.addEventListener('click', () => {
        closeAccountDropdowns();
        onAccountSelected(account.id);
      });
      menu.appendChild(item);
    });

    if (currentAccounts.length > 0) {
      const divider = document.createElement('hr');
      divider.className = 'dropdown__divider';
      menu.appendChild(divider);
    }

    const addItem = document.createElement('button');
    addItem.type = 'button';
    addItem.className = 'dropdown__item dropdown__item--action';
    addItem.textContent = t('accountAddProfile');
    addItem.addEventListener('click', () => {
      closeAccountDropdowns();
      enterAddMode();
      showView('auth');
    });
    menu.appendChild(addItem);
  });
}

function updateAccountTriggerLabels(): void {
  const account = currentAccounts.find((a) => a.id === selectedAccountId);
  document.querySelectorAll<HTMLElement>('[data-account-label]').forEach((label) => {
    label.textContent = account ? account.name : t('accountSelectPlaceholder');
    label.title = account?.name ?? '';
  });
}

/** A user picked an account: sync every view, reload the visible zone list. */
function onAccountSelected(accountId: string): void {
  syncAccountSelectors(accountId);
  const view = document.querySelector('.panel')?.getAttribute('data-view');
  if (view === 'check') loadZonesForCheck(accountId);
  else if (view === 'delete') loadZonesForDelete(accountId);
  else if (view === 'purge') loadZonesForPurge(accountId);
}

function initAccountDropdowns(): void {
  document.querySelectorAll('[data-account-dropdown]').forEach((dropdown) => {
    const trigger = dropdown.querySelector('.dropdown__trigger');
    trigger?.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = dropdown.classList.contains('is-open');
      closeAccountDropdowns();
      if (!wasOpen) {
        dropdown.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
      }
    });
  });
  document.addEventListener('click', closeAccountDropdowns);

  // Initial render: even before any account is loaded the menu must offer
  // the "Add profile" action, not an empty strip.
  renderAccountMenus();
  updateAccountTriggerLabels();
}

/**
 * Sync all account selectors to the same value.
 */
function syncAccountSelectors(accountId: string | null): void {
  selectedAccountId = accountId;
  renderAccountMenus();
  updateAccountTriggerLabels();
}

/**
 * Reset everything scoped to the current account/profile: zones, selections,
 * selectors. Used on disconnect AND on profile switch.
 */
function resetAccountScopedState(): void {
  profileEpoch += 1;
  currentAccounts = [];

  // Clear the Check tab's zone-count badge (hidden while empty)
  const zoneCount = document.querySelector('[data-zone-count]');
  if (zoneCount) {
    zoneCount.textContent = '';
    (zoneCount as HTMLElement).title = '';
    zoneCount.removeAttribute('aria-label');
  }

  selectedAccountId = null;
  checkZones = [];
  deleteZones = [];
  purgeZones = [];
  selectedDeleteZones.clear();
  selectedPurgeZones.clear();
  preflightResults = [];

  // Reset account dropdowns
  closeAccountDropdowns();
  renderAccountMenus();
  updateAccountTriggerLabels();

  // Clear zone lists (profile rows are rendered separately and survive)
  document.querySelectorAll('[data-zone-list] .zone-item').forEach((el) => {
    el.remove();
  });

  // Reset selection counts
  document.querySelectorAll('[data-selected-count]').forEach((el) => {
    el.textContent = '0';
  });

  // Hide loading and empty states inside zone lists
  document.querySelectorAll('[data-zone-list] [data-loading]').forEach((el) => {
    (el as HTMLElement).hidden = true;
  });
  document.querySelectorAll('[data-zone-list] [data-empty]').forEach((el) => {
    (el as HTMLElement).hidden = true;
  });
}

/**
 * Reset all panel state on disconnect/logout.
 * Clears accounts, zones, selections, and UI elements.
 */
function resetPanelState(): void {
  // Reset state variables
  isUnlocked = false;
  resetAccountScopedState();

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

type ViewName = 'auth' | 'create' | 'check' | 'delete' | 'purge' | 'progress' | 'results' | 'settings';

// ============================================================================
// Action Tray ("second footer floor" with a grip handle)
// ============================================================================

const TRAY_VIEWS: ReadonlyArray<string> = ['create', 'check', 'delete', 'purge', 'settings', 'progress', 'results'];
let trayCollapsed = false;

/** Adopt each operation view's bottom action row into the tray (listeners survive the move). */
function initActionTray(): void {
  const content = document.querySelector('[data-tray-content]');
  if (!content) return;

  for (const view of TRAY_VIEWS) {
    const actions = document.querySelector(`[data-view-content="${view}"] > .view__actions`);
    if (actions) {
      actions.setAttribute('data-tray-owner', view);
      (actions as HTMLElement).hidden = true;
      content.appendChild(actions);
    }
  }

  // Progress controls are nested inside .progress-panel — adopt them explicitly
  const progressControls = document.querySelector('[data-view-content="progress"] .progress-controls');
  if (progressControls) {
    progressControls.setAttribute('data-tray-owner', 'progress');
    (progressControls as HTMLElement).hidden = true;
    content.appendChild(progressControls);
  }

  const tray = document.querySelector('[data-tray]') as HTMLElement | null;
  const handle = document.querySelector('[data-tray-toggle]') as HTMLElement | null;
  if (tray && handle) {
    initTrayDrag(tray, handle, content as HTMLElement);
  }
  applyTrayState();
}

/**
 * Grip behavior (ref: the drag handle of the reference output panel):
 * drag follows the pointer and snaps open/closed on release; a plain
 * click (< 4px movement) toggles.
 */
function initTrayDrag(tray: HTMLElement, handle: HTMLElement, content: HTMLElement): void {
  let pointerId = -1;
  let startY = 0;
  let startHeight = 0;
  let dragging = false;

  handle.addEventListener('pointerdown', (e) => {
    pointerId = e.pointerId;
    startY = e.clientY;
    startHeight = content.getBoundingClientRect().height;
    dragging = false;
    handle.setPointerCapture(e.pointerId);
  });

  handle.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointerId || pointerId === -1) return;
    const dy = startY - e.clientY; // tray sits at the bottom: dragging UP expands
    if (!dragging) {
      if (Math.abs(dy) < 4) return;
      dragging = true;
      tray.classList.remove('panel__tray--collapsed');
      tray.classList.add('panel__tray--dragging');
    }
    const full = content.scrollHeight;
    const height = Math.max(0, Math.min(startHeight + dy, full));
    content.style.maxHeight = `${height}px`;
  });

  const finish = (e: PointerEvent): void => {
    if (e.pointerId !== pointerId) return;
    pointerId = -1;
    tray.classList.remove('panel__tray--dragging');
    if (dragging) {
      // Snap to the nearest state
      trayCollapsed = content.getBoundingClientRect().height < content.scrollHeight / 2;
    } else {
      trayCollapsed = !trayCollapsed; // plain click
    }
    content.style.maxHeight = '';
    applyTrayState();
  };
  handle.addEventListener('pointerup', finish);

  // A cancelled gesture restores the current state — it must NOT toggle.
  handle.addEventListener('pointercancel', (e) => {
    if (e.pointerId !== pointerId) return;
    pointerId = -1;
    tray.classList.remove('panel__tray--dragging');
    content.style.maxHeight = '';
    applyTrayState();
  });

  // Keyboard: Enter/Space on the button fires a click with detail === 0
  // (pointer clicks are already handled via pointerup above).
  handle.addEventListener('click', (e) => {
    if (e.detail !== 0) return;
    trayCollapsed = !trayCollapsed;
    applyTrayState();
  });
}

function applyTrayState(): void {
  const tray = document.querySelector('[data-tray]') as HTMLElement | null;
  if (!tray) return;
  tray.classList.toggle('panel__tray--collapsed', trayCollapsed);
  document.querySelector('[data-tray-toggle]')?.setAttribute('aria-expanded', String(!trayCollapsed));
}

/** Show the tray only on operation views, with that view's action row. */
function updateTrayForView(viewName: ViewName): void {
  const tray = document.querySelector('[data-tray]') as HTMLElement | null;
  if (!tray) return;
  tray.hidden = !TRAY_VIEWS.includes(viewName);
  // The collapse is deliberately ephemeral (not persisted): any view change
  // reopens the tray so the actions can never be "lost" behind the grip.
  trayCollapsed = false;
  applyTrayState();
  document.querySelectorAll<HTMLElement>('[data-tray-owner]').forEach((el) => {
    el.hidden = el.getAttribute('data-tray-owner') !== viewName;
  });
}

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

  // Swap the action tray to this view's action row
  updateTrayForView(viewName);
}

function updateStatus(connected: boolean, label?: string): void {
  const statusBadge = document.querySelector('.status-badge');
  if (statusBadge) {
    statusBadge.setAttribute('data-status', connected ? 'connected' : 'disconnected');
    statusBadge.textContent = connected ? label || t('statusConnected') : t('statusDisconnected');
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
    btn.title = t('titleDisconnect');
  } else {
    // Show login icon
    if (loginIcon) loginIcon.style.display = '';
    if (lockIcon) lockIcon.style.display = 'none';
    btn.title = t('titleLogin');
  }
}

function populateAccountSelectors(accounts: CFAccount[]): void {
  currentAccounts = accounts;

  // Auto-select if only one account; keep a still-valid previous selection
  if (accounts.length === 1) {
    selectedAccountId = accounts[0].id;
  } else if (!(selectedAccountId && accounts.some((a) => a.id === selectedAccountId))) {
    selectedAccountId = null;
  }

  renderAccountMenus();
  updateAccountTriggerLabels();
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
  // Icon buttons keep their SVG: only the .btn__label text is swapped.
  const target = button.querySelector<HTMLElement>('.btn__label') ?? button;
  if (loading) {
    target.dataset.originalText = target.textContent || '';
    target.textContent = t('loading');
  } else {
    target.textContent = target.dataset.originalText || target.textContent;
  }
}

// ============================================================================
// Localization
// ============================================================================

/** selector → message key; applied to EVERY match of the selector. */
const L10N_TEXT: Array<[string, string]> = [
  ['.status-badge', 'statusDisconnected'],
  ['.nav-tab[data-tab="create"] .nav-tab__label', 'tabCreate'],
  ['.nav-tab[data-tab="check"] .nav-tab__label', 'tabCheck'],
  ['.nav-tab[data-tab="delete"] .nav-tab__label', 'tabDelete'],
  ['.nav-tab[data-tab="purge"] .nav-tab__label', 'tabPurge'],
  ['.nav-tab[data-tab="settings"] .nav-tab__label', 'tabSettings'],
  ['label[for="cf-secret"]', 'authSecretLabel'],
  ['a[href="https://dash.cloudflare.com/profile/api-tokens"]', 'authSecretLink'],
  ['label[for="cf-kind"]', 'authKindLabel'],
  ['#cf-kind option[value=""]', 'authKindChoose'],
  ['#cf-kind option[value="user-token"]', 'kindOptionUserToken'],
  ['#cf-kind option[value="account-token"]', 'kindOptionAccountToken'],
  ['#cf-kind option[value="global-key"]', 'kindOptionGlobalKey'],
  ['[data-field="kind"] .form-hint', 'authKindHint'],
  ['label[for="cf-email"]', 'authEmailLabel'],
  ['label[for="cf-account-id"]', 'authAccountIdLabel'],
  ['[data-field="account-id"] .form-hint', 'authAccountIdHint'],
  ['label[for="cf-label"]', 'authLabelLabel'],
  ['[data-form="auth"] button[type="submit"]', 'authConnect'],
  ['[data-action="auth-use-other-profile"]', 'authUseOtherProfile'],
  ['[data-action="auth-add-new"]', 'authAddNew'],
  ['[data-view-content="create"] h2', 'createTitle'],
  ['label[for="account-select"]', 'accountLabel'],
  ['label[for="check-account-select"]', 'accountLabel'],
  ['label[for="delete-account-select"]', 'accountLabel'],
  ['label[for="purge-account-select"]', 'accountLabel'],
  ['[data-account-label]', 'accountSelectPlaceholder'],
  ['label[for="domains-input"]', 'createDomainsLabel'],
  ['.fieldset legend', 'createZoneSettings'],
  ['label[for="zone-type"]', 'createZoneType'],
  ['#zone-type option[value="full"]', 'createTypeFull'],
  ['#zone-type option[value="partial"]', 'createTypePartial'],
  ['.fieldset .form-hint', 'createTypeHint'],
  ['[data-action="check-first"]', 'createCheckFirst'],
  ['[data-action="start-create"]', 'createStart'],
  ['[data-view-content="check"] h2', 'checkTitle'],
  ['[data-zone-list] [data-loading]', 'zonesLoading'],
  ['[data-zone-list] [data-empty]', 'zonesEmpty'],
  ['[data-action="refresh-zones"] .btn__label', 'checkRefresh'],
  ['[data-action="export-zones"] .btn__label', 'checkExport'],
  ['[data-action="export-all-zones"] .btn__label', 'checkExportAll'],
  ['[data-view-content="delete"] h2', 'deleteTitle'],
  ['[data-action="start-delete"]', 'deleteSelected'],
  ['[data-view-content="purge"] h2', 'purgeTitle'],
  ['[data-action="purge-select-all"]', 'purgeSelectAll'],
  ['[data-action="start-purge"]', 'purgeEverything'],
  ['[data-progress-title]', 'progressProcessing'],
  ['.batch-summary__stat--success .batch-summary__label', 'progressSuccess'],
  ['.batch-summary__stat--failed .batch-summary__label', 'progressFailed'],
  ['.batch-summary__stat--skipped .batch-summary__label', 'progressSkipped'],
  ['[data-eta]', 'progressCalculating'],
  ['[data-action="pause"]', 'progressPause'],
  ['[data-action="resume"]', 'progressResume'],
  ['[data-action="cancel"]', 'progressCancel'],
  ['[data-view-content="results"] h2', 'resultsTitle'],
  ['.results-cta__text', 'resultsCtaText'],
  ['.results-cta a.btn', 'resultsCtaBtn'],
  ['[data-results-failed] h3', 'resultsFailedHeading'],
  ['[data-action="retry-failed"]', 'resultsRetryFailed'],
  ['[data-action="export-failed"]', 'resultsExportFailed'],
  ['[data-action="done"]', 'resultsDone'],
  ['[data-view-content="settings"] h2', 'settingsTitle'],
  ['label[for="max-concurrency"]', 'settingsConcurrency'],
  ['label[for="theme-select"]', 'settingsTheme'],
  ['#theme-select option[value="auto"]', 'themeAuto'],
  ['#theme-select option[value="dark"]', 'themeDark'],
  ['#theme-select option[value="light"]', 'themeLight'],
  ['[data-action="clear-all-data"] .btn__label', 'settingsClearData'],
  ['[data-action="manage-profiles"] .btn__label', 'profilesTitle'],
  ['[data-action="dialog-add-profile"]', 'profileAddBtn'],
];

const L10N_PLACEHOLDER: Array<[string, string]> = [
  ['#domains-input', 'createDomainsPlaceholder'],
  ['#cf-account-id', 'authAccountIdPlaceholder'],
  ['#cf-label', 'authLabelPlaceholder'],
];

const L10N_TITLE: Array<[string, string]> = [
  ['[data-action="switch-profile"]', 'titleSwitchProfile'],
  ['[data-action="export-zones"]', 'checkExportTitle'],
  ['[data-tray-toggle]', 'trayToggleTitle'],
  ['[data-action="manage-profiles"]', 'settingsManageProfiles'],
  ['[data-action="clear-all-data"]', 'settingsClearDataHint'],
  ['[data-action="toggle-theme"]', 'titleToggleTheme'],
  ['[data-action="export-all-zones"]', 'checkExportAllTitle'],
  ['[data-action="purge-select-all"]', 'purgeSelectAllTitle'],
];

/**
 * Localize the static panel markup. English defaults live in the HTML and in
 * _locales/en, so applying is a no-op for English UIs.
 */
function localizePanel(): void {
  document.querySelectorAll('[data-l10n]').forEach((el) => {
    const key = el.getAttribute('data-l10n');
    if (key) el.textContent = t(key);
  });
  for (const [selector, key] of L10N_TEXT) {
    document.querySelectorAll(selector).forEach((el) => {
      el.textContent = t(key);
    });
  }
  for (const [selector, key] of L10N_PLACEHOLDER) {
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(selector).forEach((el) => {
      el.placeholder = t(key);
    });
  }
  for (const [selector, key] of L10N_TITLE) {
    document.querySelectorAll<HTMLElement>(selector).forEach((el) => {
      el.title = t(key);
    });
  }
}

// ============================================================================
// Profiles
// ============================================================================

const KIND_LABELS: Record<CredentialKind, string> = {
  'global-key': t('kindGlobalKey'),
  'user-token': t('kindUserToken'),
  'account-token': t('kindAccountToken'),
};

function activeProfile(): ProfileInfo | undefined {
  return profiles.find((p) => p.id === activeProfileId);
}

/**
 * Adopt a new profiles snapshot and re-render every profile surface.
 */
function setProfilesState(newProfiles: ProfileInfo[], newActiveId: string | null): void {
  profiles = newProfiles;
  activeProfileId = newActiveId;

  // Header button opens the profile manager — visible once anything exists
  const switchBtn = document.querySelector('[data-action="switch-profile"]') as HTMLElement | null;
  if (switchBtn) switchBtn.hidden = profiles.length === 0;

  renderProfileDialogList();
}

function makeBadge(text: string, modifier: string): HTMLSpanElement {
  const badge = document.createElement('span');
  badge.className = `badge badge--${modifier}`;
  badge.textContent = text;
  return badge;
}

/**
 * Render one profile row (shared by the Settings list and the header dialog).
 */
function renderProfileItem(profile: ProfileInfo, opts: { withRemove: boolean }): HTMLElement {
  const item = document.createElement('div');
  item.className = 'zone-item zone-item--readonly';
  if (profile.id === activeProfileId) {
    item.classList.add('is-selected');
  }

  const nameSpan = document.createElement('span');
  nameSpan.className = 'zone-name';
  nameSpan.textContent = profile.label;
  nameSpan.title = profile.label;
  item.appendChild(nameSpan);

  item.appendChild(makeBadge(KIND_LABELS[profile.kind], 'muted'));
  if (profile.needsSecret) {
    item.appendChild(makeBadge(t('profileReenterBadge'), 'warning'));
  }

  if (profile.id === activeProfileId) {
    // Muted while the secret is not entered yet (active but unusable)
    item.appendChild(makeBadge(t('profileActive'), profile.needsSecret ? 'muted' : 'success'));
  } else {
    const switchBtn = document.createElement('button');
    switchBtn.type = 'button';
    switchBtn.className = 'btn btn--ghost btn--sm';
    switchBtn.textContent = profile.needsSecret ? t('profileReenter') : t('profileSwitch');
    switchBtn.addEventListener('click', () => {
      void switchToProfile(profile.id);
    });
    item.appendChild(switchBtn);
  }

  if (opts.withRemove) {
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'icon-btn';
    removeBtn.title = t('profileRemoveTitle');
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => {
      void removeProfileWithConfirm(profile);
    });
    item.appendChild(removeBtn);
  }

  return item;
}

function renderProfileRows(container: HTMLElement, withRemove: boolean): void {
  container.querySelectorAll('.zone-item').forEach((el) => {
    el.remove();
  });
  profiles.forEach((profile) => {
    container.appendChild(renderProfileItem(profile, { withRemove }));
  });
}

/** Profiles drawer list — the single management surface (switch + remove). */
function renderProfileDialogList(): void {
  const container = document.querySelector('[data-profile-dialog-list]') as HTMLElement | null;
  if (!container) return;
  renderProfileRows(container, true);
}

function showProfilesDialog(): void {
  renderProfileDialogList();
  const drawer = document.querySelector('[data-drawer="profiles"]') as HTMLElement | null;
  if (drawer) drawer.hidden = false;
}

function hideProfilesDialog(): void {
  const drawer = document.querySelector('[data-drawer="profiles"]') as HTMLElement | null;
  if (drawer) drawer.hidden = true;
}

/**
 * Switch to a profile: stale ones route to the re-enter form,
 * usable ones activate via PROFILE_SWITCH.
 */
async function switchToProfile(profileId: string): Promise<void> {
  const target = profiles.find((p) => p.id === profileId);
  if (!target) return;

  hideProfilesDialog();

  if (target.needsSecret) {
    enterReauthMode(profileId);
    showView('auth');
    return;
  }

  try {
    const response = await sendMessage({ type: 'PROFILE_SWITCH', payload: { profileId } });
    applyActiveProfile(profileId, response.accounts);
  } catch (error) {
    if (errorCode(error) === 'PROFILE_NEEDS_SECRET') {
      enterReauthMode(profileId);
      showView('auth');
      return;
    }
    const msg = error instanceof Error ? error.message : t('profileSwitchFailed');
    await showAlertDialog(msg, t('dialogError'));
  }
}

/**
 * Adopt a newly active, usable profile: fresh account list, main UI.
 */
function applyActiveProfile(profileId: string, accounts: CFAccount[]): void {
  activeProfileId = profileId;
  isUnlocked = true;

  resetAccountScopedState();
  currentAccounts = accounts;
  populateAccountSelectors(accounts);

  setProfilesState(profiles, profileId); // re-render with the new active id
  updateStatus(true, activeProfile()?.label);
  showView('create');
}

async function removeProfileWithConfirm(profile: ProfileInfo): Promise<void> {
  const confirmed = await showConfirmDialog({
    title: t('profileRemoveConfirmTitle'),
    message: t('profileRemoveConfirmMsg', profile.label),
    confirmText: t('profileRemoveConfirmBtn'),
    type: 'danger',
  });
  if (!confirmed) return;

  try {
    const wasActive = profile.id === activeProfileId;
    const response = await sendMessage({ type: 'PROFILE_REMOVE', payload: { profileId: profile.id } });
    setProfilesState(response.profiles, response.activeProfileId);

    if (!wasActive) {
      return; // removed an inactive profile — nothing else changes
    }

    // The active profile changed (or none is left) — leave the drawer
    hideProfilesDialog();
    if (!response.activeProfileId) {
      resetPanelState();
      enterAddMode();
      showView('auth');
      updateStatus(false);
      return;
    }

    const nextActive = response.profiles.find((p) => p.id === response.activeProfileId);
    if (nextActive && !nextActive.needsSecret) {
      await switchToProfile(nextActive.id); // fetches accounts for the new active profile
    } else if (nextActive) {
      resetPanelState();
      enterReauthMode(nextActive.id);
      showView('auth');
      updateStatus(false);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : t('profileRemoveFailed');
    await showAlertDialog(msg, t('dialogError'));
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
    exists: 0,
    invalid: 0,
    duplicate: 0,
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

  if (!checkBtn || !startBtn || !textarea) return;

  // Check First button
  checkBtn.addEventListener('click', async () => {
    const accountId = selectedAccountId ?? '';
    if (!accountId) {
      await showAlertDialog(t('accountRequiredMsg'), t('accountRequiredTitle'));
      return;
    }

    const { domains, duplicates, invalid } = parseDomains(textarea.value);
    if (domains.length === 0 && duplicates.length === 0 && invalid.length === 0) {
      await showAlertDialog(t('noDomainsMsg'), t('noDomainsTitle'));
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
        await showAlertDialog(msg, t('preflightErrorTitle'));
      }
    } finally {
      setButtonLoading(checkBtn, false);
    }
  });

  // Start button
  startBtn.addEventListener('click', async () => {
    const accountId = selectedAccountId ?? '';
    if (!accountId) {
      await showAlertDialog(t('accountRequiredMsg'), t('accountRequiredTitle'));
      return;
    }

    // Get domains to create (from preflight or parse fresh)
    let domainsToCreate: string[];
    if (preflightResults.length > 0) {
      domainsToCreate = preflightResults.filter((r) => r.status === 'will-create').map((r) => r.domain);
    } else {
      const { domains } = parseDomains(textarea.value);
      domainsToCreate = domains;
    }

    if (domainsToCreate.length === 0) {
      await showAlertDialog(t('noDomainsPreflightMsg'), t('noDomainsTitle'));
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
      showProgressView(t('createProgress'), domainsToCreate.length);
    } catch (error) {
      setButtonLoading(startBtn, false);
      if (!handleVaultLockedError(error)) {
        const msg = error instanceof Error ? error.message : t('createStartFailed');
        await showAlertDialog(msg, t('dialogError'));
      }
    }
  });
}

// ============================================================================
// Delete View
// ============================================================================

// ============================================================================
// Check View
// ============================================================================

async function loadZonesForCheck(accountId: string, page = 1): Promise<void> {
  const zoneList = document.querySelector('[data-view-content="check"] [data-zone-list]') as HTMLElement;
  const loadingEl = zoneList?.querySelector('[data-loading]') as HTMLElement;
  const emptyEl = zoneList?.querySelector('[data-empty]') as HTMLElement;
  const countEl = document.querySelector('[data-tray-owner="check"] [data-zone-count]');

  if (!zoneList) return;

  if (loadingEl) loadingEl.hidden = false;
  if (emptyEl) emptyEl.hidden = true;

  try {
    const epoch = profileEpoch;
    const { zones } = await sendMessage({
      type: 'GET_ZONES',
      payload: { accountId, page, perPage: ZONES_PER_PAGE },
    });
    if (epoch !== profileEpoch) return; // profile switched while loading

    checkZones = zones;

    renderReadonlyZoneList(zoneList, zones);

    if (loadingEl) loadingEl.hidden = true;
    if (emptyEl) emptyEl.hidden = zones.length > 0;
    if (countEl) {
      // Number only in the pill; the wording lives in the tooltip / a11y name
      const label = t('zonesCountLabel', String(zones.length));
      countEl.textContent = String(zones.length);
      (countEl as HTMLElement).title = label;
      countEl.setAttribute('aria-label', label);
    }
  } catch (error) {
    if (loadingEl) loadingEl.hidden = true;
    if (!handleVaultLockedError(error)) {
      console.error('[CF Tools] Failed to load zones:', error);
    }
  }
}

function renderReadonlyZoneList(container: HTMLElement, zones: CFZone[]): void {
  // Remove existing zone items
  container.querySelectorAll('.zone-item').forEach((el) => {
    el.remove();
  });

  zones.forEach((zone) => {
    const item = document.createElement('div');
    item.className = 'zone-item zone-item--readonly';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'zone-name';
    nameSpan.textContent = zone.name;

    const statusSpan = document.createElement('span');
    statusSpan.className = 'zone-status';
    statusSpan.dataset.status = zone.status;
    statusSpan.textContent = zone.status;

    item.appendChild(nameSpan);
    item.appendChild(statusSpan);
    container.appendChild(item);
  });
}

function exportZonesCSV(): void {
  if (checkZones.length === 0) return;

  const csv = ['domain,status,plan,name_servers'];
  checkZones.forEach((zone) => {
    const nameServers = zone.name_servers?.join(';') || '';
    csv.push(`"${zone.name}","${zone.status}","${zone.plan?.name || 'free'}","${nameServers}"`);
  });

  downloadCSV(csv, `zones-${selectedAccountId || 'export'}.csv`);
}

/**
 * Export every zone from every account (full pagination) — ported from the popup.
 */
async function exportAllAccountsCSV(): Promise<void> {
  const epoch = profileEpoch;
  let accounts = currentAccounts;
  if (accounts.length === 0) {
    ({ accounts } = await sendMessage({ type: 'GET_ACCOUNTS' }));
  }
  if (accounts.length === 0) return;

  const csv = ['domain,status,account,id,plan,name_servers'];
  for (const account of accounts) {
    const zones = await fetchAllZones(account.id);
    if (epoch !== profileEpoch) {
      throw new Error(t('exportFailedMsg')); // profile switched mid-export — abort a stale/mixed CSV
    }
    zones.forEach((zone) => {
      const nameServers = zone.name_servers?.join(';') || '';
      csv.push(
        `"${zone.name}","${zone.status}","${account.name}","${zone.id}","${zone.plan?.name || 'free'}","${nameServers}"`,
      );
    });
  }

  downloadCSV(csv, `cloudflare-zones-all-${new Date().toISOString().slice(0, 10)}.csv`);
}

function initCheckView(): void {
  const refreshBtn = document.querySelector('[data-action="refresh-zones"]') as HTMLButtonElement;
  const exportBtn = document.querySelector('[data-action="export-zones"]') as HTMLButtonElement;
  const exportAllBtn = document.querySelector('[data-action="export-all-zones"]') as HTMLButtonElement;

  refreshBtn?.addEventListener('click', () => {
    const accountId = selectedAccountId ?? '';
    if (accountId) {
      loadZonesForCheck(accountId);
    }
  });

  exportBtn?.addEventListener('click', () => {
    exportZonesCSV();
  });

  exportAllBtn?.addEventListener('click', async () => {
    setButtonLoading(exportAllBtn, true);
    try {
      await exportAllAccountsCSV();
    } catch (error) {
      if (!handleVaultLockedError(error)) {
        const msg = error instanceof Error ? error.message : t('exportFailedMsg');
        await showAlertDialog(msg, t('dialogError'));
      }
    } finally {
      setButtonLoading(exportAllBtn, false);
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
    const epoch = profileEpoch;
    const { zones } = await sendMessage({
      type: 'GET_ZONES',
      payload: { accountId, page, perPage: ZONES_PER_PAGE },
    });
    if (epoch !== profileEpoch) return; // profile switched while loading

    deleteZones = zones;
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

function renderZoneList(container: HTMLElement, zones: CFZone[], selected: Set<string>, prefix: string): void {
  // Remove existing zone items
  container.querySelectorAll('.zone-item').forEach((el) => {
    el.remove();
  });

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
  const countEl = document.querySelector('[data-tray-owner="delete"] [data-selected-count]');
  const deleteBtn = document.querySelector('[data-action="start-delete"]') as HTMLButtonElement;

  if (countEl) {
    countEl.textContent = String(selectedDeleteZones.size);
  }
  if (deleteBtn) {
    deleteBtn.disabled = selectedDeleteZones.size === 0;
  }
}

function initDeleteView(): void {
  const deleteBtn = document.querySelector('[data-action="start-delete"]') as HTMLButtonElement;

  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      if (selectedDeleteZones.size === 0) return;

      const confirmed = await showConfirmDialog({
        title: t('deleteConfirmTitle'),
        message: t('deleteConfirmMsg', String(selectedDeleteZones.size)),
        confirmText: t('deleteConfirmBtn'),
        type: 'danger',
      });
      if (!confirmed) return;

      const accountId = selectedAccountId ?? '';
      setButtonLoading(deleteBtn, true);

      try {
        // Get selected zones with names for better error reporting
        const selectedZonesWithNames = deleteZones
          .filter((z) => selectedDeleteZones.has(z.id))
          .map((z) => ({ id: z.id, name: z.name }));

        const { batchId } = await sendMessage({
          type: 'START_BATCH',
          payload: {
            operation: 'delete',
            accountId,
            zones: selectedZonesWithNames,
          },
        });

        currentBatchId = batchId;
        batchStartTime = Date.now();
        setButtonLoading(deleteBtn, false);
        showProgressView(t('deleteProgress'), selectedDeleteZones.size);
      } catch (error) {
        setButtonLoading(deleteBtn, false);
        if (!handleVaultLockedError(error)) {
          const msg = error instanceof Error ? error.message : t('deleteStartFailed');
          await showAlertDialog(msg, t('dialogError'));
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
    const epoch = profileEpoch;
    const { zones } = await sendMessage({
      type: 'GET_ZONES',
      payload: { accountId, page, perPage: ZONES_PER_PAGE },
    });
    if (epoch !== profileEpoch) return; // profile switched while loading

    purgeZones = zones;
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
  const countEl = document.querySelector('[data-tray-owner="purge"] [data-selected-count]');
  const purgeBtn = document.querySelector('[data-action="start-purge"]') as HTMLButtonElement;

  if (countEl) {
    countEl.textContent = String(selectedPurgeZones.size);
  }
  if (purgeBtn) {
    purgeBtn.disabled = selectedPurgeZones.size === 0;
  }
}

function initPurgeView(): void {
  const purgeBtn = document.querySelector('[data-action="start-purge"]') as HTMLButtonElement;
  const selectAllBtn = document.querySelector('[data-action="purge-select-all"]') as HTMLButtonElement;

  // "Select all in account": load every page of zones, then select them all.
  // Ported from the popup's one-click "Purge All Cache".
  selectAllBtn?.addEventListener('click', async () => {
    const accountId = selectedAccountId ?? '';
    if (!accountId) return;

    const zoneList = document.querySelector('[data-view-content="purge"] [data-zone-list]') as HTMLElement;
    setButtonLoading(selectAllBtn, true);
    try {
      const epoch = profileEpoch;
      const zones = await fetchAllZones(accountId);
      if (epoch !== profileEpoch) return; // profile switched while loading
      purgeZones = zones;
      selectedPurgeZones.clear();
      zones.forEach((zone) => {
        selectedPurgeZones.add(zone.id);
      });
      if (zoneList) {
        renderZoneList(zoneList, zones, selectedPurgeZones, 'purge');
      }
      updatePurgeSelectionCount();
    } catch (error) {
      if (!handleVaultLockedError(error)) {
        const msg = error instanceof Error ? error.message : t('zonesLoadFailed');
        await showAlertDialog(msg, t('dialogError'));
      }
    } finally {
      setButtonLoading(selectAllBtn, false);
    }
  });

  if (purgeBtn) {
    purgeBtn.addEventListener('click', async () => {
      if (selectedPurgeZones.size === 0) return;

      const confirmed = await showConfirmDialog({
        title: t('purgeConfirmTitle'),
        message: t('purgeConfirmMsg', String(selectedPurgeZones.size)),
        confirmText: t('purgeConfirmBtn'),
        type: 'warning',
      });
      if (!confirmed) return;

      const accountId = selectedAccountId ?? '';
      setButtonLoading(purgeBtn, true);

      try {
        // Get selected zones with names for better error reporting
        const selectedZonesWithNames = purgeZones
          .filter((z) => selectedPurgeZones.has(z.id))
          .map((z) => ({ id: z.id, name: z.name }));

        const { batchId } = await sendMessage({
          type: 'START_BATCH',
          payload: {
            operation: 'purge',
            accountId,
            zones: selectedZonesWithNames,
          },
        });

        currentBatchId = batchId;
        batchStartTime = Date.now();
        setButtonLoading(purgeBtn, false);
        showProgressView(t('purgeProgress'), selectedPurgeZones.size);
      } catch (error) {
        setButtonLoading(purgeBtn, false);
        if (!handleVaultLockedError(error)) {
          const msg = error instanceof Error ? error.message : t('purgeStartFailed');
          await showAlertDialog(msg, t('dialogError'));
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
      etaEl.textContent = t('progressCompleting');
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
      title: t('cancelConfirmTitle'),
      message: t('cancelConfirmMsg'),
      confirmText: t('cancelConfirmTitle'),
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

function showResultsView(summary: BatchSummary): void {
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
      // Use zoneName for delete/purge, domain for create
      domainSpan.textContent = task.zoneName || task.domain;

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
      showProgressView(t('retryProgress'), count);
    } catch (error) {
      const msg = error instanceof Error ? error.message : t('retryFailedMsg');
      await showAlertDialog(msg, t('retryErrorTitle'));
    } finally {
      // Reset on EVERY path — the success path left the button stuck on "Loading..."
      // for the results screen shown after the retried batch finished.
      setButtonLoading(retryBtn as HTMLButtonElement, false);
    }
  });

  exportBtn?.addEventListener('click', async () => {
    if (!currentBatchId) return;

    try {
      const { tasks } = await sendMessage({
        type: 'GET_FAILED_TASKS',
        payload: { batchId: currentBatchId },
      });

      // Create CSV - use zoneName for delete/purge, domain for create
      const csv = ['domain,error'];
      tasks.forEach((task) => {
        const displayName = task.zoneName || task.domain;
        const escapedError = (task.errorMessage || '').replace(/"/g, '""');
        csv.push(`"${displayName}","${escapedError}"`);
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
    preflightResults = [];

    // Reset preflight display
    const preflightEl = document.querySelector('[data-preflight]') as HTMLElement;
    if (preflightEl) preflightEl.hidden = true;

    // Reset buttons
    const startBtn = document.querySelector('[data-action="start-create"]') as HTMLButtonElement;
    if (startBtn) {
      startBtn.disabled = true;
      startBtn.textContent = t('createStart');
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
      title: t('settingsClearConfirmTitle'),
      message: t('settingsClearConfirmMsg'),
      confirmText: t('settingsClearConfirmBtn'),
      type: 'danger',
    });
    if (!confirmed) return;

    try {
      await sendMessage({ type: 'VAULT_CLEAR' });
      resetPanelState();
      showView('auth');
      updateStatus(false);
    } catch (error) {
      const msg = error instanceof Error ? error.message : t('settingsClearFailed');
      await showAlertDialog(msg, t('dialogError'));
    }
  });

  // "Manage profiles" opens the drawer (the single management surface)
  const manageBtn = document.querySelector('[data-action="manage-profiles"]');
  manageBtn?.addEventListener('click', () => {
    showProfilesDialog();
  });

  initNewsToggle();
}

/**
 * Publisher-news opt-in toggle (second consumer besides the welcome page).
 */
function initNewsToggle(): void {
  const checkbox = document.querySelector('[data-news-toggle]') as HTMLInputElement | null;
  if (!checkbox) return;

  checkbox.addEventListener('change', () => {
    // toggleNews must be the first call — Firefox accepts permissions.request
    // only while the user-input handler is still on the stack.
    const result = toggleNews(!checkbox.checked);
    checkbox.disabled = true;
    void result
      .then((on) => {
        checkbox.checked = on;
      })
      .finally(() => {
        checkbox.disabled = false;
      });
  });

  // Cross-surface sync (welcome page bell, another panel window)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !(NEWS_ENABLED_KEY in changes)) return;
    checkbox.checked = Boolean(changes[NEWS_ENABLED_KEY]?.newValue);
  });
  void getNewsEnabled().then((on) => {
    checkbox.checked = on;
  });
}

// ============================================================================
// Initialization
// ============================================================================

async function checkVaultStatus(): Promise<void> {
  try {
    const status = await sendMessage({ type: 'VAULT_STATUS' });
    setProfilesState(status.profiles, status.activeProfileId);

    const active = activeProfile();
    if (active && !active.needsSecret) {
      // Usable active profile - load accounts and show main UI
      isUnlocked = true;
      const epoch = profileEpoch;
      const { accounts } = await sendMessage({ type: 'GET_ACCOUNTS' });
      if (epoch !== profileEpoch) return; // superseded by a newer reset/re-sync
      currentAccounts = accounts;
      populateAccountSelectors(accounts);
      updateStatus(true, active.label);
      showView('create');
    } else {
      // No usable profile: re-enter mode when profiles exist, add mode otherwise
      updateStatus(false);
      enterAuthViewForCurrentState();
    }
  } catch (error) {
    console.error('[CF Tools] Failed to check vault status:', error);
    enterAddMode();
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
        tabs.forEach((t) => {
          t.classList.remove('is-active');
        });
        tab.classList.add('is-active');
        showView(tabName);

        // Load data when switching tabs (if account selected)
        if (selectedAccountId) {
          if (tabName === 'check' && checkZones.length === 0) {
            loadZonesForCheck(selectedAccountId);
          } else if (tabName === 'delete' && deleteZones.length === 0) {
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
        void checkVaultStatus(); // profiles survive a lock — re-enter mode
      } catch (error) {
        console.error('[CF Tools] Failed to lock:', error);
      }
    } else {
      // Navigate to auth view in the right mode
      enterAuthViewForCurrentState();
    }
  });

  // Header profile switcher
  const switchProfileBtn = document.querySelector('[data-action="switch-profile"]');
  switchProfileBtn?.addEventListener('click', () => {
    showProfilesDialog();
  });

  // Profiles drawer close + "Add profile" wiring
  const profilesDrawer = document.querySelector('[data-drawer="profiles"]') as HTMLElement | null;
  profilesDrawer?.querySelectorAll('[data-drawer-close]').forEach((el) => {
    el.addEventListener('click', hideProfilesDialog);
  });
  profilesDrawer?.querySelector('[data-action="dialog-add-profile"]')?.addEventListener('click', () => {
    hideProfilesDialog();
    enterAddMode();
    showView('auth');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeAccountDropdowns();
    // A confirm/alert dialog stacks above the drawer — it owns Escape then.
    if (document.querySelector('.dialog:not([hidden])')) return;
    if (profilesDrawer && !profilesDrawer.hidden) {
      hideProfilesDialog();
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

// ============================================================================
// Auth Form (add / re-enter a profile)
// ============================================================================

function authField(name: string): HTMLElement | null {
  return document.querySelector(`[data-field="${name}"]`);
}

function setAuthFieldVisible(name: string, visible: boolean): void {
  const field = authField(name);
  if (field) field.hidden = !visible;
}

function enterAddMode(): void {
  authMode = { mode: 'add' };
  applyAuthMode();
}

function enterReauthMode(profileId: string): void {
  authMode = { mode: 'reauth', profileId };
  applyAuthMode();
}

/** Pick the right auth mode for the current profiles state. */
function enterAuthViewForCurrentState(): void {
  const active = activeProfile() ?? profiles[0];
  if (active?.needsSecret) {
    enterReauthMode(active.id);
  } else {
    enterAddMode();
  }
  showView('auth');
}

function applyAuthMode(): void {
  const titleEl = document.querySelector('[data-auth-title]');
  const otherLink = document.querySelector('[data-action="auth-use-other-profile"]') as HTMLElement | null;
  const addLink = document.querySelector('[data-action="auth-add-new"]') as HTMLElement | null;
  const secretInput = document.getElementById('cf-secret') as HTMLInputElement | null;

  hideError('auth');
  if (secretInput) secretInput.value = '';
  const hint = document.querySelector('[data-detected-kind]') as HTMLElement | null;
  if (hint) hint.hidden = true;

  if (authMode.mode === 'reauth') {
    const target = profiles.find((p) => p.id === (authMode as { profileId: string }).profileId);
    if (titleEl) titleEl.textContent = t('authTitleReauth', target?.label ?? '');
    // Only the secret field in reauth mode — kind/email/accountId are stored
    for (const name of ['kind', 'email', 'account-id', 'label']) {
      setAuthFieldVisible(name, false);
    }
    if (otherLink) otherLink.hidden = profiles.length < 2;
    if (addLink) addLink.hidden = false;
  } else {
    if (titleEl) titleEl.textContent = t('authTitleAdd');
    setAuthFieldVisible('label', true);
    updateAuthFieldsFromSecret();
    if (otherLink) otherLink.hidden = profiles.length === 0;
    if (addLink) addLink.hidden = true;
  }
}

/**
 * Add mode: reveal fields based on what the pasted secret looks like.
 */
function updateAuthFieldsFromSecret(): void {
  if (authMode.mode !== 'add') return;

  const secretInput = document.getElementById('cf-secret') as HTMLInputElement | null;
  const kindSelect = document.getElementById('cf-kind') as HTMLSelectElement | null;
  const hint = document.querySelector('[data-detected-kind]') as HTMLElement | null;

  const secret = secretInput?.value.trim() ?? '';
  const detected = secret ? detectCredentialKind(secret) : 'unknown';
  const kindOverride = (kindSelect?.value || undefined) as CredentialKind | undefined;
  const effective = detected !== 'unknown' ? detected : kindOverride;

  if (hint) {
    if (detected !== 'unknown') {
      hint.textContent = t('authDetected', KIND_LABELS[detected]);
      hint.hidden = false;
    } else if (secret) {
      hint.textContent = t('authNoPrefix');
      hint.hidden = false;
    } else {
      hint.hidden = true;
    }
  }

  // Kind selector only when detection fails on a non-empty secret
  setAuthFieldVisible('kind', Boolean(secret) && detected === 'unknown');
  // Email only for Global API Key
  setAuthFieldVisible('email', effective === 'global-key');
  // Account ID stays hidden until the background asks for it (ACCOUNT_ID_REQUIRED)
  if (effective !== 'account-token') {
    setAuthFieldVisible('account-id', false);
  }
}

function initAuthForm(): void {
  const form = document.querySelector('[data-form="auth"]') as HTMLFormElement;
  if (!form) return;

  const secretInput = document.getElementById('cf-secret') as HTMLInputElement | null;
  const kindSelect = document.getElementById('cf-kind') as HTMLSelectElement | null;

  let detectTimer: ReturnType<typeof setTimeout>;
  secretInput?.addEventListener('input', () => {
    clearTimeout(detectTimer);
    detectTimer = setTimeout(updateAuthFieldsFromSecret, 150);
  });
  kindSelect?.addEventListener('change', updateAuthFieldsFromSecret);

  document.querySelector('[data-action="auth-use-other-profile"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    showProfilesDialog();
  });
  document.querySelector('[data-action="auth-add-new"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    enterAddMode();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('auth');

    const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    setButtonLoading(submitBtn, true);

    const formData = new FormData(form);
    const secret = ((formData.get('secret') as string) || '').trim();

    try {
      let profile: ProfileInfo;
      let accounts: CFAccount[];

      if (authMode.mode === 'reauth') {
        ({ profile, accounts } = await sendMessage({
          type: 'PROFILE_REAUTH',
          payload: { profileId: authMode.profileId, secret },
        }));
      } else {
        ({ profile, accounts } = await sendMessage({
          type: 'PROFILE_ADD',
          payload: {
            secret,
            kind: ((formData.get('kind') as string) || undefined) as CredentialKind | undefined,
            email: ((formData.get('email') as string) || '').trim() || undefined,
            accountId: ((formData.get('accountId') as string) || '').trim() || undefined,
            label: ((formData.get('label') as string) || '').trim() || undefined,
          },
        }));
      }

      console.log('[CF Tools] Profile connected:', profile.label);
      form.reset();
      applyActiveProfile(profile.id, accounts);
    } catch (error) {
      const code = errorCode(error);
      if (code === 'ACCOUNT_ID_REQUIRED') {
        setAuthFieldVisible('account-id', true);
        (document.getElementById('cf-account-id') as HTMLInputElement | null)?.focus();
      } else if (code === 'KIND_REQUIRED') {
        setAuthFieldVisible('kind', true);
      } else if (code === 'EMAIL_REQUIRED') {
        setAuthFieldVisible('email', true);
        (document.getElementById('cf-email') as HTMLInputElement | null)?.focus();
      }

      const message = error instanceof Error ? error.message : t('authFailed');
      const recommendation = errorRecommendation(error);
      showError('auth', recommendation ? `${message} — ${recommendation}` : message);
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
      void checkVaultStatus();
    }

    if (message.type === 'PROFILE_CHANGED') {
      const event = message as ProfileChangedEvent;
      const prevActive = activeProfileId;
      setProfilesState(event.payload.profiles, event.payload.activeProfileId);
      // Another surface (a second window's panel) switched the active profile:
      // drop account-scoped state so stale zone IDs can't be submitted under
      // the new credential, then re-sync accounts/view for the new profile.
      if (event.payload.activeProfileId !== prevActive) {
        resetAccountScopedState();
        void checkVaultStatus();
      }
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
          void checkVaultStatus();
        }
      } catch (error) {
        // Background not responding - likely restarted
        console.log('[CF Tools] Background not responding, showing auth');
        resetPanelState();
        enterAddMode();
        showView('auth');
        updateStatus(false);
      }
    }
  });
}

/** Prepend the MDI icon to each nav tab (shared with the welcome legend). */
function injectNavIcons(): void {
  document.querySelectorAll<HTMLButtonElement>('.nav-tab').forEach((tab) => {
    const path = TAB_ICONS[tab.dataset.tab ?? ''];
    if (path && !tab.querySelector('svg')) {
      tab.prepend(createSvgIcon(path, 'nav-tab__icon'));
    }
    // Icon-only tabs keep their (localized) label as tooltip + a11y name
    if (tab.classList.contains('nav-tab--icon-only')) {
      const label = tab.querySelector('.nav-tab__label')?.textContent ?? '';
      tab.title = label;
      tab.setAttribute('aria-label', label);
    }
  });
}

async function init(): Promise<void> {
  console.log('[CF Tools] Side panel initialized');

  document.documentElement.lang = chrome.i18n.getUILanguage();
  localizePanel();
  injectNavIcons();

  // Per-store review link + store glyph (build-time constants)
  const reviewLink = document.querySelector('[data-review-link]') as HTMLAnchorElement | null;
  if (reviewLink) {
    reviewLink.href = __REVIEW_URL__;
  }
  const storeGlyph = document.querySelector('use[data-store-glyph]');
  if (storeGlyph) {
    const known = ['chrome', 'firefox', 'edge'];
    const store = known.includes(__TARGET_BROWSER__) ? __TARGET_BROWSER__ : 'chrome';
    storeGlyph.setAttribute('href', `#g-store-${store}`);
  }

  // About: real version + bundled release notes
  const versionEl = document.querySelector('[data-ext-version]');
  if (versionEl) versionEl.textContent = `v${chrome.runtime.getManifest().version}`;
  const whatsNew = document.querySelector('[data-whats-new]') as HTMLElement | null;
  const whatsNewList = document.querySelector('[data-whats-new-list]');
  const latestNotes = WHATS_NEW[0];
  if (whatsNew && whatsNewList && latestNotes) {
    releaseNoteItems(latestNotes).forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      whatsNewList.appendChild(li);
    });
    whatsNew.hidden = false;
  }

  initThemeToggle();
  initNavigation();
  initAccountDropdowns();
  initActionTray();
  initAuthForm();
  initDomainInput();
  initCreateView();
  initCheckView();
  initDeleteView();
  initPurgeView();
  initProgressView();
  initResultsView();
  initSettingsView();
  initBackgroundEvents();

  // Check vault status and show appropriate view
  await checkVaultStatus();
}

document.addEventListener('DOMContentLoaded', init);
