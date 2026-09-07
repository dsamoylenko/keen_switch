import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

export default defineManifest({
  manifest_version: 3,
  // Бренд не переводится: название должно совпадать во всех витринах Store.
  name: 'KeenSwitch',
  version: pkg.version,
  default_locale: 'en',
  description: '__MSG_appDesc__',
  icons: {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  },
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'KeenSwitch',
    default_icon: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
  },
  options_page: 'src/options/index.html',
  background: {
    service_worker: 'src/background.ts',
    type: 'module',
  },
  permissions: ['storage', 'declarativeNetRequestWithHostAccess'],
  // Конкретный origin роутера запрашивается в рантайме из Options page,
  // поэтому расширение не получает постоянного доступа ко всему вебу.
  optional_host_permissions: ['http://*/*', 'https://*/*'],
});
