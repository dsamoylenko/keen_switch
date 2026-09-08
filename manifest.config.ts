import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

export function createManifest(mode: string) {
  const isRelease = mode === 'release';
  // Бренд не переводится: имя должно совпадать во всех витринах Store.
  const name = isRelease ? 'KeenSwitch' : 'KeenSwitch Dev';
  const iconDir = isRelease ? 'icons' : 'icons-dev';
  const icons = {
    16: `${iconDir}/icon-16.png`,
    32: `${iconDir}/icon-32.png`,
    48: `${iconDir}/icon-48.png`,
    128: `${iconDir}/icon-128.png`,
  };

  return defineManifest({
    manifest_version: 3,
    name,
    version: pkg.version,
    default_locale: 'en',
    description: '__MSG_appDesc__',
    icons,
    action: {
      default_popup: 'src/popup/index.html',
      default_title: name,
      default_icon: icons,
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
}
