/**
 * Content Script for Cloudflare Dashboard Integration
 *
 * Injects "Bulk Add" and "Export Zones" buttons into the CF Dashboard.
 * Controlled by the `enableDashboardButtons` setting (default: off).
 */

import { sendMessage } from '../shared/messaging/protocol';

export default defineContentScript({
  matches: ['https://dash.cloudflare.com/*'],
  runAt: 'document_idle',

  async main() {
    await initContentScript();
  },
});

// ============================================================================
// Constants
// ============================================================================

const BUTTON_CONTAINER_ID = 'cf-tools-buttons';
const CHECK_INTERVAL = 1000; // Check for page changes every second
const MAX_RETRIES = 30; // Max retries to find injection point

// ============================================================================
// State
// ============================================================================

let isEnabled = false;
let buttonsInjected = false;
let checkInterval: ReturnType<typeof setInterval> | null = null;

// ============================================================================
// Styles
// ============================================================================

const STYLES = `
  #${BUTTON_CONTAINER_ID} {
    display: inline-flex;
    gap: 8px;
    margin-left: 12px;
  }

  .cf-tools-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    font-size: 14px;
    font-weight: 500;
    color: #fff;
    background: linear-gradient(135deg, #f6821f 0%, #f6821f 100%);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: inherit;
  }

  .cf-tools-btn:hover {
    background: linear-gradient(135deg, #e5740f 0%, #e5740f 100%);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(246, 130, 31, 0.3);
  }

  .cf-tools-btn:active {
    transform: translateY(0);
  }

  .cf-tools-btn--secondary {
    background: #2c3e50;
  }

  .cf-tools-btn--secondary:hover {
    background: #34495e;
    box-shadow: 0 2px 8px rgba(44, 62, 80, 0.3);
  }

  .cf-tools-btn svg {
    width: 16px;
    height: 16px;
    fill: currentColor;
  }
`;

// ============================================================================
// Icons (inline SVG)
// ============================================================================

const ICONS = {
  add: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M12 5v14M5 12h14"/>
  </svg>`,
  export: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7,10 12,15 17,10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>`,
};

// ============================================================================
// Utility Functions
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('cf-tools-styles')) return;

  const style = document.createElement('style');
  style.id = 'cf-tools-styles';
  style.textContent = STYLES;
  document.head.appendChild(style);
}

function removeStyles(): void {
  const style = document.getElementById('cf-tools-styles');
  if (style) style.remove();
}

function isWebsitesPage(): boolean {
  // Match URLs like:
  // https://dash.cloudflare.com/<account_id>/websites
  // https://dash.cloudflare.com/<account_id>
  const path = window.location.pathname;
  return /^\/[a-f0-9]{32}(\/websites)?$/.test(path) || path === '/';
}

function isZoneDetailPage(): boolean {
  // Match URLs like:
  // https://dash.cloudflare.com/<account_id>/<zone_name>/...
  const path = window.location.pathname;
  return /^\/[a-f0-9]{32}\/[^/]+/.test(path) && !path.includes('/websites');
}

// ============================================================================
// Button Actions
// ============================================================================

function openSidePanel(): void {
  // Send message to background to open side panel
  chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' }).catch(() => {
    // Fallback: try to open extension popup
    console.log('[CF Tools] Could not open side panel');
  });
}

