import { browser } from '#imports';
import type { Browser } from '#imports';
import { delayMinutesItem, exceptionDomainsItem } from '@/lib/storage';
import {
  getAllTabStates,
  patchTabState,
  patchManyTabStates,
  clearTabState,
  pruneTabStates,
  type TabState,
} from '@/lib/session-state';
import { getHostname, isExceptedDomain, isDiscardEligible, hasPassedDelay } from '@/lib/discard-rules';
import type { ExtensionMessage, TabOverviewEntry } from '@/lib/messages';

type BrowserTab = Browser.tabs.Tab;

const SWEEP_ALARM = 'lethonauta-sweep';
const MENU_ID = 'toggle-keep-active';
/** Garde-fou : si onChanged n'a jamais été reçu (service worker tué en plein téléchargement), on ne bloque pas un onglet indéfiniment. */
const STALE_DOWNLOAD_MS = 60 * 60_000;

/** downloadId -> tabId. En mémoire seulement : associations éphémères, acceptable de les perdre si le service worker redémarre en cours de téléchargement (voir STALE_DOWNLOAD_MS). */
const downloadTabMap = new Map<number, number>();

function getOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

async function getVisibleTabId(): Promise<number | null> {
  const windows = await browser.windows.getAll({ windowTypes: ['normal'] });
  const focused = windows.find((w) => w.focused);
  if (!focused || focused.id == null) return null;
  const [activeTab] = await browser.tabs.query({ active: true, windowId: focused.id });
  return activeTab?.id ?? null;
}

/** Met à jour becameInactiveAt pour chaque onglet selon qu'il est le seul onglet visible ou non. Ne décharge rien elle-même. */
async function reconcileVisibility(): Promise<void> {
  const [visibleTabId, tabs, allStates] = await Promise.all([
    getVisibleTabId(),
    browser.tabs.query({}),
    getAllTabStates(),
  ]);
  const now = Date.now();
  const patches: Record<number, Partial<TabState>> = {};
  const existingIds = new Set<number>();

  for (const tab of tabs) {
    if (tab.id == null) continue;
    existingIds.add(tab.id);
    const state = allStates[tab.id] ?? {};

    if (tab.id === visibleTabId) {
      if (state.becameInactiveAt != null) {
        patches[tab.id] = { ...patches[tab.id], becameInactiveAt: undefined };
      }
    } else if (state.becameInactiveAt == null) {
      patches[tab.id] = { ...patches[tab.id], becameInactiveAt: now };
    }

    if (state.downloadInProgress && state.downloadStartedAt && now - state.downloadStartedAt > STALE_DOWNLOAD_MS) {
      patches[tab.id] = { ...patches[tab.id], downloadInProgress: false };
    }
  }

  await patchManyTabStates(patches);
  await pruneTabStates(existingIds);
}

async function attemptDiscardEligibleTabs(): Promise<void> {
  const [tabs, domains, delayMinutes, allStates] = await Promise.all([
    browser.tabs.query({}),
    exceptionDomainsItem.getValue(),
    delayMinutesItem.getValue(),
    getAllTabStates(),
  ]);
  const now = Date.now();

  for (const tab of tabs) {
    if (tab.id == null) continue;
    const tabState = allStates[tab.id] ?? {};
    if (!hasPassedDelay(tabState, delayMinutes, now)) continue;
    if (!isDiscardEligible({ tab, tabState, exceptionDomains: domains })) continue;

    try {
      await browser.tabs.discard(tab.id);
    } catch (err) {
      console.warn('[lethonauta] échec du déchargement', tab.id, err);
    }
    await refreshBadge(tab.id);
  }
}

async function handleVisibilityChange(): Promise<void> {
  await reconcileVisibility();
  await attemptDiscardEligibleTabs();
}

async function refreshBadge(tabId: number): Promise<void> {
  const [tab, domains] = await Promise.all([
    browser.tabs.get(tabId).catch(() => null),
    exceptionDomainsItem.getValue(),
  ]);
  if (!tab) return;
  const excepted = isExceptedDomain(tab.url, domains);
  const text = tab.discarded ? 'zZ' : excepted ? '★' : '';
  await browser.action.setBadgeText({ tabId, text }).catch(() => {});
  if (text) {
    await browser.action
      .setBadgeBackgroundColor({ tabId, color: tab.discarded ? '#64748b' : '#2563eb' })
      .catch(() => {});
  }
}

async function applyExceptionAutoDiscardable(tab: BrowserTab): Promise<void> {
  if (tab.id == null) return;
  const domains = await exceptionDomainsItem.getValue();
  const excepted = isExceptedDomain(tab.url, domains);
  const desired = !excepted;
  if (tab.autoDiscardable !== desired) {
    await browser.tabs.update(tab.id, { autoDiscardable: desired }).catch(() => {});
  }
  await refreshBadge(tab.id);
}

function getExceptionMenuTitle(excepted: boolean): string {
  return excepted ? 'Ne plus garder cet onglet actif' : 'Garder cet onglet actif';
}

