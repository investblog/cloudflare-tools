/**
 * Popup UI Entry Point
 *
 * Quick actions + "Open Full Panel" button
 */

function init(): void {
  // Open Side Panel button
  const openPanelBtn = document.querySelector('[data-action="open-panel"]');
  openPanelBtn?.addEventListener('click', async () => {
    // Open side panel (Chrome 114+)
    if (chrome.sidePanel) {
      const currentWindow = await chrome.windows.getCurrent();
      await chrome.sidePanel.open({ windowId: currentWindow.id! });
      window.close();
    } else {
      // Fallback: open panel in new tab
      chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel.html') });
    }
  });

  // TODO: Initialize quick actions
  // TODO: Check auth status and update UI
}

document.addEventListener('DOMContentLoaded', init);
