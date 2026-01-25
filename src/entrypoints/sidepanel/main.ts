/**
 * Side Panel UI Entry Point
 *
 * Main application interface for bulk operations.
 */

import { countDomains } from '../../shared/domains';

// View management
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

  // Show/hide navigation
  const nav = document.querySelector('.panel__nav');
  if (nav) {
    (nav as HTMLElement).hidden = viewName === 'auth' || viewName === 'progress';
  }
}

function initNavigation(): void {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const tabName = tab.getAttribute('data-tab') as ViewName;
      if (tabName) {
        // Update active state
        tabs.forEach((t) => t.classList.remove('is-active'));
        tab.classList.add('is-active');

        // Show view
        showView(tabName);
      }
    });
  });
}

function initAuthForm(): void {
  const form = document.querySelector('[data-form="auth"]') as HTMLFormElement;
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(form);
    const email = formData.get('email') as string;
    const apiKey = formData.get('apiKey') as string;
    const masterPassword = formData.get('masterPassword') as string;

    // TODO: Validate credentials via background worker
    // TODO: Encrypt and store credentials
    // TODO: Load accounts

    console.log('[CF Tools] Auth attempt:', { email, apiKeyLength: apiKey.length });

    // For now, just show the create view
    showView('create');
    document.querySelector('.panel__nav')!.removeAttribute('hidden');
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

function init(): void {
  console.log('[CF Tools] Side panel initialized');

  initNavigation();
  initAuthForm();
  initDomainInput();

  // TODO: Check if already authenticated
  // TODO: Handle lock/unlock
  // TODO: Initialize all view handlers
}

document.addEventListener('DOMContentLoaded', init);
