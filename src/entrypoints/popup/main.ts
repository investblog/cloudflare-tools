/**
 * Popup UI Entry Point
 *
 * Quick actions + "Open Full Panel" button.
 * Shows vault status and provides quick access to common operations.
 */

import { sendMessage } from '../../shared/messaging/protocol';
import type { CFAccount, CFZone } from '../../shared/types/api';
import { initTheme } from '../../shared/theme';

// ============================================================================
// State
// ============================================================================

let isUnlocked = false;
let currentAccounts: CFAccount[] = [];

// ============================================================================
// UI Helpers
// ============================================================================

function updateStatus(connected: boolean, email?: string): void {
  const statusEl = document.querySelector('[data-status]');
  if (statusEl) {
    statusEl.setAttribute('data-status', connected ? 'connected' : 'disconnected');
    statusEl.textContent = connected ? (email || 'Connected') : 'Disconnected';
  }
}

function setButtonsEnabled(enabled: boolean): void {
  const purgeBtn = document.querySelector('[data-action="purge-all"]') as HTMLButtonElement;
  const exportBtn = document.querySelector('[data-action="export-zones"]') as HTMLButtonElement;

  // Purge requires account selection
  const accountSelect = document.querySelector('[data-account-select]') as HTMLSelectElement;
  const hasAccount = accountSelect?.value !== '';

  if (purgeBtn) purgeBtn.disabled = !enabled || !hasAccount;
  if (exportBtn) exportBtn.disabled = !enabled;
}

function populateAccountSelector(accounts: CFAccount[]): void {
  const section = document.querySelector('[data-account-section]') as HTMLElement;
  const select = document.querySelector('[data-account-select]') as HTMLSelectElement;

  if (!section || !select) return;

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

  // Show section
  section.hidden = false;

  // Auto-select if only one account
  if (accounts.length === 1) {
    select.value = accounts[0].id;
  }

  // Update buttons state when account changes
  select.addEventListener('change', () => {
    setButtonsEnabled(isUnlocked);
  });
}

function getSelectedAccount(): CFAccount | null {
  const select = document.querySelector('[data-account-select]') as HTMLSelectElement;
  if (!select?.value) return null;

  return currentAccounts.find((a) => a.id === select.value) || null;
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
// Actions
// ============================================================================

async function openSidePanel(): Promise<void> {
  try {
    // Firefox: use sidebarAction API
    if (typeof browser !== 'undefined' && browser.sidebarAction) {
      await browser.sidebarAction.open();
      window.close();
      return;
    }

    // Chrome: use sidePanel API
    if (chrome.sidePanel) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        await chrome.sidePanel.open({ tabId: tab.id });
      } else {
        const currentWindow = await chrome.windows.getCurrent();
        await chrome.sidePanel.open({ windowId: currentWindow.id! });
      }
      window.close();
      return;
    }

    // Fallback: open panel in new tab
    chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel.html') });
  } catch (error) {
    console.error('[CF Tools] Failed to open side panel:', error);
    // Fallback
    chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel.html') });
  }
}

async function purgeAllCache(): Promise<void> {
  const account = getSelectedAccount();
  if (!account) {
    alert('Please select an account');
    return;
  }

  const accountId = account.id;
  const accountName = account.name;

  const confirmed = confirm(
    `This will purge cache for ALL zones in "${accountName}". Continue?`
  );
  if (!confirmed) return;

  const purgeBtn = document.querySelector('[data-action="purge-all"]') as HTMLButtonElement;
  setButtonLoading(purgeBtn, true);

  try {
    // Get all zones
    const { zones } = await sendMessage({
      type: 'GET_ZONES',
      payload: { accountId, page: 1, perPage: 500 },
    });

    if (zones.length === 0) {
      alert('No zones found in this account');
      setButtonLoading(purgeBtn, false);
      return;
    }

    // Start batch purge
    const { batchId } = await sendMessage({
      type: 'START_BATCH',
      payload: {
        operation: 'purge',
        accountId,
        zoneIds: zones.map((z) => z.id),
      },
    });

    // Open side panel to show progress
    alert(`Started purging ${zones.length} zones. Opening panel to show progress...`);
    await openSidePanel();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Purge failed';
    alert(`Error: ${message}`);
    setButtonLoading(purgeBtn, false);
  }
}

async function exportZones(): Promise<void> {
  if (currentAccounts.length === 0) {
    alert('No accounts available');
    return;
  }

  const exportBtn = document.querySelector('[data-action="export-zones"]') as HTMLButtonElement;
  setButtonLoading(exportBtn, true);

  try {
    // Export zones from all accounts
    const allZones: Array<CFZone & { accountName: string }> = [];

    for (const account of currentAccounts) {
      const { zones } = await sendMessage({
        type: 'GET_ZONES',
        payload: { accountId: account.id, page: 1, perPage: 1000 },
      });

      zones.forEach((zone) => {
        allZones.push({ ...zone, accountName: account.name });
      });
    }

    if (allZones.length === 0) {
      alert('No zones found');
      setButtonLoading(exportBtn, false);
      return;
    }

    // Create CSV
    const csv = ['domain,status,account,id'];
    allZones.forEach((zone) => {
      csv.push(`"${zone.name}","${zone.status}","${zone.accountName}","${zone.id}"`);
    });

    // Download
    const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cloudflare-zones-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setButtonLoading(exportBtn, false);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Export failed';
    alert(`Error: ${message}`);
    setButtonLoading(exportBtn, false);
  }
}

// ============================================================================
// Initialization
// ============================================================================

async function checkVaultStatus(): Promise<void> {
  try {
    const status = await sendMessage({ type: 'VAULT_STATUS' });

    if (!status.isInitialized || !status.isUnlocked) {
      updateStatus(false);
      setButtonsEnabled(false);
      return;
    }

    // Vault is unlocked, get accounts
    isUnlocked = true;
    const { accounts } = await sendMessage({ type: 'GET_ACCOUNTS' });
    currentAccounts = accounts;

    populateAccountSelector(accounts);
    updateStatus(true, status.email);
    setButtonsEnabled(true);
  } catch (error) {
    console.error('[CF Tools] Failed to check vault status:', error);
    updateStatus(false);
    setButtonsEnabled(false);
  }
}

function initEventListeners(): void {
  // Open Side Panel button
  const openPanelBtn = document.querySelector('[data-action="open-panel"]');
  openPanelBtn?.addEventListener('click', openSidePanel);

  // Purge All Cache button
  const purgeBtn = document.querySelector('[data-action="purge-all"]');
  purgeBtn?.addEventListener('click', purgeAllCache);

  // Export Zones button
  const exportBtn = document.querySelector('[data-action="export-zones"]');
  exportBtn?.addEventListener('click', exportZones);
}

async function init(): Promise<void> {
  console.log('[CF Tools] Popup initialized');

  initTheme();
  initEventListeners();
  await checkVaultStatus();
}

document.addEventListener('DOMContentLoaded', init);
