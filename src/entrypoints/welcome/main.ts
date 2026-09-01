/**
 * Welcome page — opened once per profile from the background worker.
 * All DOM is built in TS (no innerHTML with dynamic data; AMO-safe).
 */

import { createSvgIcon } from '../../shared/dom';
import { t } from '../../shared/i18n';
import { ICON_PROFILES, TAB_ICONS } from '../../shared/icons';
import { getNewsEnabled, NEWS_ENABLED_KEY, toggleNews } from '../../shared/news';
import { initTheme } from '../../shared/theme';
import { releaseNoteItems, WHATS_NEW } from '../../shared/whats-new';

// Tracked link to 301.st (UTM for attribution — own campaign per surface).
const WELCOME_301_URL = 'https://301.st/?utm_source=cloudflare-tools&utm_medium=extension&utm_campaign=welcome';
const GITHUB_URL = 'https://github.com/investblog/cloudflare-tools';

declare const __REVIEW_URL__: string;

const BELL_ON =
  'M21 19v1H3v-1l2-2v-6c0-3.1 2.03-5.83 5-6.71V4a2 2 0 0 1 4 0v.29c2.97.88 5 3.61 5 6.71v6zm-7 2a2 2 0 0 1-4 0z';
const BELL_OFF =
  'M20.84 22.73 18.11 20H3v-1l2-2v-6c0-1.14.29-2.23.79-3.18L1.11 3l1.28-1.27 19.72 19.73zM19 15.8V11c0-3.1-2.03-5.83-5-6.71V4a2 2 0 0 0-4 0v.29c-.61.18-1.18.44-1.7.78zM12 23a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2';

// Icons match the panel's tab bar so this list reads as a legend for it.
const FEATURES: Array<{ icon: string; name: string; text: string }> = [
  { icon: TAB_ICONS.create, name: t('tabCreate'), text: t('welFeatCreate') },
  { icon: TAB_ICONS.check, name: t('tabCheck'), text: t('welFeatCheck') },
  { icon: TAB_ICONS.delete, name: t('tabDelete'), text: t('welFeatDelete') },
  { icon: TAB_ICONS.purge, name: t('tabPurge'), text: t('welFeatPurge') },
  { icon: ICON_PROFILES, name: t('profilesTitle'), text: t('welFeatProfiles') },
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

function link(href: string, text: string): HTMLAnchorElement {
  const a = el('a', 'welcome__link', text);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  return a;
}

// Cache the window id at load — sidePanel.open must run while the click
// gesture is still live, so nothing may be awaited inside the handler.
let currentWindowId: number | undefined;
try {
  chrome.windows?.getCurrent?.().then((w) => {
    currentWindowId = w?.id ?? undefined;
  });
} catch {
  /* not critical */
}

function openPanel(): void {
  const b = chrome as typeof chrome & { sidebarAction?: { open: () => Promise<void> } };
  if (b.sidePanel?.open && currentWindowId !== undefined) {
    b.sidePanel.open({ windowId: currentWindowId }).catch(() => {
      void chrome.tabs.create({ url: chrome.runtime.getURL('/sidepanel.html') });
    });
  } else if (b.sidebarAction?.open) {
    b.sidebarAction.open().catch(() => {
      void chrome.tabs.create({ url: chrome.runtime.getURL('/sidepanel.html') });
    });
  } else {
    void chrome.tabs.create({ url: chrome.runtime.getURL('/sidepanel.html') });
  }
}

function newsBellRow(): HTMLElement {
  const row = el('div', 'welcome__news');
  const btn = el('button', 'welcome__bell');
  btn.type = 'button';
  const label = el('span', 'welcome__news-text');
  let enabled = false;

  const paint = (): void => {
    btn.replaceChildren(createSvgIcon(enabled ? BELL_ON : BELL_OFF, 'welcome__bell-icon'));
    btn.title = enabled ? t('newsTitleOn') : t('newsTitleOff');
    btn.setAttribute('aria-pressed', String(enabled));
    label.textContent = enabled ? t('newsStateOn') : t('newsStateOff');
  };

  btn.addEventListener('click', () => {
    // toggleNews must be the first call — Firefox accepts permissions.request
    // only while the user-input handler is still on the stack.
    const result = toggleNews(enabled);
    btn.disabled = true;
    void result
      .then((on) => {
        enabled = on;
        paint();
      })
      .finally(() => {
        btn.disabled = false;
      });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !(NEWS_ENABLED_KEY in changes)) return;
    enabled = Boolean(changes[NEWS_ENABLED_KEY]?.newValue);
    paint();
  });
  void getNewsEnabled().then((on) => {
    enabled = on;
    paint();
  });

  paint();
  row.appendChild(btn);
  row.appendChild(label);
  return row;
}

