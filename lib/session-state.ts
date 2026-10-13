import { storage } from '#imports';

/**
 * État volatile par onglet. Stocké dans chrome.storage.session : survit aux
 * redémarrages du service worker MV3 (contrairement à une variable JS en
 * mémoire), mais est perdu au redémarrage du navigateur — ce qui est le
 * comportement voulu, cet état n'a aucun sens après coup.
 */
export type TabState = {
  /** Timestamp de perte de visibilité, undefined si l'onglet est visible. */
  becameInactiveAt?: number;
  /** Mis à jour par les messages envoyés par le content script. */
  formDirty?: boolean;
  /** Mis à jour par les écouteurs chrome.downloads. */
  downloadInProgress?: boolean;
  /** Horodatage de départ du téléchargement — sert de garde-fou de péremption (voir STALE_DOWNLOAD_MS dans background.ts). */
  downloadStartedAt?: number;
};

const tabStatesItem = storage.defineItem<Record<number, TabState>>('session:tabStates', {
  fallback: {},
});

export async function getTabState(tabId: number): Promise<TabState> {
  const states = await tabStatesItem.getValue();
  return states[tabId] ?? {};
}

export async function getAllTabStates(): Promise<Record<number, TabState>> {
  return tabStatesItem.getValue();
}

export async function patchTabState(tabId: number, patch: Partial<TabState>): Promise<void> {
  const states = await tabStatesItem.getValue();
  states[tabId] = { ...states[tabId], ...patch };
  await tabStatesItem.setValue(states);
}

export async function clearTabState(tabId: number): Promise<void> {
  const states = await tabStatesItem.getValue();
  if (tabId in states) {
    delete states[tabId];
    await tabStatesItem.setValue(states);
  }
}

/** Applique plusieurs patches en une seule lecture/écriture — évite un aller-retour storage par onglet lors d'un balayage. */
export async function patchManyTabStates(
  patches: Record<number, Partial<TabState>>,
): Promise<void> {
  if (Object.keys(patches).length === 0) return;
  const states = await tabStatesItem.getValue();
  for (const [tabId, patch] of Object.entries(patches)) {
    states[Number(tabId)] = { ...states[Number(tabId)], ...patch };
  }
  await tabStatesItem.setValue(states);
}

/** Supprime les entrées dont l'onglet n'existe plus — nettoyage de sécurité en plus de tabs.onRemoved. */
export async function pruneTabStates(existingTabIds: Set<number>): Promise<void> {
  const states = await tabStatesItem.getValue();
  let changed = false;
  for (const tabId of Object.keys(states)) {
    if (!existingTabIds.has(Number(tabId))) {
      delete states[Number(tabId)];
      changed = true;
    }
  }
  if (changed) await tabStatesItem.setValue(states);
}
