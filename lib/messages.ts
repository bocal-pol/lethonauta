/** Contrat de messages partagé entre le content script, le popup et le service worker. */

export interface TabOverviewEntry {
  id: number;
  title: string;
  url: string;
  windowId: number;
  active: boolean;
  discarded: boolean;
  excepted: boolean;
  hostname: string | null;
}

export type ExtensionMessage =
  | { type: 'form-dirty'; dirty: boolean }
  | { type: 'toggle-exception'; tabId: number }
  | { type: 'get-tabs-overview' };
