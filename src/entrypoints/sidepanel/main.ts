/**
 * Side Panel UI Entry Point
 *
 * Main application interface for bulk operations.
 */

import { sendMessage } from '../../shared/messaging/protocol';
import type { CFAccount } from '../../shared/types/api';
import { countDomains } from '../../shared/domains';

// ============================================================================
// State
// ============================================================================

let currentAccounts: CFAccount[] = [];
let isUnlocked = false;

// ============================================================================
// View Management
// ============================================================================

type ViewName = 'auth' | 'unlock' | 'create' | 'delete' | 'purge' | 'progress' | 'results' | 'settings';

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

  // Show/hide navigation (hide for auth, unlock, progress)
  const nav = document.querySelector('.panel__nav');
  if (nav) {
    (nav as HTMLElement).hidden = ['auth', 'unlock', 'progress'].includes(viewName);
  }

  // Show/hide lock button
  const lockBtn = document.querySelector('[data-action="lock"]') as HTMLElement;
  if (lockBtn) {
    lockBtn.hidden = !isUnlocked;
  }
}

function updateStatus(connected: boolean, email?: string): void {
  const statusBadge = document.querySelector('.status-badge');
  if (statusBadge) {
    statusBadge.setAttribute('data-status', connected ? 'connected' : 'disconnected');
    statusBadge.textContent = connected ? (email || 'Connected') : 'Disconnected';
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
// Initialization
// ============================================================================

async function checkVaultStatus(): Promise<void> {
  try {
    const status = await sendMessage({ type: 'VAULT_STATUS' });

    if (!status.isInitialized) {
      // First time - show full auth form
      showView('auth');
      updateStatus(false);
    } else if (!status.isUnlocked) {
      // Locked - show unlock form
      showView('unlock');
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
      }
    });
  });

  // Lock button
  const lockBtn = document.querySelector('[data-action="lock"]');
  lockBtn?.addEventListener('click', async () => {
    try {
      await sendMessage({ type: 'VAULT_LOCK' });
      isUnlocked = false;
      showView('unlock');
      updateStatus(false);
    } catch (error) {
      console.error('[CF Tools] Failed to lock:', error);
    }
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
    const masterPassword = formData.get('masterPassword') as string;

    try {
      const { user, accounts } = await sendMessage({
        type: 'VAULT_INIT',
        payload: { email, apiKey, masterPassword },
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

function initUnlockForm(): void {
  const form = document.querySelector('[data-form="unlock"]') as HTMLFormElement;
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('unlock');

    const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    setButtonLoading(submitBtn, true);

    const formData = new FormData(form);
    const masterPassword = formData.get('masterPassword') as string;

    try {
      const { user, accounts } = await sendMessage({
        type: 'VAULT_UNLOCK',
        payload: { masterPassword },
      });

      console.log('[CF Tools] Unlock success:', user.email);

      isUnlocked = true;
      currentAccounts = accounts;
      populateAccountSelectors(accounts);
      updateStatus(true, user.email);
      showView('create');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unlock failed';
      showError('unlock', message);
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
      const count = countDomains(textarea.value);
      countEl.textContent = String(count);
    }, 150);
  });
}

// Listen for background events
function initBackgroundEvents(): void {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'VAULT_LOCKED') {
      isUnlocked = false;
      showView('unlock');
      updateStatus(false);
    }
  });
}

async function init(): Promise<void> {
  console.log('[CF Tools] Side panel initialized');

  initNavigation();
  initAuthForm();
  initUnlockForm();
  initDomainInput();
  initBackgroundEvents();

  // Check vault status and show appropriate view
  await checkVaultStatus();
}

document.addEventListener('DOMContentLoaded', init);
