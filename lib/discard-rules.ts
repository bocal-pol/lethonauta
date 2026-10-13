import type { TabState } from '@/lib/session-state';

/** Sous-ensemble de Browser.tabs.Tab utile à la règle d'éligibilité — garde la fonction pure et testable sans mock du navigateur. */
export interface DiscardableTab {
  active: boolean;
  discarded?: boolean;
  url?: string;
}

export function getHostname(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

export function isExceptedDomain(url: string | undefined, exceptionDomains: string[]): boolean {
  const hostname = getHostname(url);
  return hostname != null && exceptionDomains.includes(hostname);
}

/**
 * Un onglet actif ne peut de toute façon jamais être déchargé par
 * chrome.tabs.discard() — cette règle encode les exceptions qui s'ajoutent
 * par-dessus cette contrainte native : domaine excepté, formulaire en cours
 * de saisie, téléchargement en cours.
 */
export function isDiscardEligible(params: {
  tab: DiscardableTab;
  tabState: TabState;
  exceptionDomains: string[];
}): boolean {
  const { tab, tabState, exceptionDomains } = params;
  if (tab.active) return false;
  if (tab.discarded) return false;
  if (isExceptedDomain(tab.url, exceptionDomains)) return false;
  if (tabState.formDirty) return false;
  if (tabState.downloadInProgress) return false;
  return true;
}

/**
 * delayMinutes <= 0 veut dire "immédiat" : dès qu'un onglet a une date de
 * mise en arrière-plan, le délai est considéré atteint.
 */
export function hasPassedDelay(tabState: TabState, delayMinutes: number, now: number): boolean {
  if (tabState.becameInactiveAt == null) return false;
  if (delayMinutes <= 0) return true;
  return now - tabState.becameInactiveAt >= delayMinutes * 60_000;
}