async function exportZones(): Promise<void> {
  try {
    // Get current account ID from URL
    const match = window.location.pathname.match(/^\/([a-f0-9]{32})/);
    if (!match) {
      alert('Could not detect account ID');
      return;
    }

    const accountId = match[1];

    // Fetch all zones for this account
    const { zones } = await sendMessage({
      type: 'GET_ZONES',
      payload: { accountId, page: 1, perPage: 1000 },
    });

    if (zones.length === 0) {
      alert('No zones found in this account');
      return;
    }

    // Create CSV
    const csv = ['domain,status,id'];
    zones.forEach((zone) => {
      csv.push(`"${zone.name}","${zone.status}","${zone.id}"`);
    });

    // Download
    const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cloudflare-zones-${accountId.slice(0, 8)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Export failed';
    alert(`Export failed: ${message}`);
  }
}

// ============================================================================
// Button Injection
// ============================================================================

function createButtons(): HTMLElement {
  const container = document.createElement('div');
  container.id = BUTTON_CONTAINER_ID;

  // Bulk Add button
  const addBtn = document.createElement('button');
  addBtn.className = 'cf-tools-btn';
  addBtn.innerHTML = `${ICONS.add} Bulk Add`;
  addBtn.title = 'Open Cloudflare Tools to add zones in bulk';
  addBtn.addEventListener('click', openSidePanel);

  // Export button
  const exportBtn = document.createElement('button');
  exportBtn.className = 'cf-tools-btn cf-tools-btn--secondary';
  exportBtn.innerHTML = `${ICONS.export} Export`;
  exportBtn.title = 'Export all zones to CSV';
  exportBtn.addEventListener('click', exportZones);

  container.appendChild(addBtn);
  container.appendChild(exportBtn);

  return container;
}

function findInjectionPoint(): HTMLElement | null {
  // Try to find the "Add a site" button or the header actions area
  // CF Dashboard structure changes, so we try multiple selectors

  // Option 1: Find the "Add a site" button container
  const addSiteBtn = document.querySelector('a[href*="/add-site"], button[data-testid="add-site-button"]');
  if (addSiteBtn?.parentElement) {
    return addSiteBtn.parentElement;
  }

  // Option 2: Find header actions area
  const headerActions = document.querySelector('[class*="HeaderActions"], [class*="header-actions"]');
  if (headerActions) {
    return headerActions as HTMLElement;
  }

  // Option 3: Find the main heading area on websites page
  const heading = document.querySelector('h1, [class*="Heading"]');
  if (heading?.parentElement) {
    return heading.parentElement;
  }

  return null;
}

function injectButtons(): boolean {
  if (buttonsInjected) return true;
  if (!isWebsitesPage()) return false;

  const injectionPoint = findInjectionPoint();
  if (!injectionPoint) return false;

  // Check if already injected
  if (document.getElementById(BUTTON_CONTAINER_ID)) {
    buttonsInjected = true;
    return true;
  }

  const buttons = createButtons();
  injectionPoint.appendChild(buttons);
  buttonsInjected = true;

  console.log('[CF Tools] Dashboard buttons injected');
  return true;
}

function removeButtons(): void {
  const container = document.getElementById(BUTTON_CONTAINER_ID);
  if (container) {
    container.remove();
  }
  buttonsInjected = false;
}

// ============================================================================
// Page Monitoring
// ============================================================================

function startMonitoring(): void {
  if (checkInterval) return;

  let retries = 0;

  checkInterval = setInterval(() => {
    // If not on websites page, remove buttons
    if (!isWebsitesPage()) {
      if (buttonsInjected) {
        removeButtons();
      }
      retries = 0;
      return;
    }

    // Try to inject buttons
    if (!buttonsInjected) {
      const success = injectButtons();
      if (success) {
        retries = 0;
      } else {
        retries++;
        if (retries > MAX_RETRIES) {
          console.log('[CF Tools] Could not find injection point, stopping');
          retries = 0;
        }
      }
    }
  }, CHECK_INTERVAL);
}

function stopMonitoring(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}

// ============================================================================
// Initialization
// ============================================================================

async function checkFeatureFlag(): Promise<boolean> {
  try {
    const { settings } = await sendMessage({ type: 'GET_SETTINGS' });
    return settings.enableDashboardButtons;
  } catch (error) {
    console.log('[CF Tools] Could not check settings:', error);
    return false;
  }
}

async function initContentScript(): Promise<void> {
  console.log('[CF Tools] Content script loaded');

  // Check if feature is enabled
  isEnabled = await checkFeatureFlag();

  if (!isEnabled) {
    console.log('[CF Tools] Dashboard buttons disabled in settings');
    return;
  }

  console.log('[CF Tools] Dashboard buttons enabled, starting injection');

  // Inject styles
  injectStyles();

  // Start monitoring for page changes (CF Dashboard is SPA)
  startMonitoring();

  // Also try immediate injection
  if (isWebsitesPage()) {
    injectButtons();
  }
}

// Listen for settings changes
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'SETTINGS_CHANGED') {
    const newEnabled = message.payload?.enableDashboardButtons ?? false;

    if (newEnabled !== isEnabled) {
      isEnabled = newEnabled;

      if (isEnabled) {
        console.log('[CF Tools] Dashboard buttons enabled');
        injectStyles();
        startMonitoring();
        if (isWebsitesPage()) {
          injectButtons();
        }
      } else {
        console.log('[CF Tools] Dashboard buttons disabled');
        stopMonitoring();
        removeButtons();
        removeStyles();
      }
    }
  }
});

// Handle page unload
window.addEventListener('beforeunload', () => {
  stopMonitoring();
});