async function updateContextMenuForCurrentTab(): Promise<void> {
  const [activeTab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  if (activeTab == null) return;
  const domains = await exceptionDomainsItem.getValue();
  const excepted = isExceptedDomain(activeTab.url, domains);
  await browser.contextMenus
    .update(MENU_ID, { title: getExceptionMenuTitle(excepted) })
    .catch(() => {});
}

async function toggleExceptionForTab(tabId: number): Promise<void> {
  const tab = await browser.tabs.get(tabId).catch(() => null);
  const hostname = getHostname(tab?.url);
  if (!hostname) return;
  const domains = await exceptionDomainsItem.getValue();
  const next = domains.includes(hostname)
    ? domains.filter((d) => d !== hostname)
    : [...domains, hostname];
  await exceptionDomainsItem.setValue(next);
  // exceptionDomainsItem.watch() ci-dessous répercute le changement sur tous les onglets concernés.
}

async function reconcileAutoDiscardableForAllTabs(domains: string[]): Promise<void> {
  const tabs = await browser.tabs.query({});
  for (const tab of tabs) {
    if (tab.id == null) continue;
    const excepted = isExceptedDomain(tab.url, domains);
    const desired = !excepted;
    if (tab.autoDiscardable !== desired) {
      await browser.tabs.update(tab.id, { autoDiscardable: desired }).catch(() => {});
    }
    await refreshBadge(tab.id);
  }
  await updateContextMenuForCurrentTab();
}

async function getTabsOverview(): Promise<TabOverviewEntry[]> {
  const [tabs, domains] = await Promise.all([browser.tabs.query({}), exceptionDomainsItem.getValue()]);
  return tabs
    .filter((t): t is BrowserTab & { id: number } => t.id != null)
    .map((t) => {
      const hostname = getHostname(t.url);
      return {
        id: t.id,
        title: t.title || t.url || 'Onglet',
        url: t.url ?? '',
        windowId: t.windowId,
        active: Boolean(t.active),
        discarded: Boolean(t.discarded),
        excepted: isExceptedDomain(t.url, domains),
        hostname,
      };
    });
}

export default defineBackground(() => {
  // --- Installation / démarrage ---
  browser.runtime.onInstalled.addListener(() => {
    void (async () => {
      await browser.contextMenus.removeAll();
      browser.contextMenus.create({ id: MENU_ID, title: getExceptionMenuTitle(false), contexts: ['page'] });
      await browser.alarms.create(SWEEP_ALARM, { periodInMinutes: 1 });
    })();
  });

  browser.runtime.onStartup.addListener(() => {
    void browser.alarms.create(SWEEP_ALARM, { periodInMinutes: 1 });
  });

  // --- Visibilité des onglets ---
  browser.tabs.onActivated.addListener(() => {
    void handleVisibilityChange();
    void updateContextMenuForCurrentTab();
  });

  browser.windows.onFocusChanged.addListener(() => {
    void handleVisibilityChange();
    void updateContextMenuForCurrentTab();
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    void clearTabState(tabId);
  });

  browser.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.status === 'complete') {
      void applyExceptionAutoDiscardable(tab);
    }
  });

  browser.tabs.onCreated.addListener((tab) => {
    void applyExceptionAutoDiscardable(tab);
  });

  // --- Balayage périodique (gère aussi le cas délai = 0 via handleVisibilityChange) ---
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === SWEEP_ALARM) {
      void handleVisibilityChange();
    }
  });

  // --- Téléchargements en cours (protection par heuristique referrer/url, cf. plan) ---
  browser.downloads.onCreated.addListener((downloadItem) => {
    void (async () => {
      const candidateUrl = downloadItem.referrer || downloadItem.url;
      if (!candidateUrl) return;
      const tabs = await browser.tabs.query({});
      const origin = getOrigin(candidateUrl);
      const match = tabs.find((t) => t.url === candidateUrl) ?? tabs.find((t) => t.url && getOrigin(t.url) === origin);
      if (match?.id != null) {
        downloadTabMap.set(downloadItem.id, match.id);
        await patchTabState(match.id, { downloadInProgress: true, downloadStartedAt: Date.now() });
      }
    })();
  });

  browser.downloads.onChanged.addListener((delta) => {
    if (delta.state && (delta.state.current === 'complete' || delta.state.current === 'interrupted')) {
      const tabId = downloadTabMap.get(delta.id);
      if (tabId != null) {
        downloadTabMap.delete(delta.id);
        void patchTabState(tabId, { downloadInProgress: false });
      }
    }
  });

  // --- Formulaires / exceptions / popup ---
  browser.runtime.onMessage.addListener((message: ExtensionMessage, sender) => {
    switch (message?.type) {
      case 'form-dirty':
        if (sender.tab?.id != null) {
          void patchTabState(sender.tab.id, { formDirty: Boolean(message.dirty) });
        }
        return undefined;
      case 'toggle-exception':
        return toggleExceptionForTab(message.tabId).then(() => true);
      case 'get-tabs-overview':
        return getTabsOverview();
      default:
        return undefined;
    }
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === MENU_ID && tab?.id != null) {
      void toggleExceptionForTab(tab.id);
    }
  });

  // Réagit à tout changement de la liste d'exceptions, qu'il vienne du popup, de la page
  // d'options, du menu contextuel ou d'une synchronisation multi-poste.
  exceptionDomainsItem.watch((domains) => {
    void reconcileAutoDiscardableForAllTabs(domains);
  });
});
