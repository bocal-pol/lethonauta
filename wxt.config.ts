import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: 'Lethonauta',
    description:
      "Décharge automatiquement de la mémoire les onglets non visibles après un délai réglable, avec des exceptions persistantes par domaine.",
    permissions: ['tabs', 'storage', 'alarms', 'contextMenus', 'downloads', 'scripting'],
    host_permissions: ['<all_urls>'],
  },
});
