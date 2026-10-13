import { storage } from '#imports';

/**
 * Réglages persistants, synchronisés entre postes via chrome.storage.sync.
 * Volume volontairement minime (un nombre + une liste de domaines) pour
 * rester sous les quotas de sync (~100 Ko / ~8 Ko par entrée).
 */
export const delayMinutesItem = storage.defineItem<number>('sync:delayMinutes', {
  fallback: 10,
});

export const exceptionDomainsItem = storage.defineItem<string[]>('sync:exceptionDomains', {
  fallback: [],
});

export async function isExceptionDomain(hostname: string | null): Promise<boolean> {
  if (!hostname) return false;
  const domains = await exceptionDomainsItem.getValue();
  return domains.includes(hostname);
}

export async function addExceptionDomain(hostname: string): Promise<void> {
  const domains = await exceptionDomainsItem.getValue();
  if (!domains.includes(hostname)) {
    await exceptionDomainsItem.setValue([...domains, hostname]);
  }
}

export async function removeExceptionDomain(hostname: string): Promise<void> {
  const domains = await exceptionDomainsItem.getValue();
  await exceptionDomainsItem.setValue(domains.filter((d) => d !== hostname));
}
