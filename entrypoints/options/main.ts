import './style.css';
import { delayMinutesItem, exceptionDomainsItem, addExceptionDomain, removeExceptionDomain } from '@/lib/storage';
import { getHostname } from '@/lib/discard-rules';

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <h1>Lethonauta</h1>

  <section>
    <h2>Délai avant déchargement</h2>
    <div class="field">
      <label for="delay-input">Minutes d'inactivité en arrière-plan avant déchargement</label>
      <input type="number" id="delay-input" min="0" step="1" />
      <span class="hint">0 = déchargement immédiat dès qu'un onglet n'est plus visible.</span>
    </div>
  </section>

  <section>
    <h2>Domaines exceptés (toujours gardés actifs)</h2>
    <ul class="domain-list" id="domain-list"></ul>
    <div class="add-domain">
      <input type="text" id="domain-input" placeholder="ex. mail.google.com" />
      <button id="add-domain-btn" type="button">Ajouter</button>
    </div>
    <p class="hint">
      Un onglet dont le domaine figure ici n'est jamais déchargé (ex. pour continuer à recevoir
      des notifications). S'ajoute aussi automatiquement via le clic droit « Garder cet onglet
      actif » ou le popup de l'extension.
    </p>
  </section>

  <p id="save-status" aria-live="polite"></p>
`;

const delayInput = document.querySelector<HTMLInputElement>('#delay-input')!;
const domainListEl = document.querySelector<HTMLUListElement>('#domain-list')!;
const domainInput = document.querySelector<HTMLInputElement>('#domain-input')!;
const addDomainBtn = document.querySelector<HTMLButtonElement>('#add-domain-btn')!;
const saveStatus = document.querySelector<HTMLParagraphElement>('#save-status')!;

function flashSaved(): void {
  saveStatus.textContent = 'Enregistré.';
  setTimeout(() => {
    saveStatus.textContent = '';
  }, 1500);
}

function normalizeDomain(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return getHostname(trimmed) ?? trimmed.toLowerCase();
}

function renderDomains(domains: string[]): void {
  domainListEl.innerHTML = '';
  for (const domain of domains) {
    const li = document.createElement('li');
    li.className = 'domain-row';

    const span = document.createElement('span');
    span.textContent = domain;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = 'Retirer';
    removeBtn.addEventListener('click', async () => {
      await removeExceptionDomain(domain);
      flashSaved();
    });

    li.append(span, removeBtn);
    domainListEl.append(li);
  }
}

delayInput.addEventListener('change', async () => {
  const value = Math.max(0, Math.floor(Number(delayInput.value) || 0));
  delayInput.value = String(value);
  await delayMinutesItem.setValue(value);
  flashSaved();
});

addDomainBtn.addEventListener('click', async () => {
  const hostname = normalizeDomain(domainInput.value);
  if (!hostname) return;
  await addExceptionDomain(hostname);
  domainInput.value = '';
  flashSaved();
});

domainInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addDomainBtn.click();
  }
});

// Reflète en direct tout changement externe (sync multi-poste, popup, menu contextuel).
delayMinutesItem.watch((value) => {
  delayInput.value = String(value);
});
exceptionDomainsItem.watch((domains) => {
  renderDomains(domains);
});

void (async () => {
  delayInput.value = String(await delayMinutesItem.getValue());
  renderDomains(await exceptionDomainsItem.getValue());
})();
