/**
 * Чистая логика списка устройств для выпадающего списка в попапе.
 *
 * Вынесена из UI отдельным модулем: правила «кого показывать» и «в каком
 * порядке» проверяются юнит-тестами без DOM и без роутера.
 */

import type { HostSummary } from './keenetic';

export type DeviceKind =
  | 'phone'
  | 'tablet'
  | 'laptop'
  | 'tv'
  | 'console'
  | 'printer'
  | 'computer'
  | 'unknown';

/**
 * Порядок категорий важен: проверяются сверху вниз, побеждает первое
 * совпадение. Только английские ключевые слова — см. дизайн-спеку.
 */
const KIND_KEYWORDS: readonly (readonly [DeviceKind, readonly string[]])[] = [
  ['phone', ['iphone', 'android', 'galaxy', 'pixel', 'xiaomi', 'redmi', 'poco', 'huawei', 'honor', 'oneplus', 'realme', 'oppo', 'vivo']],
  ['tablet', ['ipad', 'tablet', 'matepad', 'tab']],
  ['laptop', ['macbook', 'notebook', 'thinkpad', 'laptop']],
  ['tv', ['smart-tv', 'smarttv', 'android tv', 'apple tv', 'chromecast']],
  ['console', ['playstation', 'xbox', 'nintendo', 'switch', 'ps4', 'ps5']],
  ['printer', ['printer']],
  ['computer', ['pc', 'desktop', 'imac']],
];

/** Угадывает тип устройства по имени хоста — для выбора иконки в попапе. */
export function guessDeviceKind(label: string): DeviceKind {
  const value = label.toLowerCase();
  for (const [kind, keywords] of KIND_KEYWORDS) {
    if (keywords.some((keyword) => value.includes(keyword))) return kind;
  }
  return 'unknown';
}

export interface DeviceOption extends HostSummary {
  /** Отмечено звездой — попадает в верхнюю группу списка. */
  favorite: boolean;
  /** Это устройство глазами роутера (RCI `whoami`). */
  self: boolean;
}

/**
 * Кандидаты для выбора: активные устройства плюс само выбранное.
 *
 * Выбранное добавляем всегда, даже если оно ушло в офлайн: иначе в свёрнутом
 * виде попап показывал бы устройство, которого нет в его же списке.
 */
export function selectableHosts(hosts: HostSummary[], selectedMac: string): HostSummary[] {
  return hosts.filter((host) => host.active || host.mac === selectedMac);
}

/**
 * Делит список на «Избранные» и «Устройства», сохраняя порядок из `parseHosts`
 * (активные выше, дальше по алфавиту) и поднимая текущее устройство в начало
 * своей группы.
 */
export function groupDevices(
  hosts: HostSummary[],
  favorites: string[],
  whoamiMac: string,
): { favorites: DeviceOption[]; others: DeviceOption[] } {
  const options: DeviceOption[] = hosts.map((host) => ({
    ...host,
    favorite: favorites.includes(host.mac),
    self: host.mac.length > 0 && host.mac === whoamiMac,
  }));

  const promoteSelf = (group: DeviceOption[]): DeviceOption[] => [
    ...group.filter((option) => option.self),
    ...group.filter((option) => !option.self),
  ];

  return {
    favorites: promoteSelf(options.filter((option) => option.favorite)),
    others: promoteSelf(options.filter((option) => !option.favorite)),
  };
}
