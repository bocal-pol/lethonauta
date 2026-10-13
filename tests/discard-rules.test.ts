import { describe, it, expect } from 'vitest';
import {
  getHostname,
  isExceptedDomain,
  isDiscardEligible,
  hasPassedDelay,
  type DiscardableTab,
} from '@/lib/discard-rules';
import type { TabState } from '@/lib/session-state';

function tab(overrides: Partial<DiscardableTab> = {}): DiscardableTab {
  return { active: false, discarded: false, url: 'https://example.com/page', ...overrides };
}

function state(overrides: Partial<TabState> = {}): TabState {
  return { ...overrides };
}

describe('getHostname', () => {
  it('extrait le hostname d’une URL valide', () => {
    expect(getHostname('https://mail.google.com/mail/u/0')).toBe('mail.google.com');
  });

  it('retourne null pour une URL invalide ou absente', () => {
    expect(getHostname('not a url')).toBeNull();
    expect(getHostname(undefined)).toBeNull();
    expect(getHostname('')).toBeNull();
  });
});

describe('isExceptedDomain', () => {
  it('reconnaît un domaine présent dans la liste', () => {
    expect(isExceptedDomain('https://mail.google.com/x', ['mail.google.com'])).toBe(true);
  });

  it('ignore un domaine absent de la liste', () => {
    expect(isExceptedDomain('https://example.com', ['mail.google.com'])).toBe(false);
  });
});

describe('hasPassedDelay', () => {
  const now = 1_000_000;

  it('retourne false si l’onglet est visible (becameInactiveAt non défini)', () => {
    expect(hasPassedDelay(state(), 10, now)).toBe(false);
  });

  it('délai = 0 : atteint dès que becameInactiveAt est défini', () => {
    expect(hasPassedDelay(state({ becameInactiveAt: now }), 0, now)).toBe(true);
  });

  it('délai non atteint', () => {
    const becameInactiveAt = now - 5 * 60_000; // 5 min
    expect(hasPassedDelay(state({ becameInactiveAt }), 10, now)).toBe(false);
  });

  it('délai atteint', () => {
    const becameInactiveAt = now - 10 * 60_000; // 10 min
    expect(hasPassedDelay(state({ becameInactiveAt }), 10, now)).toBe(true);
  });
});

describe('isDiscardEligible', () => {
  it('refuse un onglet actif', () => {
    expect(
      isDiscardEligible({ tab: tab({ active: true }), tabState: state(), exceptionDomains: [] }),
    ).toBe(false);
  });

  it('refuse un onglet déjà déchargé', () => {
    expect(
      isDiscardEligible({ tab: tab({ discarded: true }), tabState: state(), exceptionDomains: [] }),
    ).toBe(false);
  });

  it('refuse un domaine excepté', () => {
    expect(
      isDiscardEligible({
        tab: tab({ url: 'https://mail.google.com/mail' }),
        tabState: state(),
        exceptionDomains: ['mail.google.com'],
      }),
    ).toBe(false);
  });

  it('refuse un formulaire en cours de saisie', () => {
    expect(
      isDiscardEligible({ tab: tab(), tabState: state({ formDirty: true }), exceptionDomains: [] }),
    ).toBe(false);
  });

  it('refuse un téléchargement en cours', () => {
    expect(
      isDiscardEligible({
        tab: tab(),
        tabState: state({ downloadInProgress: true }),
        exceptionDomains: [],
      }),
    ).toBe(false);
  });

  it('accepte un onglet inactif sans exception ni protection', () => {
    expect(isDiscardEligible({ tab: tab(), tabState: state(), exceptionDomains: [] })).toBe(true);
  });
});
