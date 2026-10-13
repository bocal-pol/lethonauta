import { browser } from '#imports';
import type { ExtensionMessage } from '@/lib/messages';

const DEBOUNCE_MS = 300;

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    let dirty = false;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;

    function notify(isDirty: boolean): void {
      if (dirty === isDirty) return;
      dirty = isDirty;
      const message: ExtensionMessage = { type: 'form-dirty', dirty: isDirty };
      browser.runtime.sendMessage(message).catch(() => {
        // Le service worker peut être endormi lors de l'envoi — sans conséquence,
        // le prochain changement réessaiera.
      });
    }

    function scheduleDirty(): void {
      if (debounceTimer != null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => notify(true), DEBOUNCE_MS);
    }

    // Capture (pas bubble) pour attraper les champs dans des shadow DOM/iframes du même document.
    // Pas de listener beforeunload ici : cela altérerait le comportement natif de la page au
    // changement d'onglet/fermeture (cf. plan — décision volontaire).
    document.addEventListener('input', scheduleDirty, { capture: true, passive: true });
    document.addEventListener('change', scheduleDirty, { capture: true, passive: true });
    document.addEventListener(
      'submit',
      () => {
        if (debounceTimer != null) clearTimeout(debounceTimer);
        notify(false);
      },
      { capture: true },
    );
  },
});