function render(root: HTMLElement): void {
  // Header
  const header = el('header', 'welcome__header');
  const logo = el('img', 'welcome__logo') as HTMLImageElement;
  logo.src = '/icons/icon-48.png';
  logo.alt = '';
  header.appendChild(logo);
  const headText = el('div', 'welcome__head-text');
  headText.appendChild(el('h1', 'welcome__title', 'Cloudflare Tools'));
  headText.appendChild(el('p', 'welcome__tagline', t('welTagline')));
  header.appendChild(headText);

  // Hero
  const hero = el('section', 'welcome__card welcome__hero');
  hero.appendChild(el('h2', 'welcome__card-title', t('welGetStarted')));
  hero.appendChild(el('p', 'welcome__card-text', t('welGetStartedText')));
  const openBtn = el('button', 'btn btn--primary', t('welOpenPanel'));
  openBtn.type = 'button';
  openBtn.addEventListener('click', openPanel);
  hero.appendChild(openBtn);
  hero.appendChild(el('p', 'welcome__hint', t('welPinHint')));

  // Features
  const features = el('section', 'welcome__card');
  features.appendChild(el('h2', 'welcome__card-title', t('welWhatsInside')));
  const list = el('ul', 'welcome__features');
  for (const feature of FEATURES) {
    const item = el('li', 'welcome__feature');
    item.appendChild(createSvgIcon(feature.icon, 'welcome__feature-icon'));
    const body = el('span', 'welcome__feature-body');
    body.appendChild(el('strong', 'welcome__feature-name', feature.name));
    body.appendChild(el('span', 'welcome__feature-text', ` — ${feature.text}`));
    item.appendChild(body);
    list.appendChild(item);
  }
  features.appendChild(list);

  // What's new (bundled)
  const news = el('section', 'welcome__card');
  const latest = WHATS_NEW[0];
  news.appendChild(el('h2', 'welcome__card-title', t('welWhatsNew', latest.version)));
  const newsList = el('ul', 'welcome__notes');
  for (const item of releaseNoteItems(latest)) {
    newsList.appendChild(el('li', 'welcome__note', item));
  }
  news.appendChild(newsList);

  // Privacy + news opt-in + links
  const privacy = el('section', 'welcome__card');
  privacy.appendChild(el('h2', 'welcome__card-title', t('welPrivacyTitle')));
  privacy.appendChild(el('p', 'welcome__card-text', t('welPrivacyText')));
  privacy.appendChild(newsBellRow());
  const links = el('p', 'welcome__links');
  links.appendChild(link(WELCOME_301_URL, t('welLink301')));
  links.appendChild(link(GITHUB_URL, 'GitHub'));
  links.appendChild(link(__REVIEW_URL__, t('welLinkRate')));
  privacy.appendChild(links);

  root.append(header, hero, features, news, privacy);
}

initTheme();
document.documentElement.lang = chrome.i18n.getUILanguage();
document.title = t('welTitle');
render(document.getElementById('app') as HTMLElement);
