import './style.css';
import { browser } from '#imports';
import type { ExtensionMessage, TabOverviewEntry } from '@/lib/messages';

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <h1>Onglets ouverts</h1>
  <ul class="tab-list" id="tab-list"></ul>
  <p class="empty-state" id="empty-state" hidden>Aucun onglet.</p>
  <p class="settings-link"><a href="#" id="open-options">Réglages (délai, domaines exceptés)</a></p>
`;

const listEl = document.querySelector<HTMLUListElement>('#tab-list')!;
const emptyEl = document.querySelector<HTMLParagraphElement>('#empty-state')!;

document.querySelector<HTMLAnchorElement>('#open-options')!.addEventListener('click', (e) => {
  e.preventDefault();
  browser.runtime.openOptionsPage();
});

function statusLabel(tab: TabOverviewEntry): { text: string; className: string } {
  if (tab.active) return { text: 'Actif', className: 'active' };
  if (tab.discarded) return { text: 'Déchargé', className: 'discarded' };
  return { text: 'Chargé', className: '' };
}

function renderTabs(tabs: TabOverviewEntry[]): void {
  listEl.innerHTML = '';
  emptyEl.hidden = tabs.length > 0;

  for (const tab of tabs) {
    const li = document.createElement('li');
    li.className = 'tab-row';

    const info = document.createElement('div');
    info.className = 'tab-info';

    const title = document.createElement('div');
    title.className = 'tab-title';
    title.textContent = tab.title;
    title.title = tab.url;

    const status = document.createElement('div');
    status.className = 'tab-status';
    const { text, className } = statusLabel(tab);
    status.innerHTML = `<span class="badge ${className}">${text}</span>${
      tab.excepted ? ' <span class="badge excepted">Exception</span>' : ''
    }`;

    info.append(title, status);

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'toggle-exception';
    toggleBtn.dataset.excepted = String(tab.excepted);
    toggleBtn.textContent = tab.excepted ? 'Ne plus garder actif' : 'Garder actif';
    toggleBtn.disabled = tab.hostname == null;
    toggleBtn.addEventListener('click', () => toggleException(tab.id));

    li.append(info, toggleBtn);
    listEl.append(li);
  }
}

async function loadTabs(): Promise<void> {
  const message: ExtensionMessage = { type: 'get-tabs-overview' };
  const tabs = (await browser.runtime.sendMessage(message)) as TabOverviewEntry[];
  renderTabs(tabs ?? []);
}

async function toggleException(tabId: number): Promise<void> {
  const message: ExtensionMessage = { type: 'toggle-exception', tabId };
  await browser.runtime.sendMessage(message);
  await loadTabs();
}

void loadTabs();
